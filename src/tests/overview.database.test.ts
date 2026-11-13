import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { localEnabled, localFixture } from "./local.fixture";

type Fixture = ReturnType<typeof localFixture>;
type Actor = Awaited<ReturnType<Fixture["actor"]>>;
const today = "2026-11-13";

async function join(admin: Actor, org: string, actor: Actor) {
  await admin.client.rpc("invite_member", { target_org: org, target_email: actor.email });
  const invitation = (await actor.client.rpc("list_invitations")).data[0].id;
  await actor.client.rpc("respond_invitation", { invitation_id: invitation, decision: "accept" });
}

/** Publishes one ticket with the given delivery fields, then moves it to `status`. */
async function ticket(
  author: Actor,
  org: string,
  delivery: { due_date?: string; priority?: string; assignee_ids?: string[]; status?: string; publish?: boolean },
) {
  const draft = (await author.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
  const args = { target_org: org, request_id: draft.id };
  const { status, publish = true, ...changes } = delivery;
  if (Object.keys(changes).length)
    expect((await author.client.rpc("update_delivery", { ...args, expected_revision: 1, changes })).error).toBeNull();
  if (!publish) return draft.id as string;
  const published = await author.client.rpc("publish_request", {
    ...args,
    expected_revision: 1,
    content: { title: "Ticket " + randomUUID().slice(0, 8), description: "Overview fixture" },
    acknowledged: true,
    first_submission: true,
  });
  expect(published.error).toBeNull();
  if (status)
    expect(
      (
        await author.client.rpc("update_delivery", {
          ...args,
          expected_revision: published.data.delivery_revision,
          changes: { status },
        })
      ).error,
    ).toBeNull();
  return draft.id as string;
}

describe.skipIf(!localEnabled)("organisation overview storage interface", () => {
  let fixture: Fixture;
  afterEach(async () => {
    await fixture?.cleanup();
  });

  it("counts each published ticket once in totals and once per assignee in workload", async () => {
    fixture = localFixture();
    const author = await fixture.actor("PM");
    const otherPm = await fixture.actor("PM");
    const dev1 = await fixture.actor("Developer");
    const dev2 = await fixture.actor("Developer");
    const org = (await author.client.rpc("create_organisation", { organisation_name: "Overview team" })).data;
    for (const actor of [otherPm, dev1, dev2]) await join(author, org, actor);

    await ticket(author, org, { due_date: "2026-11-12", priority: "high", assignee_ids: [dev1.id, dev2.id] });
    await ticket(author, org, { due_date: "2026-11-13", assignee_ids: [dev1.id], status: "in_progress" });
    await ticket(author, org, { due_date: "2026-11-19", status: "in_review" });
    await ticket(author, org, { due_date: "2026-11-20" });
    await ticket(author, org, { due_date: "2026-11-01", assignee_ids: [dev2.id], status: "done" });
    await ticket(author, org, { status: "cancelled" });
    // Private drafts: the author's own counts only in the author's summary; another PM's never counts.
    await ticket(author, org, { due_date: "2026-11-01", assignee_ids: [dev1.id], publish: false });
    await ticket(otherPm, org, { due_date: "2026-11-01", assignee_ids: [dev1.id], publish: false });

    const read = (actor: Actor) => actor.client.rpc("organisation_overview", { target_org: org, viewer_day: today });
    const forDev = await read(dev1);
    expect(forDev.error).toBeNull();
    expect(forDev.data.totals).toEqual({
      to_do: 2,
      in_progress: 1,
      in_review: 1,
      done: 1,
      cancelled: 1,
      overdue: 1,
      due_soon: 2,
    });
    expect(forDev.data.mine).toEqual({ open: 2, overdue: 1 });
    expect(forDev.data.workload.unassigned).toEqual({ open: 2, overdue: 0, high: 0 });
    expect(forDev.data.workload.member_total).toBe(4);
    const rows = forDev.data.workload.members;
    expect(rows.slice(0, 2)).toEqual([
      { user_id: dev1.id, username: dev1.username, app_role: "Developer", open: 2, overdue: 1, high: 1 },
      { user_id: dev2.id, username: dev2.username, app_role: "Developer", open: 1, overdue: 1, high: 1 },
    ]);
    expect(rows.slice(2).map((row: { username: string }) => row.username)).toEqual(
      [author.username, otherPm.username].sort(),
    );
    expect(rows.slice(2).every((row: { open: number }) => row.open === 0)).toBe(true);

    expect((await read(author)).data.mine).toEqual({ open: 0, overdue: 0, drafts: 1 });
    expect((await read(otherPm)).data.mine).toEqual({ open: 0, overdue: 0, drafts: 1 });
    expect((await read(otherPm)).data.totals).toEqual(forDev.data.totals);
  });

  it("denies non-members, validates the viewer's day and drops removed members", async () => {
    fixture = localFixture();
    const admin = await fixture.actor("PM");
    const dev = await fixture.actor("Developer");
    const outsider = await fixture.actor("Developer");
    const org = (await admin.client.rpc("create_organisation", { organisation_name: "Guarded overview" })).data;
    const otherOrg = (await outsider.client.rpc("create_organisation", { organisation_name: "Elsewhere" })).data;
    await join(admin, org, dev);
    await ticket(admin, org, { due_date: "2026-11-12", assignee_ids: [dev.id] });

    const overview = (actor: { client: Actor["client"] }, viewer_day: unknown = today, target_org = org) =>
      actor.client.rpc("organisation_overview", { target_org, viewer_day });
    expect((await overview(outsider)).error?.code).toBe("42501");
    expect((await overview(admin, today, otherOrg)).error?.code).toBe("42501");
    expect((await overview({ client: fixture.client() })).error).not.toBeNull();
    for (const bad of ["2026-02-30", "13/11/2026", "", null, "infinity", "0000-01-01"])
      expect((await overview(admin, bad)).error?.code).toBe("22023");
    for (const edge of ["0001-01-01", "9999-12-31"]) expect((await overview(admin, edge)).error).toBeNull();

    expect((await overview(admin)).data.workload.members.map((row: { user_id: string }) => row.user_id)).toContain(
      dev.id,
    );
    await admin.client.rpc("change_member", { target_org: org, target_user: dev.id, decision: "remove" });
    const after = (await overview(admin)).data;
    expect(after.workload.members.map((row: { user_id: string }) => row.user_id)).toEqual([admin.id]);
    expect(after.workload.unassigned).toEqual({ open: 1, overdue: 1, high: 0 });
    expect((await overview(dev)).error?.code).toBe("42501");
  });

  it("lists exactly the tickets behind each overview count", async () => {
    fixture = localFixture();
    const pm = await fixture.actor("PM");
    const dev = await fixture.actor("Developer");
    const org = (await pm.client.rpc("create_organisation", { organisation_name: "Drill-down" })).data;
    await join(pm, org, dev);
    const overdue = await ticket(pm, org, { due_date: "2026-11-12", priority: "high", assignee_ids: [dev.id] });
    const dueToday = await ticket(pm, org, { due_date: "2026-11-13", status: "in_review" });
    const dueLast = await ticket(pm, org, { due_date: "2026-11-19", assignee_ids: [dev.id] });
    const later = await ticket(pm, org, { due_date: "2026-11-20" });
    const undated = await ticket(pm, org, { status: "in_progress" });
    await ticket(pm, org, { due_date: "2026-11-01", status: "done" });
    const draft = await ticket(pm, org, { due_date: "2026-11-01", publish: false });

    const list = async (filters: Record<string, string>) => {
      const page = await dev.client.rpc("list_ticket_page", { target_org: org, filters });
      expect(page.error).toBeNull();
      return page.data.items.map((item: { id: string }) => item.id).sort();
    };
    expect(await list({ status: "open" })).toEqual([overdue, dueToday, dueLast, later, undated].sort());
    expect(await list({ status: "overdue", today })).toEqual([overdue]);
    expect(await list({ status: "due_soon", today })).toEqual([dueToday, dueLast].sort());
    expect(await list({ status: "overdue", assignee: dev.id, today })).toEqual([overdue]);
    expect(await list({ status: "open", assignee: dev.id, priority: "high" })).toEqual([overdue]);
    expect(await list({ status: "open", assignee: "unassigned" })).toEqual([dueToday, later, undated].sort());
    expect(
      (await pm.client.rpc("list_ticket_page", { target_org: org, filters: { status: "draft" } })).data.items.map(
        (item: { id: string }) => item.id,
      ),
    ).toEqual([draft]);

    const counts = (await dev.client.rpc("organisation_overview", { target_org: org, viewer_day: today })).data;
    expect(counts.totals.overdue).toBe(1);
    expect(counts.totals.due_soon).toBe(2);
    for (const status of ["overdue", "due_soon"]) {
      const missingDay = await dev.client.rpc("list_ticket_page", { target_org: org, filters: { status } });
      expect(missingDay.error?.code).toBe("22023");
    }
    const unknown = await dev.client.rpc("list_ticket_page", { target_org: org, filters: { status: "late" } });
    expect(unknown.error?.code).toBe("22023");
  });
});
