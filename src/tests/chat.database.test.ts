import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { AiFailure, createSocProvider } from "../server/soc";
import { createApplication } from "../server/application";
import { localEnabled, localFixture } from "./local.fixture";

describe.skipIf(!localEnabled)("private AI conversation interface", () => {
  let fixture: ReturnType<typeof localFixture>;
  afterEach(async () => { await fixture?.cleanup(); });
  it("admits one trusted turn, preserves its snapshot, and keeps chat private from an organisation admin", async () => {
    fixture = localFixture();
    const pm = await fixture.actor("PM"); const admin = await fixture.actor("Developer");
    const org = (await admin.client.rpc("create_organisation", { organisation_name: "Private chat" })).data;
    await admin.client.rpc("invite_member", { target_org: org, target_email: pm.email });
    await pm.client.rpc("respond_invitation", { invitation_id: (await pm.client.rpc("list_invitations")).data[0].id, decision: "accept" });
    const task = (await pm.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
    const args = { target_org: org, request_id: task.id, actor_id: pm.id, turn_key: randomUUID(), base_revision: 1, input_fields: { title: "Search", description: "Find tasks" }, user_message: "Help clarify this", retry_failed: false };
    expect((await pm.client.rpc("begin_chat_turn", args)).error).not.toBeNull();
    const admitted = await fixture.admin.rpc("begin_chat_turn", args);
    expect(admitted.error).toBeNull(); expect(admitted.data.dispatch).toBe(true);
    const repeated = await fixture.admin.rpc("begin_chat_turn", args);
    expect(repeated.data.dispatch).toBe(false); expect(repeated.data.turn.id).toBe(admitted.data.turn.id);
    expect((await fixture.admin.rpc("begin_chat_turn", { ...args, turn_key: randomUUID() })).error?.code).toBe("PT429");
    expect((await admin.client.rpc("read_chat", { target_org: org, request_id: task.id })).error?.code).toBe("42501");
    expect((await admin.client.from("chat_turns").select("id")).data).toEqual([]);
    const completed = await fixture.admin.rpc("finish_chat_turn", { target_org: org, request_id: task.id, actor_id: pm.id, turn_id: admitted.data.turn.id, worker_generation: 1, human_reply: "Who will use it?", task_proposal: null, failure_code: null });
    expect(completed.error).toBeNull();
    const chat = await pm.client.rpc("read_chat", { target_org: org, request_id: task.id });
    expect(chat.data).toHaveLength(1); expect(chat.data[0]).toMatchObject({ status: "completed", message: "Help clarify this", reply: "Who will use it?", proposal: null, input_fields: args.input_fields });
  });
  it("authorizes HTTP before provider access and replays a completed turn without calling again", async () => {
    fixture = localFixture(); const pm = await fixture.actor("PM"); const other = await fixture.actor("PM");
    const org = (await pm.client.rpc("create_organisation", { organisation_name: "Chat HTTP" })).data;
    const task = (await pm.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
    let calls = 0;
    const dependencies = { worker: () => fixture.admin, provider: async () => { calls++; return { reply: "x".repeat(8001), proposal: { title: "Search", description: "## Desired behaviour\n\n- Search tasks" } }; } };
    const app = (actor: typeof pm) => createApplication({ origin: "http://localhost:3000", client: () => actor.client, chat: dependencies });
    const path = `http://localhost:3000/api/organisations/${org}/requests/${task.id}/chat`;
    const body = { key: randomUUID(), revision: 1, fields: { title: "", description: "" }, message: "Please propose a task", retry: false };
    const post = () => new Request(path, { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json" }, body: JSON.stringify(body) });
    expect((await app(other)(post())).status).toBe(403); expect(calls).toBe(0);
    const first = await app(pm)(post()); expect(first.status).toBe(200);
    expect((await first.json()).turn).toMatchObject({ status: "completed", reply: "x".repeat(8001), proposal: { title: "Search" }, base_revision: 1 });
    expect((await app(pm)(post())).status).toBe(200); expect(calls).toBe(1);
    const reloaded = (await (await app(pm)(new Request(path))).json()).turns;
    expect(reloaded).toHaveLength(1); expect(reloaded[0].reply).toBe("x".repeat(8001));
    expect((await pm.client.rpc("read_request", { target_org: org, request_id: task.id })).data.fields).toEqual({ title: "", description: "" });
  });

  it.each(["qwen3.5:9b", "gemma4:26b"])("normalizes %s output for private review without saving or publishing it", async model => {
    fixture = localFixture(); const pm = await fixture.actor("PM"); const other = await fixture.actor("PM");
    const org = (await pm.client.rpc("create_organisation", { organisation_name: "Tolerant responses" })).data;
    const task = (await pm.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
    const fields = { title: "Original title", description: "## Problem description\nKeep this wording.\n\n## Out of scope\nKeep this too." };
    expect((await pm.client.rpc("save_draft", { target_org: org, request_id: task.id, expected_revision: 1, content: fields })).error).toBeNull();
    let content: unknown = { publish: true, tool_calls: [{ name: "publish" }], diagnostic: { private: "discard me" }, proposal: { title: "Unwanted title", description: "## Acceptance criteria\n- Reload restores the filter.", status: "published" } };
    const provider = createSocProvider({ baseUrl: "https://soclaas-api.comp.nus.edu.sg/v1", model, key: "fixture-key" }, async () => Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(content) } }] }));
    const app = (actor: typeof pm) => createApplication({ origin: "http://localhost:3000", client: () => actor.client, chat: { worker: () => fixture.admin, provider } });
    const path = `http://localhost:3000/api/organisations/${org}/requests/${task.id}/chat`;
    const post = async () => {
      const response = await app(pm)(new Request(path, { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json" }, body: JSON.stringify({ key: randomUUID(), revision: 2, fields, message: "Suggest a clearer ticket draft." }) }));
      expect(response.status).toBe(200); return (await response.json()).turn;
    };
    const turn = await post();
    expect(turn).toMatchObject({ status: "completed", reply: "Review these suggested ticket changes.", proposal: { title: "Unwanted title", description: "## Acceptance criteria\n- Reload restores the filter." } });
    expect(Object.keys(turn.proposal).sort()).toEqual(["description", "title"]);
    expect(JSON.stringify(turn)).not.toContain("discard me");
    expect((await (await app(pm)(new Request(path))).json()).turns).toEqual([turn]);
    expect((await app(other)(new Request(path))).status).toBe(403);
    content = { reply: "Keep this clarification", proposal: { title: "Partial" } };
    expect(await post()).toMatchObject({ status: "failed", proposal: null, reply: null, error_code: "invalid_output", diagnostic: { source: "invalid_output", reason: "invalid_schema" } });
    const saved = (await pm.client.rpc("read_request", { target_org: org, request_id: task.id })).data;
    expect(saved).toMatchObject({ fields, revision: 2, submitted_at: null });
  });

  it("persists a failed message and retries explicitly without duplicating the conversation", async () => {
    fixture = localFixture(); const pm = await fixture.actor("PM");
    const org = (await pm.client.rpc("create_organisation", { organisation_name: "Retry chat" })).data;
    const task = (await pm.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
    let fail = true; let calls = 0;
    const app = createApplication({ origin: "http://localhost:3000", client: () => pm.client, chat: { worker: () => fixture.admin, provider: async () => { calls++; if (fail) throw new AiFailure("unavailable"); return { reply: "Who is the user?", proposal: null }; } } });
    const body = { key: randomUUID(), revision: 1, fields: { title: "", description: "" }, message: "Help me", retry: false };
    const post = () => app(new Request(`http://localhost:3000/api/organisations/${org}/requests/${task.id}/chat`, { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json" }, body: JSON.stringify(body) }));
    expect((await (await post()).json()).turn).toMatchObject({ status: "failed", message: "Help me", error_code: "unavailable" });
    expect((await post()).status).toBe(200); expect(calls).toBe(1);
    fail = false; body.retry = true;
    expect((await (await post()).json()).turn.status).toBe("completed"); expect(calls).toBe(2);
    expect((await pm.client.rpc("read_chat", { target_org: org, request_id: task.id })).data).toHaveLength(1);
  });
  it("denies forged completion and rejects old generations after explicit lease recovery", async () => {
    fixture = localFixture(); const pm = await fixture.actor("PM");
    const org = (await pm.client.rpc("create_organisation", { organisation_name: "Turn generations" })).data;
    const task = (await pm.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
    const args = { target_org: org, request_id: task.id, actor_id: pm.id, turn_key: randomUUID(), base_revision: 1, input_fields: { title: "", description: "" }, user_message: "Clarify", retry_failed: false };
    const turn = (await fixture.admin.rpc("begin_chat_turn", args)).data.turn;
    const completion = { target_org: org, request_id: task.id, actor_id: pm.id, turn_id: turn.id, worker_generation: 1, human_reply: "An old reply", task_proposal: null, failure_code: null };
    expect((await pm.client.rpc("finish_chat_turn", completion)).error).not.toBeNull();
    expect((await pm.client.from("chat_turns").update({ status: "failed" }).eq("id", turn.id)).error).not.toBeNull();
    expect((await fixture.admin.from("chat_turns").update({ lease_until: "2020-01-01T00:00:00Z" }).eq("id", turn.id)).error).toBeNull();
    const recovered = await fixture.admin.rpc("begin_chat_turn", { ...args, retry_failed: true });
    expect(recovered.error).toBeNull(); expect(recovered.data.turn.generation).toBe(2);
    expect((await fixture.admin.rpc("finish_chat_turn", completion)).error?.code).toBe("P0001");
    expect((await fixture.admin.rpc("finish_chat_turn", { ...completion, worker_generation: 2 })).error).toBeNull();
  });
  it("rechecks membership before storing a late provider response", async () => {
    fixture = localFixture(); const pm = await fixture.actor("PM"); const admin = await fixture.actor("Developer");
    const org = (await admin.client.rpc("create_organisation", { organisation_name: "Late AI" })).data;
    await admin.client.rpc("invite_member", { target_org: org, target_email: pm.email });
    await pm.client.rpc("respond_invitation", { invitation_id: (await pm.client.rpc("list_invitations")).data[0].id, decision: "accept" });
    const task = (await pm.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
    let started!: () => void; let finish!: () => void;
    const start = new Promise<void>(resolve => { started = resolve; }); const wait = new Promise<void>(resolve => { finish = resolve; });
    const app = createApplication({ origin: "http://localhost:3000", client: () => pm.client, chat: { worker: () => fixture.admin, provider: async () => { started(); await wait; return { reply: "Private late reply", proposal: null }; } } });
    const response = app(new Request(`http://localhost:3000/api/organisations/${org}/requests/${task.id}/chat`, { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json" }, body: JSON.stringify({ key: randomUUID(), revision: 1, fields: { title: "", description: "" }, message: "Clarify" }) }));
    await start;
    expect((await admin.client.rpc("change_member", { target_org: org, target_user: pm.id, decision: "remove" })).error).toBeNull();
    finish(); const result = await response;
    expect(result.status).toBe(403); expect(JSON.stringify(await result.json())).not.toContain("Private late reply");
    expect((await pm.client.rpc("read_chat", { target_org: org, request_id: task.id })).error?.code).toBe("42501");
  });
  it("enforces a persistent account limit across completed turns and rejects altered turn inputs", async () => {
    fixture = localFixture(); const pm = await fixture.actor("PM");
    const org = (await pm.client.rpc("create_organisation", { organisation_name: "AI usage" })).data;
    const task = (await pm.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
    const args = { target_org: org, request_id: task.id, actor_id: pm.id, turn_key: randomUUID(), base_revision: 1, input_fields: { title: "", description: "" }, user_message: "Clarify", retry_failed: false };
    for (let i = 0; i < 20; i++) {
      const admitted = await fixture.admin.rpc("begin_chat_turn", { ...args, turn_key: i === 0 ? args.turn_key : randomUUID() });
      expect(admitted.error).toBeNull();
      const completed = await fixture.admin.rpc("finish_chat_turn", { target_org: org, request_id: task.id, actor_id: pm.id, turn_id: admitted.data.turn.id, worker_generation: 1, human_reply: "A question", task_proposal: null, failure_code: null });
      expect(completed.error).toBeNull();
    }
    expect((await fixture.admin.rpc("begin_chat_turn", { ...args, user_message: "Changed input" })).error?.code).toBe("22023");
    expect((await fixture.admin.rpc("begin_chat_turn", { ...args, turn_key: randomUUID() })).error?.code).toBe("PT429");
    expect((await pm.client.rpc("read_chat", { target_org: org, request_id: task.id })).data).toHaveLength(20);
  });

  it("reserves completion capacity before admitting near-full conversation storage", async () => {
    fixture = localFixture(); const pm = await fixture.actor("PM");
    const org = (await pm.client.rpc("create_organisation", { organisation_name: "Conversation capacity" })).data;
    const task = (await pm.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
    const seed = Array.from({ length: 16 }, () => ({ request_id: task.id, organisation_id: org, author_id: pm.id, turn_key: randomUUID(), base_revision: 1, input_fields: { title: "X", description: "x".repeat(24000) }, message: "x".repeat(4000), reply: "x".repeat(4000), proposal: { title: "X", description: "x".repeat(24000) }, status: "completed", generation: 1, lease_until: "2020-01-01T00:00:00Z" }));
    expect((await fixture.admin.from("chat_turns").insert(seed)).error).toBeNull();
    expect((await fixture.admin.rpc("begin_chat_turn", { target_org: org, request_id: task.id, actor_id: pm.id, turn_key: randomUUID(), base_revision: 1, input_fields: { title: "", description: "" }, user_message: "Clarify", retry_failed: false })).error?.code).toBe("PT429");
    expect((await pm.client.rpc("read_chat", { target_org: org, request_id: task.id })).data).toHaveLength(16);
  });

  it("rejects blank replies and completions exceeding aggregate conversation capacity", async () => {
    fixture = localFixture(); const pm = await fixture.actor("PM");
    const org = (await pm.client.rpc("create_organisation", { organisation_name: "Reply capacity" })).data;
    const task = (await pm.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
    const turn = (await fixture.admin.rpc("begin_chat_turn", { target_org: org, request_id: task.id, actor_id: pm.id, turn_key: randomUUID(), base_revision: 1, input_fields: { title: "", description: "" }, user_message: "Clarify" })).data.turn;
    const complete = (reply: string) => fixture.admin.rpc("finish_chat_turn", { target_org: org, request_id: task.id, actor_id: pm.id, turn_id: turn.id, worker_generation: 1, human_reply: reply, task_proposal: null, failure_code: null });
    expect((await complete("   ")).error?.code).toBe("22023");
    expect((await complete("x".repeat(1048576))).error?.code).toBe("PT429");
    expect((await complete("x".repeat(8001))).error).toBeNull();
    expect((await pm.client.rpc("read_chat", { target_org: org, request_id: task.id })).data[0].reply.length).toBe(8001);
  });

  it("persists safe failure diagnostics through HTTP and private reloads", async () => {
    fixture = localFixture(); const pm = await fixture.actor("PM");
    const org = (await pm.client.rpc("create_organisation", { organisation_name: "AI diagnostics" })).data;
    const task = (await pm.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
    const app = createApplication({ origin: "http://localhost:3000", client: () => pm.client, chat: { worker: () => fixture.admin, provider: async () => { throw new AiFailure("upstream_http", { source: "upstream_http", http_status: 502, elapsed_ms: 1234 }); } } });
    const path = `http://localhost:3000/api/organisations/${org}/requests/${task.id}/chat`;
    const response = await app(new Request(path, { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json" }, body: JSON.stringify({ key: randomUUID(), revision: 1, fields: { title: "", description: "" }, message: "Hello" }) }));
    expect(response.status).toBe(200);
    expect((await response.json()).turn).toMatchObject({ status: "failed", error_code: "upstream_http", diagnostic: { source: "upstream_http", http_status: 502, elapsed_ms: 1234 } });
    expect((await (await app(new Request(path))).json()).turns[0].diagnostic).toEqual({ source: "upstream_http", http_status: 502, elapsed_ms: 1234 });
  });

  it("persists invalid-output reasons privately, rejects arbitrary metadata and preserves legacy nulls", async () => {
    fixture = localFixture(); const pm = await fixture.actor("PM");
    const org = (await pm.client.rpc("create_organisation", { organisation_name: "Output diagnostics" })).data;
    const task = (await pm.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
    const args = { target_org: org, request_id: task.id, actor_id: pm.id, turn_key: randomUUID(), base_revision: 1, input_fields: { title: "", description: "" }, user_message: "Draft a ticket" };
    const turn = (await fixture.admin.rpc("begin_chat_turn", args)).data.turn;
    const complete = (code: string, diagnostic: unknown) => fixture.admin.rpc("finish_chat_turn", { target_org: org, request_id: task.id, actor_id: pm.id, turn_id: turn.id, worker_generation: 1, human_reply: null, task_proposal: null, failure_code: code, failure_diagnostic: diagnostic });
    for (const diagnostic of [
      { source: "invalid_output" },
      { source: "invalid_output", reason: "PRIVATE_REASON" },
      { source: "invalid_output", reason: "invalid_json", body: "PRIVATE_BODY" },
      { source: "invalid_output", reason: null },
      { source: "invalid_output", reason: "invalid_json", elapsed_ms: 1 },
    ]) expect((await complete("invalid_output", diagnostic)).error?.code).toBe("22023");
    expect((await complete("network_error", { source: "invalid_output", reason: "invalid_json" })).error?.code).toBe("22023");
    expect((await complete("invalid_output", null)).error).toBeNull(); // Existing rows stay readable.
    expect((await pm.client.rpc("read_chat", { target_org: org, request_id: task.id })).data[0].diagnostic).toBeNull();
    const app = createApplication({ origin: "http://localhost:3000", client: () => pm.client, chat: { worker: () => fixture.admin, provider: async () => { throw new AiFailure("invalid_output", { source: "invalid_output", reason: "invalid_json" }); } } });
    const path = `http://localhost:3000/api/organisations/${org}/requests/${task.id}/chat`;
    const response = await app(new Request(path, { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json" }, body: JSON.stringify({ key: randomUUID(), revision: 1, fields: args.input_fields, message: "Draft again" }) }));
    expect(response.status).toBe(200);
    expect((await response.json()).turn).toMatchObject({ status: "failed", error_code: "invalid_output", diagnostic: { source: "invalid_output", reason: "invalid_json" } });
    const reload = (await (await app(new Request(path))).json()).turns;
    expect(reload).toHaveLength(2); expect(reload[0].diagnostic).toBeNull();
    expect(reload[1].diagnostic).toEqual({ source: "invalid_output", reason: "invalid_json" });
    const retry = await fixture.admin.rpc("begin_chat_turn", { ...args, turn_key: reload[1].turn_key, user_message: "Draft again", retry_failed: true });
    expect(retry.error).toBeNull(); expect(retry.data.turn.diagnostic).toBeNull();
  });

  it("rejects arbitrary or incompatible diagnostic metadata and clears it on explicit retry", async () => {
    fixture = localFixture(); const pm = await fixture.actor("PM");
    const org = (await pm.client.rpc("create_organisation", { organisation_name: "Strict diagnostics" })).data;
    const task = (await pm.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
    const args = { target_org: org, request_id: task.id, actor_id: pm.id, turn_key: randomUUID(), base_revision: 1, input_fields: { title: "", description: "" }, user_message: "Clarify", retry_failed: false };
    const turn = (await fixture.admin.rpc("begin_chat_turn", args)).data.turn;
    const complete = (diagnostic: unknown) => fixture.admin.rpc("finish_chat_turn", { target_org: org, request_id: task.id, actor_id: pm.id, turn_id: turn.id, worker_generation: 1, human_reply: null, task_proposal: null, failure_code: "upstream_http", failure_diagnostic: diagnostic });
    for (const invalid of [
      { source: "upstream_http", elapsed_ms: 5, extra: "PRIVATE_DETAIL" },
      { source: "upstream_http", elapsed_ms: 5, http_status: 502, body: "PRIVATE_DETAIL" },
      { source: "local_deadline", elapsed_ms: 45000 },
      { source: "upstream_http", elapsed_ms: -1, http_status: 502 },
      { source: "upstream_http", elapsed_ms: 1.5, http_status: 502 },
      { source: "upstream_http", elapsed_ms: 5, http_status: 999 },
      { source: "upstream_http", elapsed_ms: 5, http_status: 200 },
    ]) expect((await complete(invalid)).error?.code).toBe("22023");
    expect((await complete({ source: "upstream_http", elapsed_ms: 5, http_status: 502 })).error).toBeNull();
    const retried = await fixture.admin.rpc("begin_chat_turn", { ...args, retry_failed: true });
    expect(retried.error).toBeNull(); expect(retried.data.turn.diagnostic).toBeNull();
    expect(retried.data.turn.error_code).toBeNull();
  });

});
