import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { localEnabled, localFixture, resetLocalAiWindows, testAiLimits } from "./local.fixture";

// PM assistant redesign: intents, visible usage with refunds, dedupe and the
// bounded history the worker receives. Seam: worker/session RPCs.
describe.skipIf(!localEnabled)("PM assistant usage and context", () => {
  let fixture: ReturnType<typeof localFixture>;
  beforeEach(() => resetLocalAiWindows());
  afterEach(async () => {
    await fixture?.cleanup();
  });
  async function setup() {
    fixture = localFixture();
    const pm = await fixture.actor("PM");
    const org = (await pm.client.rpc("create_organisation", { organisation_name: "Assistant" })).data;
    const task = (await pm.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
    const fields = { title: "", description: "" };
    const begin = (extra: Record<string, unknown> = {}) =>
      fixture.admin.rpc("begin_chat_turn", {
        target_org: org,
        request_id: task.id,
        actor_id: pm.id,
        turn_key: randomUUID(),
        base_revision: 1,
        input_fields: fields,
        user_message: "Clarify",
        retry_failed: false,
        ai_limits: testAiLimits,
        ...extra,
      });
    const finish = (turn: { id: string; generation: number }, extra: Record<string, unknown> = {}) =>
      fixture.admin.rpc("finish_chat_turn", {
        target_org: org,
        request_id: task.id,
        actor_id: pm.id,
        turn_id: turn.id,
        worker_generation: turn.generation,
        human_reply: "A reply",
        task_proposal: null,
        failure_code: null,
        ...extra,
      });
    const usage = async () =>
      (await pm.client.rpc("read_ai_usage")).data as { remaining: number; limit: number; resets_at: string | null };
    return { pm, org, task, fields, begin, finish, usage };
  }

  it("shows full usage before any request and charges an admitted request", async () => {
    const { begin, finish, usage } = await setup();
    expect(await usage()).toMatchObject({ remaining: 20, limit: 20, resets_at: null, daily_used: 0 });
    const turn = (await begin()).data.turn;
    expect((await usage()).remaining).toBe(19);
    expect((await finish(turn)).error).toBeNull();
    const after = await usage();
    expect(after.remaining).toBe(19);
    expect(Date.parse(after.resets_at!)).toBeGreaterThan(Date.now());
  });

  it("refunds a failed request once and never refunds a charge from an earlier window", async () => {
    const { begin, finish, usage } = await setup();
    const failed = (await begin()).data.turn;
    expect(
      (
        await finish(failed, {
          human_reply: null,
          failure_code: "upstream_http",
          failure_diagnostic: { source: "upstream_http", elapsed_ms: 5, http_status: 502 },
        })
      ).error,
    ).toBeNull();
    expect((await usage()).remaining).toBe(20);
    const old = (await begin()).data.turn;
    expect(
      (await fixture.admin.from("chat_turns").update({ charged_at: "2020-01-01T00:00:00Z" }).eq("id", old.id)).error,
    ).toBeNull();
    expect((await finish(old, { human_reply: null, failure_code: "unavailable" })).error).toBeNull();
    expect((await usage()).remaining).toBe(19);
  });

  it("refunds an expired lease when it is marked interrupted", async () => {
    const { begin, usage } = await setup();
    const turn = (await begin()).data.turn;
    await fixture.admin.from("chat_turns").update({ lease_until: "2020-01-01T00:00:00Z" }).eq("id", turn.id);
    expect((await begin()).error).toBeNull();
    expect((await usage()).remaining).toBe(19);
  });

  it("caps admitted attempts at 40 per hour even when every attempt was refunded", async () => {
    const { begin, finish, usage } = await setup();
    for (let i = 0; i < 40; i++) {
      const admitted = await begin();
      expect(admitted.error).toBeNull();
      expect((await finish(admitted.data.turn, { human_reply: null, failure_code: "unavailable" })).error).toBeNull();
    }
    expect((await usage()).remaining).toBe(20);
    const blocked = await begin();
    expect(blocked.error?.code).toBe("PT429");
    expect(blocked.error?.message).toBe("AI attempt limit reached");
  });

  it("blocks the 21st charged request with a distinct usage message", async () => {
    const { begin, finish } = await setup();
    for (let i = 0; i < 20; i++)
      expect((await finish((await begin({ user_message: `Clarify ${i}` })).data.turn)).error).toBeNull();
    const blocked = await begin();
    expect(blocked.error?.code).toBe("PT429");
    expect(blocked.error?.message).toBe("AI usage limit reached");
  });

  it("returns an identical completed request without dispatching or charging", async () => {
    const { begin, finish, usage, pm, org, task } = await setup();
    const first = (await begin({ p_intent: "gaps", user_message: "Check for gaps" })).data.turn;
    expect(
      (await finish(first, { task_questions: [{ prompt: "Which lists?", options: ["One", "All"] }] })).error,
    ).toBeNull();
    const again = await begin({ p_intent: "gaps", user_message: "Check for gaps" });
    expect(again.error).toBeNull();
    expect(again.data.dispatch).toBe(false);
    expect(again.data.turn.id).toBe(first.id);
    expect((await usage()).remaining).toBe(19);
    expect((await pm.client.rpc("read_chat", { target_org: org, request_id: task.id })).data).toHaveLength(1);
    const failed = (await begin({ user_message: "Retry me" })).data.turn;
    await finish(failed, { human_reply: null, failure_code: "unavailable" });
    expect((await begin({ user_message: "Retry me" })).data.dispatch).toBe(true);
  });

  it("validates intents, gap questions and structured answers", async () => {
    const { begin, finish } = await setup();
    expect((await begin({ p_intent: "publish" })).error?.code).toBe("22023");
    expect((await begin({ p_intent: "gaps", p_answers: [{ question: "Q?", answer: "A" }] })).error?.code).toBe("22023");
    for (const answers of [
      [],
      [{ question: "Q?", answer: "A", extra: 1 }],
      [{ question: " ", answer: null }],
      [{ question: "Q?", answer: "x".repeat(501) }],
    ]) {
      expect((await begin({ p_answers: answers })).error?.code).toBe("22023");
    }
    const edit = (await begin({ p_answers: [{ question: "Which lists?", answer: null }] })).data.turn;
    expect(edit).toMatchObject({ intent: "edit", answers: [{ question: "Which lists?", answer: null }] });
    expect((await finish(edit, { task_questions: [{ prompt: "Q?", options: ["A", "B"] }] })).error?.code).toBe("22023");
    await finish(edit);
    const gaps = (await begin({ p_intent: "gaps" })).data.turn;
    expect((await finish(gaps, { task_proposal: { title: "T", description: "D" } })).error?.code).toBe("22023");
    for (const questions of [
      [],
      [{ prompt: "Q?", options: ["A"] }],
      [{ prompt: "Q?", options: ["A", "B"], x: 1 }],
      Array.from({ length: 6 }, () => ({ prompt: "Q?", options: ["A", "B"] })),
    ]) {
      expect((await finish(gaps, { task_questions: questions })).error?.code).toBe("22023");
    }
    expect((await finish(gaps, { task_questions: [{ prompt: "Q?", options: ["A", "B"] }] })).error).toBeNull();
  });

  it("gives the worker at most three recent completed turns without proposals", async () => {
    const { begin, finish } = await setup();
    for (let i = 0; i < 5; i++) {
      const turn = (await begin({ user_message: `m${i}` })).data.turn;
      await finish(turn, { human_reply: "r".repeat(1500), task_proposal: { title: "T", description: "D" } });
    }
    const failed = (await begin({ user_message: "failed" })).data.turn;
    await finish(failed, { human_reply: null, failure_code: "unavailable" });
    const admitted = (await begin({ user_message: "now" })).data;
    expect(admitted.history.map((turn: { message: string }) => turn.message)).toEqual(["m2", "m3", "m4"]);
    for (const turn of admitted.history) {
      expect(Object.keys(turn).sort()).toEqual(["message", "reply"]);
      expect(turn.reply).toHaveLength(1000);
    }
  });

  it("exposes usage only to the signed-in account", async () => {
    const { begin } = await setup();
    await begin();
    const other = await fixture.actor("PM");
    expect((await other.client.rpc("read_ai_usage")).data.remaining).toBe(20);
    expect((await fixture.client().rpc("read_ai_usage")).error).not.toBeNull();
  });
});

describe.skipIf(!localEnabled)("PM assistant HTTP interface", () => {
  let fixture: ReturnType<typeof localFixture>;
  beforeEach(() => resetLocalAiWindows());
  afterEach(async () => {
    await fixture?.cleanup();
  });
  it("sends the admitted snapshot and bounded history by intent and reports usage", async () => {
    const { createApplication } = await import("../server/application");
    const { assistanceMessages } = await import("../assistance");
    fixture = localFixture();
    const pm = await fixture.actor("PM");
    const org = (await pm.client.rpc("create_organisation", { organisation_name: "Assistant HTTP" })).data;
    const task = (await pm.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
    const seen: unknown[] = [];
    let reply: Record<string, unknown> = { reply: "Draft ready.", proposal: { title: "T", description: "D" } };
    const app = createApplication({
      aiLimits: testAiLimits,
      origin: "http://localhost:3000",
      client: () => pm.client,
      chat: {
        worker: () => fixture.admin,
        provider: async input => {
          seen.push(input);
          return reply as never;
        },
      },
    });
    const path = `http://localhost:3000/api/organisations/${org}/requests/${task.id}/chat`;
    const post = (body: Record<string, unknown>) =>
      app(
        new Request(path, {
          method: "POST",
          headers: { origin: "http://localhost:3000", "content-type": "application/json" },
          body: JSON.stringify({
            key: randomUUID(),
            revision: 1,
            fields: { title: "", description: "Idea" },
            retry: false,
            ...body,
          }),
        }),
      );
    const drafted = await post({ intent: "draft" });
    expect(drafted.status).toBe(200);
    const body = await drafted.json();
    expect(body.turn).toMatchObject({ intent: "draft", message: assistanceMessages.draft, proposal: { title: "T" } });
    expect(body.usage).toMatchObject({ remaining: 19, limit: 20 });
    expect(seen[0]).toEqual({
      intent: "draft",
      fields: { title: "", description: "Idea" },
      message: assistanceMessages.draft,
      recent: [],
      answers: null,
    });
    // A rough idea typed into the instruction box drafts with the PM's own words.
    expect(
      (
        await (
          await post({
            intent: "draft",
            message: "Help me write a ticket: rename levels",
            fields: { title: "", description: "" },
          })
        ).json()
      ).turn,
    ).toMatchObject({ intent: "draft", message: "Help me write a ticket: rename levels" });
    expect(seen.at(-1)).toMatchObject({
      intent: "draft",
      message: "Help me write a ticket: rename levels",
      fields: { title: "", description: "" },
    });
    reply = {
      reply: "Two gaps.",
      proposal: { title: "T", description: "D" },
      questions: [{ prompt: "Q?", options: ["A", "B"] }],
    };
    expect((await (await post({ intent: "gaps" })).json()).turn).toMatchObject({
      status: "failed",
      error_code: "invalid_output",
      diagnostic: { reason: "invalid_schema" },
    });
    reply = { reply: "Recorded." };
    const answered = await (
      await post({ intent: "edit", answers: [{ question: "Which lists?", answer: null }] })
    ).json();
    expect(answered.turn).toMatchObject({
      intent: "edit",
      message: assistanceMessages.answers,
      answers: [{ question: "Which lists?", answer: null }],
    });
    expect(seen.at(-1)).toMatchObject({
      recent: [
        { message: assistanceMessages.draft, reply: "Draft ready." },
        { message: "Help me write a ticket: rename levels", reply: "Draft ready." },
      ],
      answers: [{ question: "Which lists?", answer: null }],
    });
    expect(answered.usage.remaining).toBe(17);
    for (const invalid of [
      { intent: "gaps", answers: [{ question: "Q?", answer: "A" }] },
      { intent: "edit" },
      { intent: "publish", message: "x" },
    ])
      expect((await post(invalid)).status).toBe(400);
  });
  it("names the limit that blocked a request", async () => {
    const { createApplication } = await import("../server/application");
    fixture = localFixture();
    const pm = await fixture.actor("PM");
    const org = (await pm.client.rpc("create_organisation", { organisation_name: "Assistant limits" })).data;
    const task = (await pm.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
    const app = createApplication({
      aiLimits: testAiLimits,
      origin: "http://localhost:3000",
      client: () => pm.client,
      chat: { worker: () => fixture.admin, provider: async () => ({ reply: "Ok.", proposal: null }) },
    });
    const path = `http://localhost:3000/api/organisations/${org}/requests/${task.id}/chat`;
    for (let i = 0; i < 20; i++)
      expect(
        (
          await app(
            new Request(path, {
              method: "POST",
              headers: { origin: "http://localhost:3000", "content-type": "application/json" },
              body: JSON.stringify({
                key: randomUUID(),
                revision: 1,
                fields: { title: "", description: "" },
                intent: "edit",
                message: `Question ${i}`,
              }),
            }),
          )
        ).status,
      ).toBe(200);
    const blocked = await app(
      new Request(path, {
        method: "POST",
        headers: { origin: "http://localhost:3000", "content-type": "application/json" },
        body: JSON.stringify({
          key: randomUUID(),
          revision: 1,
          fields: { title: "", description: "" },
          intent: "edit",
          message: "One more",
        }),
      }),
    );
    expect(blocked.status).toBe(429);
    expect(await blocked.json()).toMatchObject({
      error: "You have used all your AI requests for this hour. Keep editing manually until more are available.",
      usage: { remaining: 0 },
    });
  });
});

describe.skipIf(!localEnabled)("PM assistant retry refunds", () => {
  let fixture: ReturnType<typeof localFixture>;
  beforeEach(() => resetLocalAiWindows());
  afterEach(async () => {
    await fixture?.cleanup();
  });
  it("charges each retried generation once and refunds each failure once", async () => {
    fixture = localFixture();
    const pm = await fixture.actor("PM");
    const org = (await pm.client.rpc("create_organisation", { organisation_name: "Retry refunds" })).data;
    const task = (await pm.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
    const args = {
      target_org: org,
      request_id: task.id,
      actor_id: pm.id,
      turn_key: randomUUID(),
      base_revision: 1,
      input_fields: { title: "", description: "" },
      user_message: "Clarify",
      retry_failed: false,
      ai_limits: testAiLimits,
    };
    const usage = async () => (await pm.client.rpc("read_ai_usage")).data.remaining;
    const fail = (turn: { id: string; generation: number }) =>
      fixture.admin.rpc("finish_chat_turn", {
        target_org: org,
        request_id: task.id,
        actor_id: pm.id,
        turn_id: turn.id,
        worker_generation: turn.generation,
        human_reply: null,
        task_proposal: null,
        failure_code: "unavailable",
      });
    let turn = (await fixture.admin.rpc("begin_chat_turn", args)).data.turn;
    expect((await fail(turn)).error).toBeNull();
    expect(await usage()).toBe(20);
    turn = (await fixture.admin.rpc("begin_chat_turn", { ...args, retry_failed: true })).data.turn;
    expect(turn.generation).toBe(2);
    expect(await usage()).toBe(19);
    expect((await fail(turn)).error).toBeNull();
    expect(await usage()).toBe(20);
    expect((await fail(turn)).error).not.toBeNull();
    expect(await usage()).toBe(20);
  });
});
