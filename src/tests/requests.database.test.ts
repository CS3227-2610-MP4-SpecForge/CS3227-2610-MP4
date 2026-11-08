import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { createApplication } from "../server/application";
import { localEnabled, localFixture } from "./local.fixture";

const fields = { title: "Search requests", description: "## Problem description\n\nPMs need to find saved work.\n\n## Desired behaviour\n\nFilter by title." };

describe.skipIf(!localEnabled)("request storage interface", () => {
  let fixture: ReturnType<typeof localFixture>;
  afterEach(async () => { await fixture?.cleanup(); });
  it("creates an author-private PM draft and safely repeats creation after response loss", async () => {
    fixture = localFixture();
    const pm = await fixture.actor("PM");
    const other = await fixture.actor("Developer");
    const org = (await pm.client.rpc("create_organisation", { organisation_name: "Request team" })).data;
    const key = randomUUID();
    const created = await pm.client.rpc("create_request", { target_org: org, creation_key: key });
    expect(created.error).toBeNull();
    expect(created.data).toMatchObject({ organisation_id: org, author_id: pm.id, revision: 1, submitted_at: null, fields: { title: "" } });
    const repeated = await pm.client.rpc("create_request", { target_org: org, creation_key: key });
    expect(repeated.data?.id).toBe(created.data.id);
    expect((await pm.client.rpc("list_requests", { target_org: org })).data).toHaveLength(1);
    expect((await other.client.rpc("read_request", { target_org: org, request_id: created.data.id })).error?.code).toBe("42501");
    expect((await other.client.from("feature_requests").select("id")).data).toEqual([]);
  });
  it("saves draft content conditionally and rejects stale concurrent writers", async () => {
    fixture = localFixture();
    const pm = await fixture.actor("PM");
    const org = (await pm.client.rpc("create_organisation", { organisation_name: "Draft saves" })).data;
    const draft = (await pm.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
    await pm.client.rpc("update_delivery", { target_org: org, request_id: draft.id, expected_revision: 1, changes: { due_date: "2026-12-20" } });
    const save = (title: string) => pm.client.rpc("save_draft", { target_org: org, request_id: draft.id, expected_revision: 1, content: { ...fields, title } });
    const competing = await Promise.all([save("First writer"), save("Second writer")]);
    expect(competing.filter(result => !result.error)).toHaveLength(1);
    expect(competing.find(result => result.error)?.error?.code).toBe("P0001");
    const stored = await pm.client.rpc("read_request", { target_org: org, request_id: draft.id });
    expect(stored.data).toMatchObject({ revision: 2, submitted_at: null });
    expect(["First writer", "Second writer"]).toContain(stored.data.fields.title);
    expect(stored.data.fields.description).toBe(fields.description);
    expect((await pm.client.rpc("save_draft", { target_org: org, request_id: draft.id, expected_revision: 2, content: { ...fields, title: "x".repeat(161) } })).error?.code).toBe("22023");
  });

  it("publishes only complete acknowledged fields and changes the published version only on explicit save", async () => {
    fixture = localFixture();
    const pm = await fixture.actor("PM");
    const reader = await fixture.actor("Developer");
    const org = (await pm.client.rpc("create_organisation", { organisation_name: "Publish requests" })).data;
    await pm.client.rpc("invite_member", { target_org: org, target_email: reader.email });
    const invite = (await reader.client.rpc("list_invitations")).data[0].id;
    await reader.client.rpc("respond_invitation", { invitation_id: invite, decision: "accept" });
    const draft = (await pm.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
    await pm.client.rpc("update_delivery", { target_org: org, request_id: draft.id, expected_revision: 1, changes: { due_date: "2026-12-20" } });
    const publish = (content: unknown, acknowledged: boolean | null) => pm.client.rpc("publish_request", { target_org: org, request_id: draft.id, expected_revision: 1, content, acknowledged, first_submission: true });
    expect((await publish(fields, null)).error?.code).toBe("22023");
    expect((await publish({ ...fields, description: " \n\t" }, true)).error?.code).toBe("22023");
    expect((await publish(fields, false)).error?.code).toBe("22023");
    const published = await publish(fields, true);
    expect(published.error).toBeNull();
    expect(published.data).toMatchObject({ fields, author_id: pm.id, revision: 2 });
    expect(published.data.submitted_at).toEqual(expect.any(String));
    const read = () => reader.client.rpc("read_request", { target_org: org, request_id: draft.id });
    expect((await read()).data.fields.title).toBe("Search requests");
    expect((await pm.client.rpc("save_draft", { target_org: org, request_id: draft.id, expected_revision: 2, content: fields })).error?.code).toBe("P0001");
    const saved = await pm.client.rpc("publish_request", { target_org: org, request_id: draft.id, expected_revision: 2, content: { ...fields, title: "Updated search" }, acknowledged: true, first_submission: false });
    expect(saved.error).toBeNull();
    expect((await read()).data).toMatchObject({ revision: 3, fields: { title: "Updated search" }, submitted_at: published.data.submitted_at });
  });

  it("deletes only the author's current unsubmitted draft", async () => {
    fixture = localFixture();
    const pm = await fixture.actor("PM");
    const org = (await pm.client.rpc("create_organisation", { organisation_name: "Draft deletion" })).data;
    const draft = (await pm.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
    await pm.client.rpc("update_delivery", { target_org: org, request_id: draft.id, expected_revision: 1, changes: { due_date: "2026-12-20" } });
    expect((await pm.client.rpc("delete_draft", { target_org: org, request_id: draft.id, expected_revision: 2 })).error?.code).toBe("P0001");
    expect((await pm.client.rpc("delete_draft", { target_org: org, request_id: draft.id, expected_revision: 1 })).error).toBeNull();
    expect((await pm.client.rpc("list_requests", { target_org: org })).data).toEqual([]);
    const published = (await pm.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
    await pm.client.rpc("update_delivery", { target_org: org, request_id: published.id, expected_revision: 1, changes: { due_date: "2026-12-20" } });
    await pm.client.rpc("publish_request", { target_org: org, request_id: published.id, expected_revision: 1, content: fields, acknowledged: true, first_submission: true });
    expect((await pm.client.rpc("delete_draft", { target_org: org, request_id: published.id, expected_revision: 2 })).error?.code).toBe("P0001");
  });

  it("exposes strict private HTTP request actions with a larger request-only body limit", async () => {
    fixture = localFixture();
    const pm = await fixture.actor("PM");
    const org = (await pm.client.rpc("create_organisation", { organisation_name: "HTTP requests" })).data;
    const app = createApplication({ origin: "http://localhost:3000", client: () => pm.client });
    const path = `/api/organisations/${org}/requests`;
    const post = (url: string, body: unknown, origin = "http://localhost:3000") => app(new Request("http://localhost:3000" + url, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) }));
    const created = await post(path, { creationKey: randomUUID() });
    expect(created.status).toBe(201);
    const draft = (await created.json()).request;
    await pm.client.rpc("update_delivery", { target_org: org, request_id: draft.id, expected_revision: 1, changes: { due_date: "2026-12-20" } });
    const long = { ...fields, description: "x".repeat(24000) };
    expect((await post(path + "/" + draft.id, { action: "save_draft", revision: 1, fields: long })).status).toBe(200);
    expect((await post(path + "/" + draft.id, { action: "save_draft", revision: 1, fields })).status).toBe(409);
    expect((await post(path + "/" + draft.id, { action: "submit", revision: 2, fields: long, acknowledged: false })).status).toBe(400);
    expect((await post(path + "/" + draft.id, { action: "submit", revision: 2, fields: long, acknowledged: true, author_id: pm.id })).status).toBe(400);
    expect((await post(path + "/" + draft.id, { action: "submit", revision: 2, fields: long, acknowledged: true })).status).toBe(200);
    const response = await app(new Request("http://localhost:3000" + path + "/" + draft.id));
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect((await response.json()).request).toMatchObject({ revision: 3, fields: long });
    expect((await post(path, { value: "x".repeat(200000) })).status).toBe(413);
    expect((await post("/api/organisations", { name: "x".repeat(9000) })).status).toBe(413);
    expect((await post(path, { creationKey: randomUUID() }, "https://attacker.invalid")).status).toBe(403);
  });

  it("keeps drafts private from PM/admin peers and restores author access only after rejoining", async () => {
    fixture = localFixture();
    const author = await fixture.actor("PM");
    const admin = await fixture.actor("Developer");
    const otherPM = await fixture.actor("PM");
    const org = (await admin.client.rpc("create_organisation", { organisation_name: "Request isolation" })).data;
    const otherOrg = (await author.client.rpc("create_organisation", { organisation_name: "Another organisation" })).data;
    const join = async (actor: typeof author) => {
      expect((await admin.client.rpc("invite_member", { target_org: org, target_email: actor.email })).error).toBeNull();
      const invite = (await actor.client.rpc("list_invitations")).data[0].id;
      expect((await actor.client.rpc("respond_invitation", { invitation_id: invite, decision: "accept" })).error).toBeNull();
    };
    await join(author); await join(otherPM);
    await admin.client.rpc("change_member", { target_org: org, target_user: otherPM.id, decision: "promote" });
    const draft = (await author.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
    await author.client.rpc("update_delivery", { target_org: org, request_id: draft.id, expected_revision: 1, changes: { due_date: "2026-12-20" } });
    const published = (await author.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
    await author.client.rpc("update_delivery", { target_org: org, request_id: published.id, expected_revision: 1, changes: { due_date: "2026-12-20" } });
    const read = (actor: typeof author, id = draft.id, target = org) => actor.client.rpc("read_request", { target_org: target, request_id: id });
    for (const peer of [admin, otherPM]) {
      expect((await peer.client.rpc("list_requests", { target_org: org })).data).toEqual([]);
      expect((await read(peer)).error?.code).toBe("42501");
      expect((await peer.client.from("feature_requests").select("id")).data).toEqual([]);
      expect((await peer.client.rpc("save_draft", { target_org: org, request_id: draft.id, expected_revision: 1, content: fields })).error?.code).toBe("42501");
    }
    expect((await admin.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).error?.code).toBe("42501");
    expect((await read(author, draft.id, otherOrg)).error?.code).toBe("42501");
    expect((await author.client.from("feature_requests").update({ fields }).eq("id", draft.id)).error).not.toBeNull();
    expect((await author.client.from("feature_requests").delete().eq("id", draft.id)).error).not.toBeNull();
    expect((await author.client.from("feature_requests").insert({ organisation_id: org, author_id: author.id, creation_key: randomUUID() })).error).not.toBeNull();
    await author.client.rpc("publish_request", { target_org: org, request_id: published.id, expected_revision: 1, content: fields, acknowledged: true, first_submission: true });
    for (const peer of [admin, otherPM]) {
      expect((await read(peer, published.id)).data).toMatchObject({ author_id: author.id, fields });
      expect((await peer.client.rpc("publish_request", { target_org: org, request_id: published.id, expected_revision: 2, content: fields, acknowledged: true, first_submission: false })).error?.code).toBe("42501");
    }
    expect((await admin.client.rpc("change_member", { target_org: org, target_user: author.id, decision: "remove" })).error).toBeNull();
    expect((await read(author)).error?.code).toBe("42501");
    expect((await author.client.rpc("list_requests", { target_org: org })).error?.code).toBe("42501");
    expect((await read(admin, published.id)).data.author_id).toBe(author.id);
    await join(author);
    expect((await read(author)).data.id).toBe(draft.id);
    expect((await author.client.rpc("save_draft", { target_org: org, request_id: draft.id, expected_revision: 1, content: fields })).error).toBeNull();
    const unverified = await fixture.actor("PM", false);
    expect((await fixture.unverifiedSession(unverified.id).rpc("list_requests", { target_org: org })).error?.code).toBe("42501");
    expect((await fixture.client().from("feature_requests").select("id")).error).not.toBeNull();
  });
  it("serialises draft-save/submission races and member removal against writes", async () => {
    fixture = localFixture();
    const admin = await fixture.actor("Developer");
    const author = await fixture.actor("PM");
    const org = (await admin.client.rpc("create_organisation", { organisation_name: "Request races" })).data;
    const join = async () => {
      await admin.client.rpc("invite_member", { target_org: org, target_email: author.email });
      await author.client.rpc("respond_invitation", { invitation_id: (await author.client.rpc("list_invitations")).data[0].id, decision: "accept" });
    };
    await join();
    const draft = (await author.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
    await author.client.rpc("update_delivery", { target_org: org, request_id: draft.id, expected_revision: 1, changes: { due_date: "2026-12-20" } });
    const args = { target_org: org, request_id: draft.id, expected_revision: 1, content: fields };
    const race = await Promise.all([author.client.rpc("save_draft", args), author.client.rpc("publish_request", { ...args, acknowledged: true, first_submission: true })]);
    expect(race.filter(result => !result.error)).toHaveLength(1);
    expect(race.find(result => result.error)?.error?.code).toBe("P0001");
    const second = (await author.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
    await author.client.rpc("update_delivery", { target_org: org, request_id: second.id, expected_revision: 1, changes: { due_date: "2026-12-20" } });
    const removal = await Promise.all([
      admin.client.rpc("change_member", { target_org: org, target_user: author.id, decision: "remove" }),
      author.client.rpc("save_draft", { ...args, request_id: second.id }),
    ]);
    expect(removal[0].error).toBeNull();
    expect(removal[1].error?.code ?? "saved").toMatch(/^(42501|saved)$/);
    expect((await author.client.rpc("read_request", { target_org: org, request_id: second.id })).error?.code).toBe("42501");
    await join();
    const restored = (await author.client.rpc("read_request", { target_org: org, request_id: second.id })).data;
    expect(restored.revision).toBe(removal[1].error ? 1 : 2);
  });

  it.each(["\u00a0", "\ufeff"])("rejects JavaScript-trimmed blank publication content %j in storage", async blank => {
    fixture = localFixture();
    const pm = await fixture.actor("PM");
    const org = (await pm.client.rpc("create_organisation", { organisation_name: "Blank content" })).data;
    const draft = (await pm.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
    await pm.client.rpc("update_delivery", { target_org: org, request_id: draft.id, expected_revision: 1, changes: { due_date: "2026-12-20" } });
    expect((await pm.client.rpc("publish_request", { target_org: org, request_id: draft.id, expected_revision: 1, content: { ...fields, description: blank }, acknowledged: true, first_submission: true })).error?.code).toBe("22023");
  });

});
