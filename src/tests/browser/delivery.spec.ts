import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { localFixture } from "../local.fixture";
const origin = process.env.SPECFORGE_BROWSER_ORIGIN ?? "http://localhost:3000";
async function login(page: Page, actor: { email: string; password: string }) {
  await page.goto("/sign-in"); await page.getByLabel("Email address").fill(actor.email);
  await page.getByLabel("Password", { exact: true }).fill(actor.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click(); await expect(page).toHaveURL(/\/workspace$/);
}
test("one ticket action publishes and updates text and delivery together", async ({ page }) => {
  const fixture = localFixture(); const pm = await fixture.actor("PM");
  const org = (await pm.client.rpc("create_organisation", { organisation_name: "Whole ticket browser" })).data;
  const draft = (await pm.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
  try {
    await login(page, pm); await page.goto(`/organisations/${org}/requests/${draft.id}`);
    await expect(page.getByLabel("Title", { exact: true })).toBeVisible();
    await expect(page.getByText("All draft fields autosave privately after a short pause.", { exact: false })).toHaveCount(0);
    await expect(page.getByLabel("I acknowledge the assumptions and unresolved questions.")).toHaveCount(0);
    await page.getByLabel("Title", { exact: true }).fill("Publish everything");
    await page.getByLabel("Description", { exact: true }).fill("Private text and scheduling");
    await page.getByLabel("Due date", { exact: true }).fill("2026-12-20");
    await page.getByLabel("Priority", { exact: true }).selectOption("high");
    await expect(page.getByRole("button", { name: "Save delivery details", exact: true })).toHaveCount(0);
    await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Due date", { exact: true })).toHaveValue("2026-12-20");
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Publish everything");
    await expect(page.getByRole("region", { name: "Task visibility", exact: true })).toHaveText("This task is private and unpublished");
    // Publish must include delivery changes made just before clicking.
    await page.getByLabel("Priority", { exact: true }).selectOption("urgent");
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByRole("button", { name: "Update", exact: true })).toBeVisible();
    await page.getByLabel("Title", { exact: true }).fill("Updated everything");
    await page.getByLabel("Due date", { exact: true }).fill("2026-12-25");
    await page.waitForTimeout(1000);
    const before = (await pm.client.rpc("read_request", { target_org: org, request_id: draft.id })).data;
    expect(before.fields.title).toBe("Publish everything"); expect(before.due_date).toBe("2026-12-20");
    await page.getByRole("button", { name: "Update", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Updated everything");
    await expect(page.getByLabel("Due date", { exact: true })).toHaveValue("2026-12-25");
  } finally { await fixture.cleanup(); }
});

test("author schedules work; assignee updates status and comments; list filters and mobile details work", async ({ page, browser }) => {
  const fixture = localFixture(); const pm = await fixture.actor("PM"); const dev = await fixture.actor("Developer");
  const org = (await pm.client.rpc("create_organisation", { organisation_name: "Delivery workspace" })).data;
  await pm.client.rpc("invite_member", { target_org: org, target_email: dev.email });
  await dev.client.rpc("respond_invitation", { invitation_id: (await dev.client.rpc("list_invitations")).data[0].id, decision: "accept" });
  const draft = (await pm.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
  await pm.client.rpc("save_draft", { target_org: org, request_id: draft.id, expected_revision: 1, content: { title: "Release search", description: "Find saved requirements" } });
  const context = await browser.newContext({ baseURL: origin }); const reader = await context.newPage();
  try {
    await login(page, pm); await page.goto(`/organisations/${org}/requests/${draft.id}`);
    await page.getByLabel("Due date", { exact: true }).fill("2026-12-20");
    await page.getByLabel("Priority", { exact: true }).selectOption("high");
    await page.getByText("Assignees (0/5)", { exact: true }).click();
    await page.getByLabel(`Assign ${dev.id}`, { exact: true }).check();
    await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByRole("region", { name: "Task visibility", exact: true })).toContainText("This task is visible to members of the");
    await login(reader, dev); await reader.goto(`/organisations/${org}/requests/${draft.id}`);
    await expect(reader.getByLabel("Due date", { exact: true })).toHaveCount(0);
    await reader.getByLabel("Delivery status", { exact: true }).selectOption("in_progress");
    await reader.getByRole("button", { name: "Update", exact: true }).click();
    await expect(reader.getByText("Delivery details saved.", { exact: true })).toBeVisible();
    await reader.getByLabel("Comment", { exact: true }).fill("<script>window.ticketInjected = true</script>");
    await reader.getByRole("button", { name: "Post comment", exact: true }).click();
    await expect(reader.locator(".activity-entry .request-text").filter({ hasText: "<script>window.ticketInjected = true</script>" })).toBeVisible();
    await expect(reader.getByText("Loading activity…", { exact: true })).toHaveCount(0);
    expect(await reader.evaluate(() => "ticketInjected" in window)).toBe(false);
    await reader.setViewportSize({ width: 390, height: 844 });
    expect(await reader.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await reader.screenshot({ path: "test-results/delivery-mobile.png", fullPage: true });
    await page.screenshot({ path: "test-results/delivery-author.png", fullPage: true });
    await reader.goto(`/organisations/${org}/requests`);
    await reader.getByLabel("Assignee filter", { exact: true }).selectOption("me");
    await reader.getByRole("button", { name: "Apply filters", exact: true }).click();
    await expect(reader.getByRole("link", { name: "Release search", exact: true })).toBeVisible();
    await reader.getByLabel("Status filter", { exact: true }).selectOption("done");
    await reader.getByRole("button", { name: "Apply filters", exact: true }).click();
    await expect(reader.getByText("No tickets match these filters.", { exact: true })).toBeVisible();
  } finally { await context.close(); await fixture.cleanup(); }
});

test("delivery conflicts preserve edits and a lost comment response retries without duplication", async ({ page }) => {
  const fixture = localFixture(); const pm = await fixture.actor("PM");
  const org = (await pm.client.rpc("create_organisation", { organisation_name: "Delivery recovery" })).data;
  const draft = (await pm.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
  const args = { target_org: org, request_id: draft.id };
  await pm.client.rpc("update_delivery", { ...args, expected_revision: 1, changes: { due_date: "2026-12-20" } });
  await pm.client.rpc("publish_request", { ...args, expected_revision: 1, content: { title: "Recover edits", description: "Keep local input safe" }, acknowledged: true, first_submission: true });
  try {
    await login(page, pm); await page.goto(`/organisations/${org}/requests/${draft.id}`);
    await page.getByLabel("Priority", { exact: true }).focus(); await page.keyboard.press("Tab");
    await expect(page.getByLabel("Due date", { exact: true })).toBeFocused();
    await pm.client.rpc("update_delivery", { ...args, expected_revision: 2, changes: { priority: "urgent" } });
    await page.getByLabel("Due date", { exact: true }).fill("2026-12-25");
    await page.getByRole("button", { name: "Update", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "saved request changed" })).toBeVisible();
    await expect(page.getByLabel("Due date", { exact: true })).toHaveValue("2026-12-25");
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "Reload saved version and discard edits", exact: true }).click();
    await expect(page.getByLabel("Priority", { exact: true })).toHaveValue("urgent");
    await expect(page.getByLabel("Due date", { exact: true })).toHaveValue("2026-12-20");
    let dropped = false;
    await page.route(`**/api/organisations/${org}/requests/${draft.id}/activity`, async route => {
      if (route.request().method() === "POST" && !dropped) { dropped = true; await route.fetch(); await route.abort("failed"); }
      else await route.continue();
    });
    await page.getByLabel("Comment", { exact: true }).fill("Keep this comment once");
    await page.getByRole("button", { name: "Post comment", exact: true }).click();
    await expect(page.getByRole("button", { name: "Retry comment", exact: true })).toBeVisible();
    await expect(page.getByLabel("Comment", { exact: true })).toHaveValue("Keep this comment once");
    await page.getByRole("button", { name: "Retry comment", exact: true }).click();
    await expect(page.getByText("Keep this comment once", { exact: true })).toHaveCount(1);
    await expect(page.getByLabel("Comment", { exact: true })).toHaveValue("");
    const activity = (await pm.client.rpc("read_ticket_activity", args)).data;
    expect(activity.entries.filter((entry: { kind: string }) => entry.kind === "comment")).toHaveLength(1);
  } finally { await fixture.cleanup(); }
});

test("delivery edits made during an autosave are saved by the next autosave", async ({ page }) => {
  const fixture = localFixture(); const pm = await fixture.actor("PM");
  const org = (await pm.client.rpc("create_organisation", { organisation_name: "Independent saves" })).data;
  const draft = (await pm.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
  await pm.client.rpc("save_draft", { target_org: org, request_id: draft.id, expected_revision: 1, content: { title: "Keep scheduling", description: "Original content" } });
  let release!: () => void; const hold = new Promise<void>(resolve => { release = resolve; });
  let started!: () => void; const captured = new Promise<void>(resolve => { started = resolve; });
  try {
    await login(page, pm); await page.goto(`/organisations/${org}/requests/${draft.id}`);
    await page.route(`**/api/organisations/${org}/requests/${draft.id}`, async route => {
      if (route.request().method() === "POST" && route.request().postDataJSON().action === "save_draft") {
        const response = await route.fetch(); started(); await hold; await route.fulfill({ response });
      } else await route.continue();
    });
    await page.getByLabel("Description", { exact: true }).fill("New text while scheduling"); await captured;
    await page.getByLabel("Due date", { exact: true }).fill("2026-12-20");
    release(); await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
    await expect(page.getByRole("button", { name: "Publish", exact: true })).toBeEnabled();
    await page.reload();
    await expect(page.getByLabel("Due date", { exact: true })).toHaveValue("2026-12-20");
  } finally { release?.(); await fixture.cleanup(); }
});

test("a failed reader refresh preserves typed comments and unsaved status", async ({ page }) => {
  const fixture = localFixture(); const pm = await fixture.actor("PM"); const dev = await fixture.actor("Developer");
  const org = (await pm.client.rpc("create_organisation", { organisation_name: "Reader recovery" })).data;
  await pm.client.rpc("invite_member", { target_org: org, target_email: dev.email });
  await dev.client.rpc("respond_invitation", { invitation_id: (await dev.client.rpc("list_invitations")).data[0].id, decision: "accept" });
  const draft = (await pm.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
  const args = { target_org: org, request_id: draft.id };
  await pm.client.rpc("update_delivery", { ...args, expected_revision: 1, changes: { due_date: "2026-12-20", assignee_ids: [dev.id] } });
  await pm.client.rpc("publish_request", { ...args, expected_revision: 1, content: { title: "Keep reader input", description: "Read together" }, acknowledged: true, first_submission: true });
  try {
    await login(page, dev); await page.goto(`/organisations/${org}/requests/${draft.id}`);
    await page.getByLabel("Comment", { exact: true }).fill("Unsaved comment survives refresh");
    await page.getByLabel("Delivery status", { exact: true }).selectOption("in_review");
    await page.route(`**/api/organisations/${org}/requests/${draft.id}`, route => route.fulfill({ status: 503, json: { error: "Temporary read failure" } }));
    await page.getByRole("button", { name: "Refresh saved request", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Temporary read failure" })).toBeVisible();
    await expect(page.getByLabel("Comment", { exact: true })).toHaveValue("Unsaved comment survives refresh");
    await expect(page.getByLabel("Delivery status", { exact: true })).toHaveValue("in_review");
  } finally { await fixture.cleanup(); }
});

test("member search ignores an older load-more response", async ({ page }) => {
  const fixture = localFixture(); const pm = await fixture.actor("PM");
  const org = (await pm.client.rpc("create_organisation", { organisation_name: "Member paging" })).data;
  const draft = (await pm.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
  await pm.client.rpc("save_draft", { target_org: org, request_id: draft.id, expected_revision: 1, content: { title: "Member search", description: "Choose a member" } });
  const first = randomUUID(); const oldPage = randomUUID(); const found = randomUUID();
  let release!: () => void; const hold = new Promise<void>(resolve => { release = resolve; });
  let started!: () => void; const captured = new Promise<void>(resolve => { started = resolve; });
  try {
    await login(page, pm);
    await page.route(`**/api/organisations/${org}/ticket-members?**`, async route => {
      const query = new URL(route.request().url()).searchParams;
      if (query.has("after")) { started(); await hold; await route.fulfill({ json: { members: [{ user_id: oldPage, app_role: "Developer" }], next_cursor: null } }); }
      else await route.fulfill({ json: { members: [{ user_id: query.get("search") ? found : first, app_role: "Developer" }], next_cursor: query.get("search") ? null : first } });
    });
    await page.goto(`/organisations/${org}/requests/${draft.id}`); await page.getByText("Assignees (0/5)", { exact: true }).click();
    await page.getByRole("button", { name: "Load more members", exact: true }).click(); await captured;
    await page.getByLabel("Search members", { exact: true }).fill("needle");
    await expect(page.getByLabel(`Assign ${found}`, { exact: true })).toBeVisible();
    const finished = page.waitForResponse(response => response.url().includes("ticket-members?after="));
    release(); await finished; await page.waitForTimeout(150); // Let the stale page continuation reach React.
    await expect(page.getByLabel(`Assign ${oldPage}`, { exact: true })).toHaveCount(0);
    await expect(page.getByLabel(`Assign ${found}`, { exact: true })).toBeVisible();
  } finally { release?.(); await fixture.cleanup(); }
});

test("posting during an older activity read retains a complete, duplicate-free feed", async ({ page }) => {
  const fixture = localFixture(); const pm = await fixture.actor("PM");
  const org = (await pm.client.rpc("create_organisation", { organisation_name: "Activity paging" })).data;
  const draft = (await pm.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
  const args = { target_org: org, request_id: draft.id };
  await pm.client.rpc("update_delivery", { ...args, expected_revision: 1, changes: { due_date: "2026-12-20" } });
  await pm.client.rpc("publish_request", { ...args, expected_revision: 1, content: { title: "Keep activity", description: "Complete history" }, acknowledged: true, first_submission: true });
  for (let i = 0; i < 51; i++) await pm.client.rpc("update_delivery", { ...args, expected_revision: i + 2, changes: { priority: i % 2 ? "low" : "high" } });
  let release!: () => void; const hold = new Promise<void>(resolve => { release = resolve; });
  let started!: () => void; const captured = new Promise<void>(resolve => { started = resolve; });
  let held = false;
  try {
    await login(page, pm); await page.goto(`/organisations/${org}/requests/${draft.id}`);
    await page.route(`**/api/organisations/${org}/requests/${draft.id}/activity?before=*`, async route => {
      if (!held) { held = true; const response = await route.fetch(); started(); await hold; await route.fulfill({ response }); }
      else await route.continue();
    });
    await page.getByRole("button", { name: "Load older activity", exact: true }).click(); await captured;
    await page.getByLabel("Comment", { exact: true }).fill("New boundary event");
    await page.getByRole("button", { name: "Post comment", exact: true }).click();
    await expect(page.getByText("New boundary event", { exact: true })).toBeVisible();
    const finished = page.waitForResponse(response => response.url().includes("activity?before="));
    release(); await finished; await page.waitForTimeout(150); // Let the stale page continuation reach React.
    await page.getByRole("button", { name: "Load older activity", exact: true }).click();
    await expect(page.locator(".activity-entry")).toHaveCount(53);
    await expect(page.getByText("Published this ticket", { exact: true })).toHaveCount(1);
  } finally { release?.(); await fixture.cleanup(); }
});

test("reader refresh loads new delivery details without losing a pending status edit", async ({ page }) => {
  const fixture = localFixture(); const pm = await fixture.actor("PM"); const dev = await fixture.actor("Developer");
  const org = (await pm.client.rpc("create_organisation", { organisation_name: "Delivery refresh" })).data;
  await pm.client.rpc("invite_member", { target_org: org, target_email: dev.email });
  await dev.client.rpc("respond_invitation", { invitation_id: (await dev.client.rpc("list_invitations")).data[0].id, decision: "accept" });
  const draft = (await pm.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
  const args = { target_org: org, request_id: draft.id };
  await pm.client.rpc("save_ticket", { ...args, expected_revision: 1, expected_delivery_revision: 1,
    content: { title: "Refresh delivery", description: "Read the current schedule" }, delivery_changes: { due_date: "2026-12-20", assignee_ids: [dev.id] }, action: "submit", acknowledged: true });
  try {
    await login(page, dev); await page.goto(`/organisations/${org}/requests/${draft.id}`);
    await expect(page.getByText("Medium", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Delivery status", { exact: true })).toHaveValue("to_do");
    await pm.client.rpc("update_delivery", { ...args, expected_revision: 2, changes: { priority: "urgent", due_date: "2026-12-25" } });
    await page.getByRole("button", { name: "Refresh saved request", exact: true }).click();
    await expect(page.getByText("Urgent", { exact: true })).toBeVisible();
    await expect(page.getByText("2026-12-25", { exact: true })).toBeVisible();
    await page.getByLabel("Delivery status", { exact: true }).selectOption("in_review");
    await pm.client.rpc("update_delivery", { ...args, expected_revision: 3, changes: { priority: "low" } });
    await page.getByRole("button", { name: "Refresh saved request", exact: true }).click();
    await expect(page.getByLabel("Delivery status", { exact: true })).toHaveValue("in_review");
  } finally { await fixture.cleanup(); }
});

test("a failed Update preserves editable metadata and a lost response confirms the whole ticket", async ({ page }) => {
  const fixture = localFixture(); const pm = await fixture.actor("PM");
  const org = (await pm.client.rpc("create_organisation", { organisation_name: "Update recovery" })).data;
  const draft = (await pm.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
  await pm.client.rpc("save_ticket", { target_org: org, request_id: draft.id, expected_revision: 1, expected_delivery_revision: 1,
    content: { title: "Correct scheduling", description: "Keep local edits" }, delivery_changes: { due_date: "2026-12-20" }, action: "submit", acknowledged: true });
  try {
    await login(page, pm); await page.goto(`/organisations/${org}/requests/${draft.id}`);
    let fail = true;
    await page.route(`**/api/organisations/${org}/requests/${draft.id}`, async route => {
      if (route.request().method() === "POST" && fail) {
        fail = false; await route.fulfill({ status: 503, json: { error: "Temporary save failure" } });
      } else await route.continue();
    });
    await page.getByLabel("Title", { exact: true }).fill("Keep corrected scheduling");
    await page.getByLabel("Due date", { exact: true }).fill("");
    await page.getByRole("button", { name: "Update", exact: true }).click();
    await page.getByRole("button", { name: "Check saved version", exact: true }).click();
    await expect(page.getByText(/The saved version is unchanged/)).toBeVisible();
    await expect(page.getByLabel("Due date", { exact: true })).toBeEnabled();
    await page.getByLabel("Due date", { exact: true }).fill("2026-12-25");
    await page.route(`**/api/organisations/${org}/requests/${draft.id}`, async route => {
      if (route.request().method() === "POST") { await route.fetch(); await route.abort("failed"); }
      else await route.continue();
    });
    await page.getByRole("button", { name: "Update", exact: true }).click();
    await page.getByRole("button", { name: "Check saved version", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Keep corrected scheduling");
    await expect(page.getByLabel("Due date", { exact: true })).toHaveValue("2026-12-25");
  } finally { await fixture.cleanup(); }
});


test("Publish allows an unscheduled ticket and Update can remove its due date", async ({ page }) => {
  const fixture = localFixture(); const pm = await fixture.actor("PM");
  const org = (await pm.client.rpc("create_organisation", { organisation_name: "Unscheduled browser" })).data;
  const draft = (await pm.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
  try {
    await login(page, pm); await page.goto(`/organisations/${org}/requests/${draft.id}`);
    await page.getByLabel("Title", { exact: true }).fill("Optional schedule");
    await page.getByLabel("Description", { exact: true }).fill("Publish the work before choosing a deadline.");
    await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
    await page.getByRole("button", { name: "Publish", exact: true }).click({ timeout: 5000 });
    await expect(page.getByRole("button", { name: "Update", exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Due date", { exact: true })).toHaveValue("");
    await page.getByLabel("Due date", { exact: true }).fill("2026-12-20");
    await page.getByRole("button", { name: "Update", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
    await page.getByLabel("Due date", { exact: true }).fill("");
    await page.getByRole("button", { name: "Update", exact: true }).click();
    await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Due date", { exact: true })).toHaveValue("");
    await expect(page.getByRole("button", { name: "Update", exact: true })).toBeVisible();
  } finally { await fixture.cleanup(); }
});
