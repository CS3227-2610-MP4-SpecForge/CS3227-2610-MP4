import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { localEnabled, localFixture, localSql, resetLocalAiWindows, testAiLimits } from "./local.fixture";

// Site-wide, organisation and per-user daily AI limits and the SoC pause
// (workflow/specs/2026-11-13-site-wide-ai-limit.md). Seam: worker and session RPCs.
describe.skipIf(!localEnabled)("shared AI dispatch limits", () => {
  let fixture: ReturnType<typeof localFixture>;
  beforeEach(() => resetLocalAiWindows());
  afterEach(async () => {
    await fixture?.cleanup();
    resetLocalAiWindows();
  });

  type Actor = Awaited<ReturnType<ReturnType<typeof localFixture>["actor"]>>;
  type Turn = { id: string; generation: number; request_id: string };

  async function join(admin: Actor, org: string, member: Actor) {
    await admin.client.rpc("invite_member", { target_org: org, target_email: member.email });
    const invitation = (await member.client.rpc("list_invitations")).data[0].id;
    await member.client.rpc("respond_invitation", { invitation_id: invitation, decision: "accept" });
  }

  // Organisation A: an admin PM, a second (non-admin) PM and a Developer.
  // Organisation B: its own admin PM. Each PM owns one draft; A has one published ticket.
  async function setup() {
    fixture = localFixture();
    const pm = await fixture.actor("PM");
    const pm2 = await fixture.actor("PM");
    const developer = await fixture.actor("Developer");
    const otherPm = await fixture.actor("PM");
    const org = (await pm.client.rpc("create_organisation", { organisation_name: "Limits A" })).data;
    const otherOrg = (await otherPm.client.rpc("create_organisation", { organisation_name: "Limits B" })).data;
    await join(pm, org, pm2);
    await join(pm, org, developer);
    const draft = async (actor: Actor, target: string) =>
      (await actor.client.rpc("create_request", { target_org: target, creation_key: randomUUID() })).data;
    const tasks = new Map<string, { org: string; id: string }>();
    for (const [actor, target] of [
      [pm, org],
      [pm2, org],
      [otherPm, otherOrg],
    ] as const)
      tasks.set(actor.id, { org: target, id: (await draft(actor, target)).id });
    const content = { title: "Remember list filter", description: "Preserve the filter on reload." };
    const published = await draft(pm, org);
    const saved = await pm.client.rpc("publish_request", {
      target_org: org,
      request_id: published.id,
      expected_revision: published.revision,
      content,
      acknowledged: true,
      first_submission: true,
    });
    expect(saved.error).toBeNull();

    const chat = (actor: Actor, limits: object = testAiLimits, extra: Record<string, unknown> = {}) => {
      const task = tasks.get(actor.id)!;
      return fixture.admin.rpc("begin_chat_turn", {
        target_org: task.org,
        request_id: task.id,
        actor_id: actor.id,
        turn_key: randomUUID(),
        base_revision: 1,
        input_fields: { title: "", description: "" },
        user_message: `Clarify ${randomUUID()}`,
        retry_failed: false,
        ai_limits: limits,
        ...extra,
      });
    };
    const finishChat = (actor: Actor, turn: Turn, extra: Record<string, unknown> = {}) =>
      fixture.admin.rpc("finish_chat_turn", {
        target_org: tasks.get(actor.id)!.org,
        request_id: turn.request_id,
        actor_id: actor.id,
        turn_id: turn.id,
        worker_generation: turn.generation,
        human_reply: "A reply",
        task_proposal: null,
        failure_code: null,
        ...extra,
      });
    const plan = (limits: object = testAiLimits) =>
      fixture.admin.rpc("begin_test_plan_turn", {
        target_org: org,
        request_id: published.id,
        actor_id: developer.id,
        turn_key: randomUUID(),
        base_revision: saved.data.revision,
        input_fields: content,
        focus_note: null,
        retry_failed: false,
        ai_limits: limits,
      });
    const finishPlan = (turn: Turn, extra: Record<string, unknown> = {}) =>
      fixture.admin.rpc("finish_test_plan_turn", {
        target_org: org,
        request_id: published.id,
        actor_id: developer.id,
        turn_id: turn.id,
        worker_generation: turn.generation,
        human_reply: null,
        generated_plan: null,
        failure_code: "unavailable",
        ...extra,
      });
    // One completed chat dispatch.
    const spend = async (actor: Actor, limits: object = testAiLimits) => {
      const admitted = await chat(actor, limits);
      expect(admitted.error).toBeNull();
      expect((await finishChat(actor, admitted.data.turn)).error).toBeNull();
    };
    const daily = async (actor: Actor) => (await actor.client.rpc("read_ai_usage")).data.daily_used as number;
    const site = (kind: "minute" | "day") =>
      Number(
        localSql(
          `select coalesce(sum(used),0) from private.ai_usage_windows where scope = 'site' and window_kind = '${kind}'`,
        ),
      );
    return { pm, pm2, developer, otherPm, org, otherOrg, chat, finishChat, plan, finishPlan, spend, daily, site };
  }
  const limits = (overrides: Partial<typeof testAiLimits>) => ({ ...testAiLimits, ...overrides });
  const blocked = (
    result: { error: { code?: string; message?: string; details?: string } | null },
    message: string,
  ) => {
    expect(result.error?.code).toBe("PT429");
    expect(result.error?.message).toBe(message);
    expect(Number(result.error?.details)).toBeGreaterThanOrEqual(1);
    return Number(result.error?.details);
  };

  it("blocks a second concurrent dispatch from another account and feature, and ignores expired leases", async () => {
    const { pm, chat, finishChat, plan } = await setup();
    const one = limits({ concurrent: 1 });
    const running = await chat(pm, one);
    expect(running.error).toBeNull();
    expect(blocked(await plan(one), "AI site limit reached")).toBe(15);
    expect((await finishChat(pm, running.data.turn)).error).toBeNull();
    const again = await chat(pm, one);
    await fixture.admin.from("chat_turns").update({ lease_until: "2020-01-01T00:00:00Z" }).eq("id", again.data.turn.id);
    expect((await plan(one)).error).toBeNull();
  });

  it("admits exactly the cap when accounts and features race, without deadlock", async () => {
    const { pm, pm2, otherPm, chat, plan, site } = await setup();
    const two = limits({ concurrent: 2 });
    const results = await Promise.all([chat(pm, two), chat(pm2, two), chat(otherPm, two), plan(two)]);
    expect(results.filter(result => result.error === null)).toHaveLength(2);
    for (const result of results.filter(result => result.error !== null))
      expect(result.error).toMatchObject({ code: "PT429", message: "AI site limit reached" });
    expect(site("minute")).toBe(2);
  });

  it("caps dispatches per clock minute and per Singapore day across accounts and features", async () => {
    const { pm, pm2, otherPm, spend, plan, finishPlan, chat } = await setup();
    const perMinute = limits({ per_minute: 2 });
    await spend(pm, perMinute);
    expect((await finishPlan((await plan(perMinute)).data.turn)).error).toBeNull();
    expect(blocked(await chat(pm2, perMinute), "AI site limit reached")).toBeLessThanOrEqual(60);

    resetLocalAiWindows();
    const perDay = limits({ site_per_day: 3, org_per_day: 3, user_per_day: 3 });
    await spend(pm, perDay);
    await spend(otherPm, perDay);
    expect((await finishPlan((await plan(perDay)).data.turn)).error).toBeNull();
    expect(blocked(await chat(pm, perDay), "AI site daily limit reached")).toBeGreaterThan(60);
  });

  it("caps one organisation per day while another organisation can still dispatch", async () => {
    const { pm, pm2, otherPm, spend, chat } = await setup();
    const perOrg = limits({ org_per_day: 2, user_per_day: 1 });
    await spend(pm, perOrg);
    await spend(pm2, perOrg);
    expect((await chat(otherPm, perOrg)).error).toBeNull();
    expect(
      blocked(await chat(pm, limits({ org_per_day: 2, user_per_day: 2 })), "AI organisation limit reached"),
    ).toBeGreaterThan(60);
  });

  it("caps one user per day across features while another member can dispatch", async () => {
    const { pm, pm2, spend, chat, daily } = await setup();
    const perUser = limits({ user_per_day: 1 });
    await spend(pm, perUser);
    expect(await daily(pm)).toBe(1);
    expect(blocked(await chat(pm, perUser), "AI user daily limit reached")).toBeGreaterThan(60);
    expect((await chat(pm2, perUser)).error).toBeNull();
  });

  it("changes nothing for a blocked request", async () => {
    const { pm, spend, chat, daily, site } = await setup();
    const perUser = limits({ user_per_day: 1 });
    await spend(pm, perUser);
    const before = { usage: (await pm.client.rpc("read_ai_usage")).data, minute: site("minute"), day: site("day") };
    const rows = Number(localSql(`select count(*) from public.chat_turns where author_id = '${pm.id}'`));
    blocked(await chat(pm, perUser), "AI user daily limit reached");
    expect((await pm.client.rpc("read_ai_usage")).data).toEqual(before.usage);
    expect([site("minute"), site("day"), await daily(pm)]).toEqual([before.minute, before.day, 1]);
    expect(Number(localSql(`select count(*) from public.chat_turns where author_id = '${pm.id}'`))).toBe(rows);
  });

  it("refunds a failure to the user's day but not to the organisation or site, and only on the same day", async () => {
    const { pm, developer, chat, finishChat, plan, finishPlan, daily, site, org } = await setup();
    const turn = (await chat(pm)).data.turn;
    expect((await finishChat(pm, turn, { human_reply: null, failure_code: "unavailable" })).error).toBeNull();
    expect(await daily(pm)).toBe(0);
    expect(site("day")).toBe(1);
    expect((await pm.client.rpc("read_organisation_ai_usage", { target_org: org })).data.used).toBe(1);

    const generation = (await plan()).data.turn;
    expect(await daily(developer)).toBe(1);
    expect((await finishPlan(generation)).error).toBeNull();
    expect(await daily(developer)).toBe(0);

    const late = (await chat(pm)).data.turn;
    localSql(`update public.chat_turns set charged_at = now() - interval '1 day' where id = '${late.id}'`);
    expect((await finishChat(pm, late, { human_reply: null, failure_code: "unavailable" })).error).toBeNull();
    expect(await daily(pm)).toBe(1);
    expect(site("day")).toBe(3);
  });

  it("does not count a replay or an identical completed request", async () => {
    const { pm, chat, finishChat, site } = await setup();
    const key = randomUUID();
    const first = await chat(pm, testAiLimits, { turn_key: key, user_message: "Same" });
    expect((await chat(pm, testAiLimits, { turn_key: key, user_message: "Same" })).data.dispatch).toBe(false);
    expect((await finishChat(pm, first.data.turn)).error).toBeNull();
    expect((await chat(pm, testAiLimits, { user_message: "Same" })).data.dispatch).toBe(false);
    expect(site("minute")).toBe(1);
  });

  it("pauses every dispatch after SoC returns 429 or 503, never shortens, and rejects other pauses", async () => {
    const { pm, pm2, chat, finishChat, plan } = await setup();
    const upstream = (status: number) => ({
      human_reply: null,
      failure_code: "upstream_http",
      failure_diagnostic: { source: "upstream_http", elapsed_ms: 5, http_status: status },
    });
    for (const [extra, seconds] of [
      [upstream(429), 4],
      [upstream(429), 601],
      [upstream(502), 60],
      [{}, 60],
    ] as const) {
      const turn = (await chat(pm)).data.turn;
      const refused = await finishChat(pm, turn, { ...extra, pause_seconds: seconds });
      expect(refused.error?.code).toBe("22023");
      await fixture.admin.from("chat_turns").update({ lease_until: "2020-01-01T00:00:00Z" }).eq("id", turn.id);
    }
    const turn = (await chat(pm)).data.turn;
    expect((await finishChat(pm, turn, { ...upstream(429), pause_seconds: 120 })).error).toBeNull();
    const wait = blocked(await chat(pm2), "AI site limit reached");
    expect(wait).toBeGreaterThan(100);
    expect(wait).toBeLessThanOrEqual(120);
    blocked(await plan(), "AI site limit reached");
    // A later, shorter 503 pause does not shorten the current one.
    localSql("update private.ai_soc_pause set paused_until = now() - interval '1 second'");
    const shorter = (await chat(pm)).data.turn;
    localSql("update private.ai_soc_pause set paused_until = now() + interval '300 seconds'");
    expect((await finishChat(pm, shorter, { ...upstream(503), pause_seconds: 10 })).error).toBeNull();
    expect(blocked(await chat(pm2), "AI site limit reached")).toBeGreaterThan(290);
  });

  it("rejects missing, zero, oversized and disordered limits", async () => {
    const { pm, chat, plan } = await setup();
    for (const bad of [
      null,
      limits({ concurrent: 0 }),
      limits({ concurrent: 9 }),
      limits({ per_minute: 61 }),
      limits({ site_per_day: 1001 }),
      limits({ user_per_day: 501, org_per_day: 500 }),
      limits({ org_per_day: 500, site_per_day: 400 }),
      { ...testAiLimits, extra: 1 },
      { ...testAiLimits, concurrent: 2.5 },
    ]) {
      expect((await chat(pm, bad as object)).error?.code).toBe("22023");
      expect((await plan(bad as object)).error?.code).toBe("22023");
    }
  });

  it("keeps the windows, pause and admission functions away from browser sessions", async () => {
    const { pm, chat } = await setup();
    for (const table of ["private.ai_usage_windows", "private.ai_soc_pause"])
      for (const role of ["anon", "authenticated", "service_role"])
        expect(localSql(`select has_table_privilege('${role}', '${table}', 'select,insert,update,delete')`)).toBe("f");
    expect(
      localSql(
        "select string_agg(proname || ':' || count, ',' order by proname) from (select proname, count(*) from pg_proc join pg_namespace n on n.oid = pronamespace where nspname = 'public' and proname in ('begin_chat_turn','finish_chat_turn','begin_test_plan_turn','finish_test_plan_turn') group by proname) f",
      ),
    ).toBe("begin_chat_turn:1,begin_test_plan_turn:1,finish_chat_turn:1,finish_test_plan_turn:1");
    expect(
      localSql(
        "select string_agg(p.oid::regprocedure::text, ',') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname in ('public','private') and (p.proname in ('begin_chat_turn','finish_chat_turn','begin_test_plan_turn','finish_test_plan_turn') or p.proname like '%ai%dispatch%' or p.proname in ('refund_ai_user_day','refund_test_plan_charge','valid_ai_limits','valid_pause','ai_window_used','ai_window_add','sg_day_start')) and (has_function_privilege('anon', p.oid, 'execute') or has_function_privilege('authenticated', p.oid, 'execute'))",
      ),
    ).toBe("");
    const turn = await chat(pm);
    expect(turn.error).toBeNull();
    const session = await pm.client.rpc("finish_chat_turn", {
      target_org: turn.data.turn.organisation_id,
      request_id: turn.data.turn.request_id,
      actor_id: pm.id,
      turn_id: turn.data.turn.id,
      worker_generation: 1,
      human_reply: null,
      task_proposal: null,
      failure_code: "upstream_http",
      failure_diagnostic: { source: "upstream_http", elapsed_ms: 5, http_status: 429 },
      pause_seconds: 600,
    });
    expect(session.error).not.toBeNull();
    expect(localSql("select count(*) from private.ai_soc_pause")).toBe("0");
  });

  it("shows an organisation's daily total to its verified admins only", async () => {
    const { pm, pm2, developer, otherPm, org, otherOrg, spend } = await setup();
    await spend(pm2);
    expect((await pm.client.rpc("read_organisation_ai_usage", { target_org: org })).data).toMatchObject({ used: 1 });
    expect((await otherPm.client.rpc("read_organisation_ai_usage", { target_org: otherOrg })).data.used).toBe(0);
    const refusals = [
      await pm2.client.rpc("read_organisation_ai_usage", { target_org: org }),
      await developer.client.rpc("read_organisation_ai_usage", { target_org: org }),
      await otherPm.client.rpc("read_organisation_ai_usage", { target_org: org }),
      await pm.client.rpc("read_organisation_ai_usage", { target_org: randomUUID() }),
    ];
    // The same admin, once their email is no longer verified.
    localSql(`update auth.users set email_confirmed_at = null where id = '${pm.id}'`);
    refusals.push(await fixture.unverifiedSession(pm.id).rpc("read_organisation_ai_usage", { target_org: org }));
    for (const refused of refusals) {
      expect(refused.data).toBeNull();
      expect(refused.error?.code).toBe("42501");
      expect(refused.error?.message).toBe("Not allowed");
    }
    const anonymous = await fixture.client().rpc("read_organisation_ai_usage", { target_org: org });
    expect(anonymous.data).toBeNull();
    expect(anonymous.error).not.toBeNull();
  });
});
