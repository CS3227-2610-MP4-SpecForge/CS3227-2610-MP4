import { afterEach, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createApplication } from "../server/application";
import { localEnabled, localFixture } from "./local.fixture";

const origin = "http://localhost:3000";
function post(body: unknown, source = origin) {
  return new Request(`${origin}/api/account`, { method: "POST", headers: { origin: source, "content-type": "application/json" }, body: JSON.stringify(body) });
}
describe.skipIf(!localEnabled)("own profile", () => {
  let fixture: ReturnType<typeof localFixture>;
  afterEach(async () => { await fixture?.cleanup(); });
  it("renames only the current account and returns its actual account creation date", async () => {
    fixture = localFixture();
    const actor = await fixture.actor("PM");
    const other = await fixture.actor("Developer");
    const app = createApplication({ origin, client: () => actor.client });
    const org = (await actor.client.rpc("create_organisation", { organisation_name: "Identity team" })).data;
    const ticket = (await actor.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
    const username = `New_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
    const response = await app(post({ username }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ account: { id: actor.id, username: username.toLowerCase(), email: actor.email, role: "PM" } });
    const account = (await (await app(new Request(`${origin}/api/account`))).json()).account;
    expect(account.username).toBe(username.toLowerCase());
    const renamedTicket = (await actor.client.rpc("read_request", { target_org: org, request_id: ticket.id })).data;
    expect(renamedTicket.author_id).toBe(actor.id);
    expect(renamedTicket.author_username).toBe(username.toLowerCase());
    expect(account.createdAt).toBe((await actor.client.auth.getUser()).data.user!.created_at);
    const otherApp = createApplication({ origin, client: () => other.client });
    expect((await (await otherApp(new Request(`${origin}/api/account`))).json()).account.username).toBe(other.username);
  });
  it("rejects protected fields, invalid names and cross-origin changes", async () => {
    fixture = localFixture();
    const actor = await fixture.actor("Developer");
    const app = createApplication({ origin, client: () => actor.client });
    for (const extra of [{ id: randomUUID() }, { role: "PM" }, { email: "other@example.com" }, { createdAt: "2000-01-01" }]) {
      expect((await app(post({ username: "valid_name", ...extra }))).status).toBe(400);
    }
    for (const username of ["ab", "a".repeat(25), "hello world", "équipe", "Legacy_reserved", "valid\n", null]) {
      expect((await app(post({ username }))).status).toBe(400);
      expect((await actor.client.rpc("rename_username", { new_username: username })).error?.code).toBe("22023");
    }
    expect((await app(post({ username: "valid_name" }, "https://attacker.invalid"))).status).toBe(403);
    expect((await actor.client.from("profiles").update({ username: "bypass" }).eq("id", actor.id)).error).not.toBeNull();
    expect((await (await app(new Request(`${origin}/api/account`))).json()).account).toMatchObject({ username: actor.username, role: "Developer", email: actor.email });
  });
  it("requires verified identity at both HTTP and direct RPC seams", async () => {
    fixture = localFixture();
    const actor = await fixture.actor("PM", false);
    const unverified = fixture.unverifiedSession(actor.id);
    for (const client of [fixture.client(), unverified]) {
      expect((await client.rpc("rename_username", { new_username: "forbidden_name" })).error?.code).toBe("42501");
    }
    const anonymous = createApplication({ origin, client: fixture.client });
    expect((await anonymous(post({ username: "forbidden_name" }))).status).toBe(401);
  });
  it("allows exactly one concurrent claim and sanitizes duplicate errors", async () => {
    fixture = localFixture();
    const a = await fixture.actor("PM"), b = await fixture.actor("Developer");
    const name = `claim_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
    const apps = [a, b].map(actor => createApplication({ origin, client: () => actor.client }));
    const responses = await Promise.all(apps.map(app => app(post({ username: name }))));
    expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
    const duplicate = responses.find(r => r.status === 409)!;
    expect(await duplicate.json()).toEqual({ error: "That username is already taken. Choose another." });
    expect(duplicate.headers.get("cache-control")).toBe("private, no-store");
    const identities = await Promise.all(apps.map(async app => (await (await app(new Request(`${origin}/api/account`))).json()).account));
    expect(identities.filter(account => account.username === name)).toHaveLength(1);
    expect(identities.map(account => account.role)).toEqual(["PM", "Developer"]);
  });

});
