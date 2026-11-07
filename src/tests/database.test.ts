import { afterEach, describe, expect, it } from "vitest";
import { localEnabled, localFixture } from "./local.fixture";
import { createApplication } from "../server/application";

describe.skipIf(!localEnabled)("local Supabase organisation interface", () => {
  let fixture: ReturnType<typeof localFixture>;
  afterEach(async () => { await fixture?.cleanup(); });
  it("invites only the intended recipient and atomically accepts ordinary membership", async () => {
    fixture = localFixture();
    const admin = await fixture.actor("PM");
    const recipient = await fixture.actor("Developer");
    const outsider = await fixture.actor("PM");
    const org = (await admin.client.rpc("create_organisation", { organisation_name: "Inviting team" })).data;
    expect((await admin.client.rpc("invite_member", { target_org: org, target_email: recipient.email.toUpperCase() })).error).toBeNull();
    const inbox = await recipient.client.rpc("list_invitations");
    expect(inbox.error).toBeNull();
    expect(inbox.data).toHaveLength(1);
    const invitation = inbox.data[0];
    expect((await outsider.client.rpc("respond_invitation", { invitation_id: invitation.id, decision: "accept" })).error?.code).toBe("42501");
    expect((await recipient.client.from("organisations").select("id")).data).toEqual([]);
    expect((await recipient.client.rpc("respond_invitation", { invitation_id: invitation.id, decision: "accept" })).error).toBeNull();
    expect((await recipient.client.from("organisation_members").select("is_admin").eq("user_id", recipient.id)).data).toEqual([{ is_admin: false }]);
    expect((await recipient.client.rpc("respond_invitation", { invitation_id: invitation.id, decision: "accept" })).error?.code).toBe("P0001");
  });
  it("allows decline, cancellation and expired-only resend without replay access", async () => {
    fixture = localFixture();
    const admin = await fixture.actor("Developer");
    const recipient = await fixture.actor("PM");
    const org = (await admin.client.rpc("create_organisation", { organisation_name: "Transitions" })).data;
    const invite = async () => {
      expect((await admin.client.rpc("invite_member", { target_org: org, target_email: recipient.email })).error).toBeNull();
      return (await recipient.client.rpc("list_invitations")).data[0].id;
    };
    const declined = await invite();
    expect((await recipient.client.rpc("respond_invitation", { invitation_id: declined, decision: "decline" })).error).toBeNull();
    expect((await recipient.client.rpc("respond_invitation", { invitation_id: declined, decision: "accept" })).error?.code).toBe("P0001");
    const cancelled = await invite();
    expect((await admin.client.rpc("manage_invitation", { target_org: org, invitation_id: cancelled, decision: "resend" })).error?.code).toBe("P0001");
    expect((await admin.client.rpc("manage_invitation", { target_org: org, invitation_id: cancelled, decision: "cancel" })).error).toBeNull();
    expect((await recipient.client.rpc("respond_invitation", { invitation_id: cancelled, decision: "accept" })).error?.code).toBe("P0001");
    const expired = await invite();
    expect((await fixture.admin.from("organisation_invitations").update({ expires_at: "2020-01-01T00:00:00Z" }).eq("id", expired)).error).toBeNull();
    expect((await recipient.client.rpc("list_invitations")).data[0].status).toBe("expired");
    expect((await recipient.client.rpc("respond_invitation", { invitation_id: expired, decision: "accept" })).error?.code).toBe("P0001");
    expect((await admin.client.rpc("manage_invitation", { target_org: org, invitation_id: expired, decision: "resend" })).error).toBeNull();
    expect((await recipient.client.rpc("list_invitations")).data[0].status).toBe("pending");
    expect((await recipient.client.rpc("respond_invitation", { invitation_id: expired, decision: "accept" })).error).toBeNull();
  });
  it("manages admin status and removal, allowing leave but protecting the last admin", async () => {
    fixture = localFixture();
    const a = await fixture.actor("PM");
    const b = await fixture.actor("Developer");
    const org = (await a.client.rpc("create_organisation", { organisation_name: "Admin team" })).data;
    const change = (actor: typeof a, user: string, decision: string) => actor.client.rpc("change_member", { target_org: org, target_user: user, decision });
    expect((await change(a, a.id, "demote")).error?.code).toBe("P0001");
    expect((await change(a, a.id, "leave")).error?.code).toBe("P0001");
    expect((await change(a, a.id, "remove")).error?.code).toBe("P0001");
    await a.client.rpc("invite_member", { target_org: org, target_email: b.email });
    const id = (await b.client.rpc("list_invitations")).data[0].id;
    await b.client.rpc("respond_invitation", { invitation_id: id, decision: "accept" });
    expect((await change(b, b.id, "promote")).error?.code).toBe("42501");
    expect((await change(b, a.id, "leave")).error?.code).toBe("42501");
    expect((await change(a, b.id, "promote")).error).toBeNull();
    expect((await change(a, a.id, "demote")).error).toBeNull();
    expect((await change(a, b.id, "remove")).error?.code).toBe("42501");
    expect((await change(b, a.id, "remove")).error).toBeNull();
    expect((await a.client.from("organisations").select("id").eq("id", org)).data).toEqual([]);
    expect((await a.client.rpc("respond_invitation", { invitation_id: id, decision: "accept" })).error?.code).toBe("42501");
    expect((await b.client.from("profiles").select("app_role").single()).data?.app_role).toBe("Developer");
    await b.client.rpc("invite_member", { target_org: org, target_email: a.email });
    const rejoin = (await a.client.rpc("list_invitations")).data[0].id;
    await a.client.rpc("respond_invitation", { invitation_id: rejoin, decision: "accept" });
    expect((await change(a, a.id, "leave")).error).toBeNull();
  });
  it("exposes invitations and admin controls through strict same-origin HTTP", async () => {
    fixture = localFixture();
    const a = await fixture.actor("PM");
    const b = await fixture.actor("Developer");
    const org = (await a.client.rpc("create_organisation", { organisation_name: "HTTP team" })).data;
    const app = createApplication({ origin: "http://localhost:3000", client: () => a.client });
    const recipient = createApplication({ origin: "http://localhost:3000", client: () => b.client });
    const post = (path: string, body: unknown, origin = "http://localhost:3000") => new Request("http://localhost:3000" + path, { method: "POST", headers: { origin, "content-type": "application/json" }, body: JSON.stringify(body) });
    expect((await app(post(`/api/organisations/${org}/invitations`, { email: b.email }))).status).toBe(202);
    const inbox = await recipient(new Request("http://localhost:3000/api/invitations"));
    expect(inbox.status).toBe(200);
    const id = (await inbox.json()).invitations[0].id;
    expect((await recipient(post(`/api/invitations/${id}`, { action: "accept" }))).status).toBe(200);
    const members = await app(new Request(`http://localhost:3000/api/organisations/${org}/members`));
    expect(members.status).toBe(200);
    expect((await members.json()).members).toHaveLength(2);
    expect((await recipient(new Request(`http://localhost:3000/api/organisations/${org}/members`))).status).toBe(403);
    expect((await app(post(`/api/organisations/${org}/members/${a.id}`, { action: "leave" }))).status).toBe(409);
    expect((await app(post(`/api/organisations/${org}/members/${b.id}`, { action: "promote", isAdmin: true }))).status).toBe(400);
    expect((await app(post(`/api/organisations/${org}/members/${b.id}`, { action: "promote" }, "https://attacker.invalid"))).status).toBe(403);
    expect((await app(post(`/api/organisations/${org}/members/${b.id}`, { action: "promote" }))).status).toBe(200);
    expect((await app(post(`/api/organisations/${org}/members/${a.id}`, { action: "leave" }))).status).toBe(200);
    expect((await app(new Request(`http://localhost:3000/api/organisations/${org}`))).status).toBe(404);
  });
  it.each(["leave", "demote", "remove"])("serialises competing admin %s operations", async decision => {
    fixture = localFixture();
    const a = await fixture.actor("PM");
    const b = await fixture.actor("Developer");
    const org = (await a.client.rpc("create_organisation", { organisation_name: "Concurrent admins" })).data;
    await a.client.rpc("invite_member", { target_org: org, target_email: b.email });
    const invitation = (await b.client.rpc("list_invitations")).data[0].id;
    await b.client.rpc("respond_invitation", { invitation_id: invitation, decision: "accept" });
    expect((await a.client.rpc("change_member", { target_org: org, target_user: b.id, decision: "promote" })).error).toBeNull();
    const results = await Promise.all([
      a.client.rpc("change_member", { target_org: org, target_user: decision === "remove" ? b.id : a.id, decision }),
      b.client.rpc("change_member", { target_org: org, target_user: decision === "remove" ? a.id : b.id, decision }),
    ]);
    expect(results.filter(result => !result.error)).toHaveLength(1);
    // Observe the public roster using whichever admin retained access.
    const rosters = await Promise.all([a.client.rpc("list_members", { target_org: org }), b.client.rpc("list_members", { target_org: org })]);
    const roster = rosters.find(result => !result.error)?.data;
    expect(roster.filter((member: { is_admin: boolean }) => member.is_admin)).toHaveLength(1);
  });
  it("isolates invitation storage, verifies recipients and forbids direct mutation", async () => {
    fixture = localFixture();
    const a = await fixture.actor("PM");
    const b = await fixture.actor("Developer", false);
    const c = await fixture.actor("PM");
    const org = (await a.client.rpc("create_organisation", { organisation_name: "Isolated invitations" })).data;
    const otherOrg = (await c.client.rpc("create_organisation", { organisation_name: "Other team" })).data;
    await a.client.rpc("invite_member", { target_org: org, target_email: b.email });
    expect((await a.client.rpc("invite_member", { target_org: org, target_email: b.email })).error).toBeNull();
    const invitations = (await a.client.rpc("list_invitations", { target_org: org })).data;
    expect(invitations).toHaveLength(1);
    const id = invitations[0].id;
    expect((await c.client.from("organisation_invitations").select("id")).data).toEqual([]);
    expect((await c.client.rpc("list_invitations", { target_org: org })).error?.code).toBe("42501");
    expect((await c.client.rpc("manage_invitation", { target_org: otherOrg, invitation_id: id, decision: "cancel" })).error?.code).toBe("42501");
    expect((await c.client.rpc("invite_member", { target_org: org, target_email: c.email })).error?.code).toBe("42501");
    const unverified = fixture.unverifiedSession(b.id);
    expect((await unverified.rpc("respond_invitation", { invitation_id: id, decision: "accept" })).error?.code).toBe("42501");
    expect((await unverified.from("organisation_invitations").select("id")).data).toEqual([]);
    expect((await a.client.from("organisation_invitations").update({ status: "accepted" }).eq("id", id)).error).not.toBeNull();
    expect((await a.client.from("organisation_invitations").delete().eq("id", id)).error).not.toBeNull();
    expect((await a.client.from("organisation_invitations").insert({ organisation_id: org, recipient_id: c.id, recipient_email: c.email })).error).not.toBeNull();
    expect((await fixture.client().rpc("list_invitations")).error).not.toBeNull();
  });
  it("shares a persistent invitation attempt limit across admins and resend", async () => {
    fixture = localFixture();
    const a = await fixture.actor("PM");
    const b = await fixture.actor("Developer");
    const org = (await a.client.rpc("create_organisation", { organisation_name: "Bounded invites" })).data;
    await a.client.rpc("invite_member", { target_org: org, target_email: b.email });
    const id = (await b.client.rpc("list_invitations")).data[0].id;
    await fixture.admin.from("organisation_invitations").update({ expires_at: "2020-01-01T00:00:00Z" }).eq("id", id);
    for (let attempt = 1; attempt < 20; attempt++) {
      const result = await a.client.rpc("invite_member", { target_org: org, target_email: "absent@example.com" });
      expect(result.error).toBeNull(); expect(result.data).toBe(true);
    }
    expect((await a.client.rpc("manage_invitation", { target_org: org, invitation_id: id, decision: "resend" })).data).toBe(false);
    const app = createApplication({ origin: "http://localhost:3000", client: () => a.client });
    const response = await app(new Request(`http://localhost:3000/api/organisations/${org}/invitations`, { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json" }, body: JSON.stringify({ email: b.email }) }));
    expect(response.status).toBe(429);
    expect(await response.json()).toEqual({ error: "Invitation limit reached. Try again in an hour." });
  });
  it("serialises acceptance against cancellation and never reuses an accepted invite after removal", async () => {
    fixture = localFixture();
    const a = await fixture.actor("PM");
    const b = await fixture.actor("Developer");
    const org = (await a.client.rpc("create_organisation", { organisation_name: "Invitation race" })).data;
    await a.client.rpc("invite_member", { target_org: org, target_email: b.email });
    const id = (await b.client.rpc("list_invitations")).data[0].id;
    const results = await Promise.all([
      a.client.rpc("manage_invitation", { target_org: org, invitation_id: id, decision: "cancel" }),
      b.client.rpc("respond_invitation", { invitation_id: id, decision: "accept" }),
    ]);
    expect(results.filter(result => !result.error)).toHaveLength(1);
    if (!results[1].error) expect((await a.client.rpc("change_member", { target_org: org, target_user: b.id, decision: "remove" })).error).toBeNull();
    expect((await b.client.rpc("respond_invitation", { invitation_id: id, decision: "accept" })).error?.code).toBe("P0001");
    expect((await b.client.from("organisations").select("id")).data).toEqual([]);
  });
  it("lets a verified PM create and read an organisation with creator admin membership", async () => {
    fixture = localFixture();
    const pm = await fixture.actor("PM");
    const created = await pm.client.rpc("create_organisation", { organisation_name: "First team" });
    expect(created.error).toBeNull();
    const organisations = await pm.client.from("organisations").select("id,name");
    expect(organisations.data).toEqual([{ id: created.data, name: "First team" }]);
    const members = await pm.client.from("organisation_members").select("user_id,is_admin").eq("organisation_id", created.data);
    expect(members.data).toEqual([{ user_id: pm.id, is_admin: true }]);
  });
  it("lets a Developer create and select their organisation through the app", async () => {
    fixture = localFixture();
    const developer = await fixture.actor("Developer");
    const app = createApplication({ origin: "http://localhost:3000", client: () => developer.client });
    const response = await app(new Request("http://localhost:3000/api/organisations", { method: "POST", headers: { origin: "http://localhost:3000", "content-type": "application/json" }, body: JSON.stringify({ name: "Developer team" }) }));
    expect(response.status).toBe(201);
    const { organisation } = await response.json();
    const selected = await app(new Request(`http://localhost:3000/api/organisations/${organisation.id}`));
    expect(await selected.json()).toEqual({ organisation: { id: organisation.id, name: "Developer team", isAdmin: true } });
    const account = await app(new Request("http://localhost:3000/api/account"));
    expect(await account.json()).toMatchObject({ account: { id: developer.id, role: "Developer" } });
  });
  it("keeps another organisation private through both Supabase and the app", async () => {
    fixture = localFixture();
    const a = await fixture.actor("PM");
    const b = await fixture.actor("Developer");
    const first = await a.client.rpc("create_organisation", { organisation_name: "Private A" });
    const second = await b.client.rpc("create_organisation", { organisation_name: "Private B" });
    expect(first.error).toBeNull(); expect(second.error).toBeNull();
    expect((await b.client.from("organisations").select("id").eq("id", first.data)).data).toEqual([]);
    expect((await b.client.from("organisation_members").select("user_id").eq("organisation_id", first.data)).data).toEqual([]);
    const app = createApplication({ origin: "http://localhost:3000", client: () => b.client });
    expect((await app(new Request(`http://localhost:3000/api/organisations/${first.data}`))).status).toBe(404);
    expect((await app(new Request("http://localhost:3000/api/organisations"))).status).toBe(200);
    expect((await fixture.client().from("organisations").select("id")).error).not.toBeNull();
  });
  it("preserves the fixed role despite Auth metadata and direct profile-write attempts", async () => {
    fixture = localFixture();
    const user = await fixture.actor("PM");
    expect((await user.client.auth.updateUser({ data: { role: "Developer", is_admin: true } })).error).toBeNull();
    expect((await user.client.from("profiles").select("app_role").eq("id", user.id).single()).data).toEqual({ app_role: "PM" });
    expect((await user.client.from("profiles").update({ app_role: "Developer" }).eq("id", user.id)).error).not.toBeNull();
    const app = createApplication({ origin: "http://localhost:3000", client: () => user.client });
    expect(await (await app(new Request("http://localhost:3000/api/account"))).json()).toMatchObject({ account: { role: "PM" } });
  });
  it("denies direct writes that could bypass creator membership or revoke the last admin", async () => {
    fixture = localFixture();
    const user = await fixture.actor("Developer");
    const created = await user.client.rpc("create_organisation", { organisation_name: "Safe team" });
    expect(created.error).toBeNull();
    expect((await user.client.from("organisations").insert({ name: "Bypass", created_by: user.id })).error).not.toBeNull();
    expect((await user.client.from("organisation_members").insert({ organisation_id: created.data, user_id: user.id, is_admin: true })).error).not.toBeNull();
    expect((await user.client.from("organisation_members").update({ is_admin: false }).eq("organisation_id", created.data)).error).not.toBeNull();
    expect((await user.client.from("organisation_members").delete().eq("organisation_id", created.data)).error).not.toBeNull();
    expect((await user.client.rpc("create_organisation", { organisation_name: "Invalid", creator_id: user.id })).error).not.toBeNull();
    expect((await user.client.rpc("create_organisation", { organisation_name: " ".repeat(10) })).error).not.toBeNull();
    expect((await user.client.from("organisations").select("id")).data).toHaveLength(1);
  });
  it("checks actual email confirmation in storage even with a valid authenticated JWT", async () => {
    fixture = localFixture();
    const user = await fixture.actor("PM", false);
    const session = fixture.unverifiedSession(user.id);
    const created = await session.rpc("create_organisation", { organisation_name: "Must not exist" });
    expect(created.error?.code).toBe("42501");
    expect((await session.from("organisations").select("id")).data).toEqual([]);
    expect((await user.client.auth.signInWithPassword({ email: user.email, password: user.password })).error?.code).toBe("email_not_confirmed");
  });
});
