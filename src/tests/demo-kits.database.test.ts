import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createApplication } from "../server/application";
import { createDemoKitAdmission, databaseReservation } from "../server/demo-kits";
import { removalOptions, removeDemoKits } from "../tooling/demo-remove.mjs";
import { localEnabled, localFixture, resetLocalDemoKitWindows } from "./local.fixture";

const password = "Disposable-test-password-2026";
const kitCode = () => randomBytes(16).toString("hex");

describe.skipIf(!localEnabled)("demo kit database rules", () => {
  let fixture: ReturnType<typeof localFixture>;
  const created: string[] = [];
  beforeEach(() => resetLocalDemoKitWindows());
  afterEach(async () => {
    for (const id of created.splice(0)) await fixture.admin.auth.admin.deleteUser(id);
    await fixture?.cleanup();
  });
  async function adminCreate(username: string, role: string, appMetadata: Record<string, unknown> = {}) {
    const result = await fixture.admin.auth.admin.createUser({
      email: `kit-${randomUUID()}@example.com`,
      password,
      email_confirm: true,
      user_metadata: { role, username },
      app_metadata: appMetadata,
    });
    if (result.data.user) created.push(result.data.user.id);
    return result;
  }

  it("creates a marked kit account only with the name its code and role imply", async () => {
    fixture = localFixture();
    const code = kitCode();
    const pm = await adminCreate(`demo_pm_${code.slice(0, 8)}`, "PM", { demo_kit: code });
    expect(pm.error).toBeNull();
    const profile = await fixture.admin
      .from("profiles")
      .select("app_role,username")
      .eq("id", pm.data.user!.id)
      .single();
    expect(profile.data).toEqual({ app_role: "PM", username: `demo_pm_${code.slice(0, 8)}` });
    expect((await adminCreate(`demo_dev_${code.slice(0, 8)}`, "PM", { demo_kit: code })).error).not.toBeNull();
    expect((await adminCreate(`demo_pm_${code.slice(1, 9)}`, "PM", { demo_kit: code })).error).not.toBeNull();
    expect((await adminCreate(`demo_pm_${code.slice(0, 8)}x`, "PM", { demo_kit: code })).error).not.toBeNull();
    expect(
      (await adminCreate("demo_pm_abcdef12", "PM", { demo_kit: "ABCDEF12" + "0".repeat(24) })).error,
    ).not.toBeNull();
    expect((await adminCreate("demo_pm_abcdef12", "PM", { demo_kit: 42 })).error).not.toBeNull();
  });

  it("rejects demo_ names from public signup, unmarked accounts and renames", async () => {
    fixture = localFixture();
    const code = kitCode();
    const spoof = await fixture.client().auth.signUp({
      email: `spoof-${randomUUID()}@example.com`,
      password,
      options: { data: { role: "PM", username: `DEMO_pm_${code.slice(0, 8)}`, demo_kit: code } },
    });
    expect(spoof.error).not.toBeNull();
    expect((await adminCreate(`Demo_x${randomUUID().slice(0, 8)}`, "PM")).error).not.toBeNull();
    const member = await fixture.actor("PM");
    const rename = await member.client.rpc("rename_username", { new_username: "DEMO_renamed" });
    expect(rename.error?.code).toBe("22023");
  });

  it("keeps the reservation away from browser roles", async () => {
    fixture = localFixture();
    const member = await fixture.actor("Developer");
    for (const client of [fixture.client(), member.client]) {
      const call = await client.rpc("reserve_demo_kit", { burst_cap: 5, daily_cap: 30 });
      expect(call.data).toBeNull();
      expect(call.error).not.toBeNull();
    }
  });

  it("admits exactly the burst cap under concurrency and names the limit", async () => {
    fixture = localFixture();
    const results = await Promise.all(
      Array.from({ length: 12 }, () => fixture.admin.rpc("reserve_demo_kit", { burst_cap: 5, daily_cap: 30 })),
    );
    expect(results.every(result => result.error === null)).toBe(true);
    expect(results.filter(result => result.data[0].admitted)).toHaveLength(5);
    const refused = results.filter(result => !result.data[0].admitted).map(result => result.data[0]);
    expect(refused).toHaveLength(7);
    for (const row of refused) {
      expect(row.limit_kind).toBe("burst");
      expect(row.retry_after).toBeGreaterThanOrEqual(1);
      expect(row.retry_after).toBeLessThanOrEqual(600);
    }
  });

  it("counts toward the daily limit and reports it once full", async () => {
    fixture = localFixture();
    for (let i = 0; i < 3; i++)
      expect((await fixture.admin.rpc("reserve_demo_kit", { burst_cap: 5, daily_cap: 3 })).data[0].admitted).toBe(true);
    const full = (await fixture.admin.rpc("reserve_demo_kit", { burst_cap: 5, daily_cap: 3 })).data[0];
    expect(full).toMatchObject({ admitted: false, limit_kind: "daily" });
    expect(full.retry_after).toBeGreaterThan(0);
    expect(full.retry_after).toBeLessThanOrEqual(86_400);
  });

  it("clamps caps above the agreed maximum and reports the daily limit", async () => {
    fixture = localFixture();
    const over = await fixture.admin.rpc("reserve_demo_kit", { burst_cap: 6, daily_cap: 30 });
    expect(over.error).not.toBeNull();
    const daily = await fixture.admin.rpc("reserve_demo_kit", { burst_cap: 5, daily_cap: 0 });
    expect(daily.data).toMatchObject([{ admitted: false, limit_kind: "daily" }]);
    expect(daily.data[0].retry_after).toBeGreaterThan(0);
    expect(daily.data[0].retry_after).toBeLessThanOrEqual(86_400);
  });

  it("creates a kit through the endpoint whose two logins work together with no mailbox", async () => {
    fixture = localFixture();
    const origin = "http://localhost:3000";
    const app = createApplication({
      origin,
      client: fixture.client,
      demoKits: {
        reserve: databaseReservation(() => fixture.admin, { burst: 5, daily: 30 }),
        admin: () => fixture.admin.auth.admin,
        admitLocal: createDemoKitAdmission(),
      },
    });
    const response = await app(
      new Request(`${origin}/api/demo-kits`, {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: "{}",
      }),
    );
    expect(response.status).toBe(201);
    const [pm, developer] = (await response.json()).kit.accounts;
    const signIn = async (account: { email: string; password: string }) => {
      const client = fixture.client();
      const { data, error } = await client.auth.signInWithPassword(account);
      expect(error).toBeNull();
      created.push(data.user!.id);
      return { client, id: data.user!.id };
    };
    const pmSession = await signIn(pm);
    const devSession = await signIn(developer);
    for (const session of [pmSession, devSession])
      expect((await session.client.from("organisation_members").select("organisation_id")).data).toEqual([]);
    const org = (await pmSession.client.rpc("create_organisation", { organisation_name: "Demo trial" })).data;
    expect(
      (await pmSession.client.rpc("invite_member", { target_org: org, target_email: developer.email })).data,
    ).toEqual({
      status: "created",
    });
    const invitation = (await pmSession.client.rpc("list_invitations", { target_org: org })).data[0].id;
    expect(
      (await devSession.client.rpc("respond_invitation", { invitation_id: invitation, decision: "accept" })).error,
    ).toBeNull();
    const profiles = await fixture.admin
      .from("profiles")
      .select("app_role,username")
      .in("id", [pmSession.id, devSession.id]);
    expect(profiles.data).toEqual(
      expect.arrayContaining([
        { app_role: "PM", username: pm.username },
        { app_role: "Developer", username: developer.username },
      ]),
    );
  });
});

describe.skipIf(!localEnabled)("demo kit removal", () => {
  let fixture: ReturnType<typeof localFixture>;
  afterEach(async () => {
    await fixture?.cleanup();
  });
  const lines: string[] = [];
  const print = (line: string) => lines.push(line);
  async function kit() {
    const code = randomBytes(16).toString("hex");
    const ids: string[] = [];
    for (const [role, slug] of [
      ["PM", "pm"],
      ["Developer", "dev"],
    ]) {
      const { data, error } = await fixture.admin.auth.admin.createUser({
        email: `demo-${slug}-${code}@example.com`,
        password,
        email_confirm: true,
        user_metadata: { role, username: `demo_${slug}_${code.slice(0, 8)}` },
        app_metadata: { demo_kit: code },
      });
      expect(error).toBeNull();
      ids.push(data.user!.id);
    }
    return { code, ids };
  }
  const exists = async (id: string) => Boolean((await fixture.admin.auth.admin.getUserById(id)).data.user);

  it("finds kits by their server-side marker only, and a dry run deletes nothing", async () => {
    fixture = localFixture();
    const first = await kit();
    const second = await kit();
    // Decoys: a demo-looking email and a self-written user_metadata marker.
    const decoy = await fixture.actor("PM", true, `demo-pm-${randomBytes(16).toString("hex")}@example.com`);
    await decoy.client.auth.updateUser({ data: { demo_kit: first.code } });
    lines.length = 0;
    const dry = await removeDemoKits(fixture.admin, { kit: first.code, yes: false }, print);
    expect(dry).toEqual({ kits: 1, accounts: 2, deleted: 0 });
    for (const id of [...first.ids, ...second.ids, decoy.id]) expect(await exists(id)).toBe(true);
    expect(lines.join("\n")).toContain("Dry run");
    expect(lines.join("\n")).not.toMatch(/@|[0-9a-f]{32}|127\.0\.0\.1/);

    const removed = await removeDemoKits(fixture.admin, { kit: first.code, yes: true }, print);
    expect(removed).toEqual({ kits: 1, accounts: 2, deleted: 2 });
    for (const id of first.ids) expect(await exists(id)).toBe(false);
    for (const id of [...second.ids, decoy.id]) expect(await exists(id)).toBe(true);

    await removeDemoKits(fixture.admin, { kit: null, yes: true }, print);
    for (const id of second.ids) expect(await exists(id)).toBe(false);
    expect(await exists(decoy.id)).toBe(true);
  });

  it("warns that organisations the kit created go with it, including other people's memberships", async () => {
    fixture = localFixture();
    // Start from no kits, so the --all counts below are exact.
    await removeDemoKits(fixture.admin, { kit: null, yes: true }, () => {});
    const { code, ids } = await kit();
    const pm = fixture.client();
    await pm.auth.signInWithPassword({ email: `demo-pm-${code}@example.com`, password });
    const org = (await pm.rpc("create_organisation", { organisation_name: "Kit organisation" })).data;
    const outsider = await fixture.actor("Developer");
    await pm.rpc("invite_member", { target_org: org, target_email: outsider.email });
    const invitation = (await pm.rpc("list_invitations", { target_org: org })).data[0].id;
    await outsider.client.rpc("respond_invitation", { invitation_id: invitation, decision: "accept" });
    // A second kit organisation, so the counts must add up across one-id batches.
    const pm2 = await kit();
    const second = fixture.client();
    await second.auth.signInWithPassword({
      email: (await fixture.admin.auth.admin.getUserById(pm2.ids[0])).data.user!.email!,
      password,
    });
    await second.rpc("create_organisation", { organisation_name: "Second kit organisation" });
    lines.length = 0;
    await removeDemoKits(fixture.admin, { kit: null, yes: false, batch: 1 }, print);
    expect(lines.join("\n")).toContain("also deletes 2 organisations");
    expect(lines.join("\n")).toContain("1 membership of other accounts");
    lines.length = 0;
    await removeDemoKits(fixture.admin, { kit: code, yes: false }, print);
    const report = lines.join("\n");
    expect(report).toContain("1 organisation");
    expect(report).toContain("1 membership of other accounts");
    await removeDemoKits(fixture.admin, { kit: code, yes: true }, print);
    expect(await exists(ids[0])).toBe(false);
    expect(await exists(outsider.id)).toBe(true);
    await removeDemoKits(fixture.admin, { kit: pm2.code, yes: true }, print);
  });
});

describe("demo kit removal arguments", () => {
  it("needs a project that matches the target and exactly one selection", () => {
    const local = "http://127.0.0.1:55321";
    const hosted = "https://abcdefghijklmnopqrst.supabase.co";
    const code = "a".repeat(32);
    expect(removalOptions(["--project", "local", "--all"], local)).toEqual({ kit: null, yes: false });
    expect(removalOptions(["--project", "abcdefghijklmnopqrst", "--kit", code, "--yes"], hosted)).toEqual({
      kit: code,
      yes: true,
    });
    for (const argv of [
      ["--all"],
      ["--project", "local", "--all"],
      ["--project", "otherprojectrefxxxxx", "--all"],
      ["--project", "abcdefghijklmnopqrst"],
      ["--project", "abcdefghijklmnopqrst", "--all", "--kit", code],
      ["--project", "abcdefghijklmnopqrst", "--kit", "ABC"],
      ["--project", "abcdefghijklmnopqrst", "--all", "--force"],
    ])
      expect(() => removalOptions(argv, hosted)).toThrow();
  });
});
