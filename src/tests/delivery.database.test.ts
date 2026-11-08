import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { createApplication } from "../server/application";
import { localEnabled, localFixture } from "./local.fixture";

describe.skipIf(!localEnabled)("ticket delivery storage interface", () => {
  let fixture: ReturnType<typeof localFixture>;
  afterEach(async () => { await fixture?.cleanup(); });
  it("accepts exactly three priorities through storage and HTTP and rejects urgent filters", async () => {
    fixture = localFixture(); const pm = await fixture.actor("PM");
    const org = (await pm.client.rpc("create_organisation", { organisation_name: "Three priorities" })).data;
    const draft = (await pm.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
    const args = { target_org: org, request_id: draft.id };
    expect((await pm.client.rpc("update_delivery", { ...args, expected_revision: 1, changes: { priority: "urgent" } })).error?.code).toBe("22023");
    expect((await pm.client.rpc("list_ticket_page", { target_org: org, filters: { priority: "urgent" } })).error?.code).toBe("22023");
    const app = createApplication({ origin: "http://localhost:3000", client: () => pm.client });
    const base = `http://localhost:3000/api/organisations/${org}/requests`;
    const post = (priority: string, revision: number) => app(new Request(`${base}/${draft.id}/delivery`, { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json" }, body: JSON.stringify({ revision, changes: { priority } }) }));
    expect((await post("urgent", 1)).status).toBe(400);
    expect((await app(new Request(base + "?priority=urgent"))).status).toBe(400);
    for (const [index, priority] of ["low", "medium", "high"].entries()) {
      const response = await post(priority, index + 1); expect(response.status).toBe(200);
      expect((await response.json()).request.priority).toBe(priority);
    }
  });

  it("gives private drafts stable references and independently revisioned scheduling", async () => {
    fixture = localFixture();
    const pm = await fixture.actor("PM");
    const org = (await pm.client.rpc("create_organisation", { organisation_name: "Delivery team" })).data;
    const draft = (await pm.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
    expect(draft).toMatchObject({ ticket_number: 1, delivery_revision: 1, due_date: null, priority: "medium", status: "to_do", assignee_ids: [] });
    const saved = await pm.client.rpc("update_delivery", { target_org: org, request_id: draft.id, expected_revision: 1,
      changes: { due_date: "2026-12-20", priority: "high", assignee_ids: [pm.id] } });
    expect(saved.error).toBeNull();
    expect(saved.data).toMatchObject({ revision: 1, delivery_revision: 2, due_date: "2026-12-20", priority: "high", assignee_ids: [pm.id] });
    expect((await pm.client.rpc("read_request", { target_org: org, request_id: draft.id })).data.ticket_number).toBe(1);
  });
  it("validates supplied dates, restricts delivery powers, and revokes assignments on departure", async () => {
    fixture = localFixture();
    const author = await fixture.actor("PM");
    const dev = await fixture.actor("Developer");
    const reader = await fixture.actor("PM");
    const org = (await author.client.rpc("create_organisation", { organisation_name: "Delivery permissions" })).data;
    for (const actor of [dev, reader]) {
      await author.client.rpc("invite_member", { target_org: org, target_email: actor.email });
      await actor.client.rpc("respond_invitation", { invitation_id: (await actor.client.rpc("list_invitations")).data[0].id, decision: "accept" });
    }
    await author.client.rpc("change_member", { target_org: org, target_user: reader.id, decision: "promote" });
    const draft = (await author.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
    const update = (actor: typeof author, changes: unknown, rev = 1) => actor.client.rpc("update_delivery", { target_org: org, request_id: draft.id, expected_revision: rev, changes });
    const publish = () => author.client.rpc("publish_request", { target_org: org, request_id: draft.id, expected_revision: 1, content: { title: "Deliver search", description: "Find saved work" }, acknowledged: true, first_submission: true });
    for (const date of ["2026-02-30", "infinity", "0000-01-01"]) expect((await update(author, { due_date: date })).error?.code).toBe("22023");
    expect((await update(author, { assignee_ids: [dev.id, dev.id] })).error?.code).toBe("22023");
    expect((await update(author, { assignee_ids: [randomUUID()] })).error?.code).toBe("22023");
    expect((await update(author, { assignee_ids: Array.from({ length: 6 }, () => randomUUID()) })).error?.code).toBe("22023");
    expect((await update(author, { due_date: "2026-12-20", assignee_ids: [dev.id] })).error).toBeNull();
    expect((await dev.client.rpc("read_request", { target_org: org, request_id: draft.id })).error?.code).toBe("42501");
    expect((await dev.client.rpc("read_chat", { target_org: org, request_id: draft.id })).error?.code).toBe("42501");
    expect((await update(dev, { status: "in_progress" }, 2)).error?.code).toBe("42501");
    expect((await publish()).error).toBeNull();
    expect((await update(reader, { status: "done" }, 2)).error?.code).toBe("42501");
    expect((await update(dev, { status: "done", priority: "high" }, 2)).error?.code).toBe("42501");
    expect((await update(dev, { status: "in_progress" }, 2)).data).toMatchObject({ status: "in_progress", revision: 2, delivery_revision: 3 });
    expect((await update(author, { priority: "high" }, 2)).error?.code).toBe("P0001");
    expect((await update(author, { due_date: "2026-02-30" }, 3)).error?.code).toBe("22023");
    expect((await author.client.rpc("change_member", { target_org: org, target_user: dev.id, decision: "remove" })).error).toBeNull();
    const removed = (await author.client.rpc("read_request", { target_org: org, request_id: draft.id })).data;
    expect(removed).toMatchObject({ assignee_ids: [], delivery_revision: 4, revision: 2 });
    expect((await update(dev, { status: "done" }, 4)).error?.code).toBe("42501");
    const outsiders = await fixture.actor("Developer");
    expect((await outsiders.client.from("feature_requests").select("id")).data).toEqual([]);
    expect((await reader.client.from("feature_requests").update({ status: "done" }).eq("id", draft.id)).error).not.toBeNull();
  });

  it("shares bounded comments and delivery activity without revealing draft history, and retries comments safely", async () => {
    fixture = localFixture();
    const author = await fixture.actor("PM"); const dev = await fixture.actor("Developer");
    const org = (await author.client.rpc("create_organisation", { organisation_name: "Team discussion" })).data;
    await author.client.rpc("invite_member", { target_org: org, target_email: dev.email });
    await dev.client.rpc("respond_invitation", { invitation_id: (await dev.client.rpc("list_invitations")).data[0].id, decision: "accept" });
    const draft = (await author.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
    const args = { target_org: org, request_id: draft.id };
    const key = randomUUID();
    const comment = (text: string, creation_key = key) => dev.client.rpc("comment_ticket", { ...args, creation_key, body: text });
    expect((await author.client.rpc("read_ticket_activity", args)).error?.code).toBe("42501");
    expect((await comment("Not public yet")).error?.code).toBe("42501");
    await author.client.rpc("update_delivery", { ...args, expected_revision: 1, changes: { due_date: "2026-12-20", priority: "high", assignee_ids: [dev.id] } });
    expect((await author.client.rpc("publish_request", { ...args, expected_revision: 1, content: { title: "Discuss work", description: "A shared ticket" }, acknowledged: true, first_submission: true })).error).toBeNull();
    const first = await comment("<script>alert(1)</script>");
    expect(first.error).toBeNull();
    expect((await comment("<script>alert(1)</script>")).data.id).toBe(first.data.id);
    expect((await comment("Different text")).error?.code).toBe("P0001");
    expect((await comment("\u00a0\ufeff", randomUUID())).error?.code).toBe("22023");
    expect((await comment("x".repeat(4001), randomUUID())).error?.code).toBe("22023");
    const feed = await dev.client.rpc("read_ticket_activity", args);
    expect(feed.error).toBeNull();
    expect(feed.data.entries.map((entry: { kind: string }) => entry.kind)).toEqual(["comment", "published"]);
    expect(feed.data.entries[0]).toMatchObject({ actor_id: dev.id, actor_username: dev.username, body: "<script>alert(1)</script>" });
    expect(JSON.stringify(feed.data)).not.toContain("A shared ticket");
    expect((await dev.client.from("ticket_activity").insert({ request_id: draft.id, actor_id: dev.id, kind: "comment", body: "bypass" })).error).not.toBeNull();
    for (let i = 0; i < 19; i++) expect((await comment("Comment " + i, randomUUID())).error).toBeNull();
    expect((await comment("Over quota", randomUUID())).error?.code).toBe("P0002");
    expect((await comment("<script>alert(1)</script>")).error).toBeNull();
    expect((await author.client.rpc("change_member", { target_org: org, target_user: dev.id, decision: "remove" })).error).toBeNull();
    const app = createApplication({ origin: "http://localhost:3000", client: () => author.client });
    const path = `http://localhost:3000/api/organisations/${org}/requests/${draft.id}/activity`;
    const readActivity = async () => {
      const response = await app(new Request(path));
      expect(response.status).toBe(200);
      return (await response.json()).entries;
    };
    let entries = await readActivity();
    expect(entries).toContainEqual(expect.objectContaining({ actor_id: dev.id, actor_username: dev.username }));
    expect(entries).toContainEqual(expect.objectContaining({ kind: "delivery_updated", assignment_usernames: { from: [dev.username], to: [] } }));
    expect((await dev.client.rpc("read_ticket_activity", args)).error?.code).toBe("42501");
    await fixture.deleteActor(dev.id);
    entries = await readActivity();
    expect(entries).toContainEqual(expect.objectContaining({ actor_id: dev.id, actor_username: null }));
    expect(entries).toContainEqual(expect.objectContaining({ kind: "delivery_updated", assignment_usernames: { from: [null], to: [] } }));
  });

  it("filters before paging and exposes current member emails", async () => {
    fixture = localFixture();
    const pm = await fixture.actor("PM");
    const org = (await pm.client.rpc("create_organisation", { organisation_name: "Find work" })).data;
    const draft = (await pm.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
    await pm.client.rpc("update_delivery", { target_org: org, request_id: draft.id, expected_revision: 1, changes: { due_date: "2026-12-20", priority: "high", assignee_ids: [pm.id] } });
    const page = await pm.client.rpc("list_ticket_page", { target_org: org, filters: { search: "SF-1", assignee: pm.id, priority: "high", sort: "due" } });
    expect(page.error).toBeNull();
    expect(page.data.items).toMatchObject([{ id: draft.id, author_username: pm.username, assignee_usernames: [pm.username] }]);
    const app = createApplication({ origin: "http://localhost:3000", client: () => pm.client });
    const path = `http://localhost:3000/api/organisations/${org}/requests`;
    expect(await (await app(new Request(path))).json()).toMatchObject({ requests: [{ id: draft.id, author_username: pm.username, assignee_usernames: [pm.username] }] });
    expect(await (await app(new Request(`${path}/${draft.id}`))).json()).toMatchObject({ request: { id: draft.id, author_username: pm.username, assignee_usernames: [pm.username] } });
    expect((await pm.client.rpc("list_ticket_page", { target_org: org, filters: { assignee: "unassigned" } })).data.items).toEqual([]);
    const members = await pm.client.rpc("ticket_members", { target_org: org });
    expect(members.error).toBeNull();
    expect(members.data.members).toEqual([{ user_id: pm.id, email: pm.email, app_role: "PM", username: pm.username }]);
    expect((await pm.client.rpc("list_ticket_page", { target_org: org, filters: { today: "infinity" } })).error?.code).toBe("22023");
  });

  it("searches emails and resolves selected members without widening organisation access", async () => {
    fixture = localFixture(); const pm = await fixture.actor("PM"); const dev = await fixture.actor("Developer"); const outsider = await fixture.actor("Developer");
    const org = (await pm.client.rpc("create_organisation", { organisation_name: "Email search" })).data;
    await pm.client.rpc("invite_member", { target_org: org, target_email: dev.email });
    await dev.client.rpc("respond_invitation", { invitation_id: (await dev.client.rpc("list_invitations")).data[0].id, decision: "accept" });
    const args = { target_org: org, member_search: dev.email.slice(5, 20).toUpperCase(), selected_users: [pm.id, outsider.id] };
    const result = await pm.client.rpc("ticket_members", args);
    expect(result.error).toBeNull();
    expect(result.data.members).toEqual([{ user_id: dev.id, email: dev.email, app_role: "Developer", username: dev.username }]);
    expect(result.data.selected_members).toEqual([{ user_id: pm.id, email: pm.email, app_role: "PM", username: pm.username }]);
    for (const search of ["%", "_", "no-match"]) expect((await pm.client.rpc("ticket_members", { ...args, member_search: search })).data.members).toEqual([]);
    for (const selected_users of [Array(6).fill(pm.id), [null], null]) expect((await pm.client.rpc("ticket_members", { ...args, selected_users })).error?.code).toBe("22023");
    expect((await pm.client.rpc("ticket_members", { ...args, member_search: "x".repeat(161) })).error?.code).toBe("22023");
    for (const client of [outsider.client, fixture.client(), fixture.unverifiedSession((await fixture.actor("PM", false)).id)]) {
      expect((await client.rpc("ticket_members", args)).error).not.toBeNull();
      const deniedApp = createApplication({ origin: "http://localhost:3000", client: () => client });
      const denied = await deniedApp(new Request(`http://localhost:3000/api/organisations/${org}/ticket-members?selected=${pm.id}`));
      // Sessionless/custom-token clients may fail closed at getUser as 503.
      expect([401, 403, 503]).toContain(denied.status);
      expect(await denied.text()).not.toContain(pm.email);
    }
    const app = createApplication({ origin: "http://localhost:3000", client: () => pm.client });
    const path = `http://localhost:3000/api/organisations/${org}/ticket-members`;
    const response = await app(new Request(path + `?search=${encodeURIComponent(args.member_search)}&selected=${pm.id},${outsider.id}`));
    expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual(result.data);
    for (const selected of ["invalid", Array(6).fill(pm.id).join(",")]) expect((await app(new Request(path + "?selected=" + selected))).status).toBe(400);
    await pm.client.rpc("change_member", { target_org: org, target_user: dev.id, decision: "remove" });
    expect((await dev.client.rpc("ticket_members", args)).error?.code).toBe("42501");
    const removedApp = createApplication({ origin: "http://localhost:3000", client: () => dev.client });
    expect((await removedApp(new Request(path))).status).toBe(403);
  });

  it("pages member emails at fifty while resolving a selection independently of the cursor", async () => {
    fixture = localFixture(); const pm = await fixture.actor("PM");
    const org = (await pm.client.rpc("create_organisation", { organisation_name: "Member pages" })).data;
    const actors = [pm];
    for (let i = 0; i < 50; i++) actors.push(await fixture.actor("Developer"));
    expect((await fixture.admin.from("organisation_members").insert(actors.slice(1).map(actor => ({ organisation_id: org, user_id: actor.id })))).error).toBeNull();
    const first = await pm.client.rpc("ticket_members", { target_org: org });
    expect(first.error).toBeNull(); expect(first.data.members).toHaveLength(50);
    expect(first.data.next_cursor).toEqual(first.data.members[49].user_id);
    const selected = first.data.members[0];
    const last = await pm.client.rpc("ticket_members", { target_org: org, after_user: first.data.next_cursor, selected_users: [selected.user_id] });
    expect(last.error).toBeNull(); expect(last.data.members).toHaveLength(1); expect(last.data.next_cursor).toBeNull();
    expect(last.data.selected_members).toEqual([selected]);
    expect(new Set([...first.data.members, ...last.data.members].map((member: { user_id: string }) => member.user_id)).size).toBe(51);
  });

  it("serves strict authenticated delivery HTTP actions with safe errors and private responses", async () => {
    fixture = localFixture(); const pm = await fixture.actor("PM");
    const org = (await pm.client.rpc("create_organisation", { organisation_name: "Delivery HTTP" })).data;
    const draft = (await pm.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
    const app = createApplication({ origin: "http://localhost:3000", client: () => pm.client });
    const path = `http://localhost:3000/api/organisations/${org}/requests/${draft.id}`;
    const post = (suffix: string, body: unknown, origin = "http://localhost:3000") => app(new Request(path + suffix, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) }));
    expect((await post("/delivery", { revision: 1, changes: { due_date: "2026-12-20", priority: "high", assignee_ids: [pm.id] } })).status).toBe(200);
    expect((await post("/delivery", { revision: 2, changes: { status: "done", author_id: pm.id } })).status).toBe(400);
    expect((await post("/delivery", { revision: 1, changes: { priority: "high" } })).status).toBe(409);
    expect((await post("/delivery", { revision: 2, changes: { priority: "high" } }, "https://attacker.invalid")).status).toBe(403);
    const list = await app(new Request(path.slice(0, path.lastIndexOf("/")) + "?priority=high"));
    expect(list.status).toBe(200);
    expect((await list.json()).requests[0]).toMatchObject({ ticket_number: 1, due_date: "2026-12-20", assignee_ids: [pm.id] });
    expect(list.headers.get("cache-control")).toBe("private, no-store");
    expect((await post("/activity", { creationKey: randomUUID(), body: "Draft comment" })).status).toBe(403);
  });

  it("pages beyond 100 tickets, isolates other organisations, and pages immutable shared activity", async () => {
    fixture = localFixture(); const pm = await fixture.actor("PM");
    const org = (await pm.client.rpc("create_organisation", { organisation_name: "Pagination" })).data;
    const otherOrg = (await pm.client.rpc("create_organisation", { organisation_name: "Isolated" })).data;
    for (let i = 0; i < 101; i++) expect((await pm.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).error).toBeNull();
    const ids: string[] = []; let offset: number | null = 0;
    while (offset !== null) {
      const result: { data: { items: { id: string }[]; next_offset: number | null } | null; error: unknown } = await pm.client.rpc("list_ticket_page", { target_org: org, page_offset: offset });
      expect(result.error).toBeNull(); if (!result.data) throw new Error("Expected a successful ticket page."); expect(result.data.items.length).toBeLessThanOrEqual(50);
      ids.push(...result.data.items.map((r: { id: string }) => r.id)); offset = result.data.next_offset;
    }
    expect(new Set(ids).size).toBe(101);
    const args = { target_org: org, request_id: ids[0] };
    await pm.client.rpc("update_delivery", { ...args, expected_revision: 1, changes: { due_date: "2026-01-01" } });
    await pm.client.rpc("publish_request", { ...args, expected_revision: 1, content: { title: "Old deadline", description: "Track overdue work" }, acknowledged: true, first_submission: true });
    for (let i = 0; i < 51; i++) expect((await pm.client.rpc("update_delivery", { ...args, expected_revision: i + 2, changes: { priority: i % 2 === 0 ? "high" : "low" } })).error).toBeNull();
    const first = (await pm.client.rpc("read_ticket_activity", args)).data;
    expect(first.entries).toHaveLength(50); expect(first.next_cursor).toEqual(expect.any(String));
    const last = (await pm.client.rpc("read_ticket_activity", { ...args, before_id: first.next_cursor })).data;
    expect(last.entries).toHaveLength(2); expect(last.next_cursor).toBeNull();
    expect(new Set([...first.entries, ...last.entries].map((entry: { id: string }) => entry.id)).size).toBe(52);
    expect((await pm.client.rpc("read_ticket_activity", { ...args, target_org: otherOrg })).error?.code).toBe("42501");
    expect((await pm.client.rpc("update_delivery", { ...args, target_org: otherOrg, expected_revision: 53, changes: { status: "done" } })).error?.code).toBe("42501");
    const overdue = (await pm.client.rpc("list_ticket_page", { target_org: org, filters: { overdue: "true", today: "2026-01-02" } })).data;
    expect(overdue.items.map((r: { id: string }) => r.id)).toEqual([ids[0]]);
    expect((await pm.client.rpc("list_ticket_page", { target_org: org, filters: { overdue: "true", today: "2026-01-01" } })).data.items).toEqual([]);
  });

  it("serialises competing assignments and member removal, and keeps content revisions independent", async () => {
    fixture = localFixture(); const pm = await fixture.actor("PM"); const dev = await fixture.actor("Developer");
    const org = (await pm.client.rpc("create_organisation", { organisation_name: "Delivery races" })).data;
    const join = async () => {
      await pm.client.rpc("invite_member", { target_org: org, target_email: dev.email });
      await dev.client.rpc("respond_invitation", { invitation_id: (await dev.client.rpc("list_invitations")).data[0].id, decision: "accept" });
    };
    await join();
    const draft = (await pm.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
    const args = { target_org: org, request_id: draft.id };
    const competing = await Promise.all(["low", "high"].map(priority => pm.client.rpc("update_delivery", { ...args, expected_revision: 1, changes: { priority } })));
    expect(competing.filter(result => !result.error)).toHaveLength(1); expect(competing.find(result => result.error)?.error?.code).toBe("P0001");
    const race = await Promise.all([
      pm.client.rpc("update_delivery", { ...args, expected_revision: 2, changes: { assignee_ids: [dev.id], due_date: "2026-12-20" } }),
      pm.client.rpc("save_draft", { ...args, expected_revision: 1, content: { title: "No lost edits", description: "Independent controls" } }),
    ]);
    expect(race.every(result => !result.error)).toBe(true);
    expect((await pm.client.rpc("publish_request", { ...args, expected_revision: 2, content: { title: "No lost edits", description: "Independent controls" }, acknowledged: true, first_submission: true })).error).toBeNull();
    const removal = await Promise.all([
      dev.client.rpc("update_delivery", { ...args, expected_revision: 3, changes: { status: "in_progress" } }),
      pm.client.rpc("change_member", { target_org: org, target_user: dev.id, decision: "remove" }),
    ]);
    expect(removal[1].error).toBeNull(); expect(removal[0].error?.code ?? "saved").toMatch(/^(42501|saved)$/);
    await join();
    expect((await pm.client.rpc("read_request", args)).data.assignee_ids).toEqual([]);
    const after = (await pm.client.rpc("read_request", args)).data;
    expect((await dev.client.rpc("update_delivery", { ...args, expected_revision: after.delivery_revision, changes: { status: "done" } })).error?.code).toBe("42501");
    const unverified = await fixture.actor("Developer", false);
    expect((await fixture.unverifiedSession(unverified.id).rpc("ticket_members", { target_org: org })).error?.code).toBe("42501");
    expect((await fixture.client().rpc("read_ticket_activity", args)).error).not.toBeNull();
  });

});
