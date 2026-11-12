import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { createApplication } from "../server/application";
import { localEnabled, localFixture } from "./local.fixture";
import type { TestPlan } from "../test-plans";

const samplePlan: TestPlan = {
  cases: [
    {
      title: "Filter survives reload",
      kind: "happy",
      steps: ["Select High", "Reload the page"],
      expected: "High is still selected.",
    },
    {
      title: "Maximum length is accepted",
      kind: "edge",
      preconditions: "Signed in as a member",
      steps: ["Enter 160 characters"],
      expected: "The value is stored unchanged.",
    },
  ],
};

describe.skipIf(!localEnabled)("developer test plan interface", () => {
  let fixture: ReturnType<typeof localFixture>;
  afterEach(async () => {
    await fixture?.cleanup();
  });

  // One published ticket in an organisation holding a PM author, a developer
  // member and an unrelated outsider.
  async function published(name: string) {
    fixture = localFixture();
    const pm = await fixture.actor("PM");
    const developer = await fixture.actor("Developer");
    const outsider = await fixture.actor("Developer");
    const org = (await pm.client.rpc("create_organisation", { organisation_name: name })).data;
    await pm.client.rpc("invite_member", { target_org: org, target_email: developer.email });
    await developer.client.rpc("respond_invitation", {
      invitation_id: (await developer.client.rpc("list_invitations")).data[0].id,
      decision: "accept",
    });
    const ticket = (await pm.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
    const content = {
      title: "Remember list filter",
      description: "## Desired behaviour\n\nPreserve the filter on reload.",
    };
    const saved = await pm.client.rpc("publish_request", {
      target_org: org,
      request_id: ticket.id,
      expected_revision: ticket.revision,
      content,
      acknowledged: true,
      first_submission: true,
    });
    expect(saved.error).toBeNull();
    return { pm, developer, outsider, org, ticket, content, revision: saved.data.revision };
  }

  it("admits only a worker-dispatched developer turn and keeps generations private to their developer", async () => {
    const { pm, developer, outsider, org, ticket, content, revision } = await published("Worker admission");
    const args = {
      target_org: org,
      request_id: ticket.id,
      actor_id: developer.id,
      turn_key: randomUUID(),
      base_revision: revision,
      input_fields: content,
      focus_note: null,
      retry_failed: false,
    };

    // A browser session cannot admit a turn even for itself.
    expect((await developer.client.rpc("begin_test_plan_turn", args)).error).not.toBeNull();
    // The Product Manager author has the PM feature, not this one.
    expect((await fixture.admin.rpc("begin_test_plan_turn", { ...args, actor_id: pm.id })).error?.code).toBe("42501");
    expect((await fixture.admin.rpc("begin_test_plan_turn", { ...args, actor_id: outsider.id })).error?.code).toBe(
      "42501",
    );

    const admitted = await fixture.admin.rpc("begin_test_plan_turn", args);
    expect(admitted.error).toBeNull();
    expect(admitted.data.dispatch).toBe(true);
    // The same key replays without dispatching a second provider call.
    expect((await fixture.admin.rpc("begin_test_plan_turn", args)).data).toMatchObject({
      dispatch: false,
      turn: { id: admitted.data.turn.id },
    });
    // One running generation per developer.
    expect((await fixture.admin.rpc("begin_test_plan_turn", { ...args, turn_key: randomUUID() })).error?.code).toBe(
      "PT429",
    );

    // An older worker generation cannot overwrite a newer result.
    expect(
      (
        await fixture.admin.rpc("finish_test_plan_turn", {
          target_org: org,
          request_id: ticket.id,
          actor_id: developer.id,
          turn_id: admitted.data.turn.id,
          worker_generation: 99,
          human_reply: "Two cases.",
          generated_plan: samplePlan,
          failure_code: null,
        })
      ).error,
    ).not.toBeNull();
    const completed = await fixture.admin.rpc("finish_test_plan_turn", {
      target_org: org,
      request_id: ticket.id,
      actor_id: developer.id,
      turn_id: admitted.data.turn.id,
      worker_generation: admitted.data.turn.generation,
      human_reply: "Two cases.",
      generated_plan: samplePlan,
      failure_code: null,
    });
    expect(completed.error).toBeNull();
    expect(completed.data).toMatchObject({ status: "completed", reply: "Two cases.", plan: samplePlan, focus: null });

    // The generating developer sees their own turn; the PM sees none of them.
    expect(
      (await developer.client.rpc("read_test_plan", { target_org: org, request_id: ticket.id })).data.turns,
    ).toHaveLength(1);
    expect((await pm.client.rpc("read_test_plan", { target_org: org, request_id: ticket.id })).data.turns).toEqual([]);
    expect((await pm.client.from("test_plan_turns").select("id")).data).toEqual([]);
    expect((await outsider.client.rpc("read_test_plan", { target_org: org, request_id: ticket.id })).error?.code).toBe(
      "42501",
    );
  });

  it("rejects a stored plan that breaks the shared caps, and a failure that carries a plan", async () => {
    const { developer, org, ticket, content, revision } = await published("Stored caps");
    const begin = async () =>
      (
        await fixture.admin.rpc("begin_test_plan_turn", {
          target_org: org,
          request_id: ticket.id,
          actor_id: developer.id,
          turn_key: randomUUID(),
          base_revision: revision,
          input_fields: content,
          focus_note: null,
          retry_failed: false,
        })
      ).data.turn;
    const finish = (
      turn: { id: string; generation: number },
      plan: unknown,
      failure: string | null = null,
      reply: string | null = "Cases.",
    ) =>
      fixture.admin.rpc("finish_test_plan_turn", {
        target_org: org,
        request_id: ticket.id,
        actor_id: developer.id,
        turn_id: turn.id,
        worker_generation: turn.generation,
        human_reply: failure === null ? reply : null,
        generated_plan: plan,
        failure_code: failure,
      });

    for (const plan of [
      { cases: [] },
      { cases: Array.from({ length: 13 }, () => samplePlan.cases[0]) },
      { cases: [{ ...samplePlan.cases[0], kind: "regression" }] },
      { cases: [{ ...samplePlan.cases[0], steps: [] }] },
      { cases: [{ ...samplePlan.cases[0], title: "   " }] },
      { cases: [{ ...samplePlan.cases[0], expected: "x".repeat(501) }] },
      { cases: [{ ...samplePlan.cases[0], severity: "high" }] },
      { cases: [{ title: "No steps key", kind: "happy", expected: "Something." }] },
      { cases: samplePlan.cases[0] },
    ]) {
      const turn = await begin();
      expect((await finish(turn, plan)).error?.code).toBe("22023");
      // The rejected turn is still running, so clear it before the next case.
      expect((await finish(turn, null, "invalid_output")).error).toBeNull();
    }
    // A failure must not carry output, and a success must carry a plan.
    const turn = await begin();
    expect((await finish(turn, samplePlan, "unavailable")).error?.code).toBe("22023");
    expect((await finish(turn, null, null)).error?.code).toBe("22023");
    expect((await finish(turn, null, "unavailable")).error).toBeNull();
    expect(
      (await developer.client.rpc("read_test_plan", { target_org: org, request_id: ticket.id })).data.saved,
    ).toBeNull();
  });

  it("shares a saved plan with the organisation and refuses one generated against older ticket content", async () => {
    const { pm, developer, outsider, org, ticket, content, revision } = await published("Saved plans");
    // Only a developer may save, and only a valid plan.
    expect(
      (
        await pm.client.rpc("save_test_plan", {
          target_org: org,
          request_id: ticket.id,
          plan: samplePlan,
          ticket_revision: revision,
          expected_plan_revision: null,
        })
      ).error?.code,
    ).toBe("42501");
    expect(
      (
        await outsider.client.rpc("save_test_plan", {
          target_org: org,
          request_id: ticket.id,
          plan: samplePlan,
          ticket_revision: revision,
          expected_plan_revision: null,
        })
      ).error?.code,
    ).toBe("42501");
    expect(
      (
        await developer.client.rpc("save_test_plan", {
          target_org: org,
          request_id: ticket.id,
          plan: { cases: [] },
          ticket_revision: revision,
          expected_plan_revision: null,
        })
      ).error?.code,
    ).toBe("22023");

    const saved = await developer.client.rpc("save_test_plan", {
      target_org: org,
      request_id: ticket.id,
      plan: samplePlan,
      ticket_revision: revision,
      expected_plan_revision: null,
    });
    expect(saved.error).toBeNull();
    expect(saved.data).toMatchObject({
      revision: 1,
      ticket_revision: revision,
      saved_by: developer.id,
      saved_by_username: developer.username,
      plan: samplePlan,
    });

    // A concurrent save that expects no stored plan loses rather than clobbering.
    expect(
      (
        await developer.client.rpc("save_test_plan", {
          target_org: org,
          request_id: ticket.id,
          plan: samplePlan,
          ticket_revision: revision,
          expected_plan_revision: null,
        })
      ).error?.code,
    ).toBe("P0001");
    const replaced = await developer.client.rpc("save_test_plan", {
      target_org: org,
      request_id: ticket.id,
      plan: { cases: [samplePlan.cases[1]] },
      ticket_revision: revision,
      expected_plan_revision: 1,
    });
    expect(replaced.error).toBeNull();
    expect(replaced.data.revision).toBe(2);

    // The PM sees the shared plan; the outsider sees nothing at all.
    expect(
      (await pm.client.rpc("read_test_plan", { target_org: org, request_id: ticket.id })).data.saved,
    ).toMatchObject({ revision: 2, saved_by_username: developer.username });
    expect((await outsider.client.from("ticket_test_plans").select("request_id")).data).toEqual([]);

    // Editing the ticket makes an older plan stale: saving it again is refused.
    const updated = await pm.client.rpc("publish_request", {
      target_org: org,
      request_id: ticket.id,
      expected_revision: revision,
      content: { ...content, description: content.description + "\n\nAlso preserve sort order." },
      acknowledged: true,
      first_submission: false,
    });
    expect(updated.error).toBeNull();
    expect(
      (
        await developer.client.rpc("save_test_plan", {
          target_org: org,
          request_id: ticket.id,
          plan: samplePlan,
          ticket_revision: revision,
          expected_plan_revision: 2,
        })
      ).error?.code,
    ).toBe("P0001");
    const current = await pm.client.rpc("read_test_plan", { target_org: org, request_id: ticket.id });
    expect(current.data.saved.ticket_revision).toBe(revision);
    expect(current.data.saved.ticket_revision).not.toBe(updated.data.revision);
  });

  it("refuses an unpublished draft and authorizes HTTP before reaching the provider", async () => {
    fixture = localFixture();
    const pm = await fixture.actor("PM");
    const developer = await fixture.actor("Developer");
    const outsider = await fixture.actor("Developer");
    const org = (await pm.client.rpc("create_organisation", { organisation_name: "Draft tickets" })).data;
    await pm.client.rpc("invite_member", { target_org: org, target_email: developer.email });
    await developer.client.rpc("respond_invitation", {
      invitation_id: (await developer.client.rpc("list_invitations")).data[0].id,
      decision: "accept",
    });
    const draft = (await pm.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
    const content = { title: "Private draft", description: "Not published yet." };
    expect(
      (
        await pm.client.rpc("save_draft", {
          target_org: org,
          request_id: draft.id,
          expected_revision: draft.revision,
          content,
        })
      ).error,
    ).toBeNull();

    // A private draft has no test plan surface at all.
    expect((await developer.client.rpc("read_test_plan", { target_org: org, request_id: draft.id })).error?.code).toBe(
      "42501",
    );
    expect(
      (
        await fixture.admin.rpc("begin_test_plan_turn", {
          target_org: org,
          request_id: draft.id,
          actor_id: developer.id,
          turn_key: randomUUID(),
          base_revision: 2,
          input_fields: content,
          focus_note: null,
          retry_failed: false,
        })
      ).error?.code,
    ).toBe("42501");

    let calls = 0;
    const dependencies = {
      worker: () => fixture.admin,
      provider: async () => {
        calls++;
        return { reply: "Two cases.", plan: samplePlan };
      },
    };
    const app = (actor: typeof pm) =>
      createApplication({ origin: "http://localhost:3000", client: () => actor.client, testPlans: dependencies });
    const path = (id: string) => `http://localhost:3000/api/organisations/${org}/requests/${id}/test-plan`;
    const post = (id: string, body: unknown) =>
      new Request(path(id), {
        method: "POST",
        headers: { origin: "http://localhost:3000", "content-type": "application/json" },
        body: JSON.stringify(body),
      });

    expect(
      (
        await app(developer)(
          post(draft.id, { key: randomUUID(), revision: 2, fields: content, focus: null, retry: false }),
        )
      ).status,
    ).toBe(403);
    expect(calls).toBe(0);

    const ticket = (await pm.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
    const live = { title: "Published ticket", description: "## Desired behaviour\n\nIt works." };
    const revision = (
      await pm.client.rpc("publish_request", {
        target_org: org,
        request_id: ticket.id,
        expected_revision: ticket.revision,
        content: live,
        acknowledged: true,
        first_submission: true,
      })
    ).data.revision;
    const body = { key: randomUUID(), revision, fields: live, focus: null, retry: false };

    expect((await app(outsider)(post(ticket.id, body))).status).toBe(403);
    expect((await app(pm)(post(ticket.id, body))).status).toBe(403);
    expect(calls).toBe(0);

    const generated = await app(developer)(post(ticket.id, body));
    expect(generated.status).toBe(200);
    expect((await generated.json()).turn).toMatchObject({
      status: "completed",
      plan: samplePlan,
      base_revision: revision,
    });
    expect(calls).toBe(1);
    // Replaying the same key returns the stored turn without a second call.
    expect((await app(developer)(post(ticket.id, body))).status).toBe(200);
    expect(calls).toBe(1);

    const save = (actor: typeof pm, payload: unknown) =>
      app(actor)(
        new Request(path(ticket.id), {
          method: "PUT",
          headers: { origin: "http://localhost:3000", "content-type": "application/json" },
          body: JSON.stringify(payload),
        }),
      );
    expect((await save(pm, { plan: samplePlan, ticketRevision: revision, planRevision: null })).status).toBe(403);
    const stored = await save(developer, { plan: samplePlan, ticketRevision: revision, planRevision: null });
    expect(stored.status).toBe(200);
    expect((await stored.json()).saved).toMatchObject({
      revision: 1,
      plan: samplePlan,
      saved_by_username: developer.username,
    });
    // The PM reads the shared plan over HTTP but sees no private generations.
    const pmView = await (await app(pm)(new Request(path(ticket.id)))).json();
    expect(pmView).toMatchObject({ saved: { revision: 1 }, turns: [] });
    // Saving a plan never edits the ticket itself.
    expect((await pm.client.rpc("read_request", { target_org: org, request_id: ticket.id })).data.fields).toEqual(live);
  });
});
