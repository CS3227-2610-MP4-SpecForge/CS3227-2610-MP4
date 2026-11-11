import { savedTicketStatus, selectPill, setDueDate } from "./ui.fixture";
import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { localFixture } from "../local.fixture";
const origin = process.env.SPECFORGE_BROWSER_ORIGIN ?? "http://localhost:3000";
async function login(page: Page, actor: { email: string; password: string }) {
  await page.goto("/sign-in"); await page.getByLabel("Email address").fill(actor.email);
  await page.getByLabel("Password", { exact: true }).fill(actor.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click(); await expect(page).toHaveURL(/\/workspace$/);
}
test("purple date picker selects dates, validates exact input and preserves optional scheduling", async ({ page }) => {
  const fixture = localFixture(); const pm = await fixture.actor("PM");
  const org = (await pm.client.rpc("create_organisation", { organisation_name: "Purple calendar" })).data;
  const draft = (await pm.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
  await pm.client.rpc("update_delivery", { target_org: org, request_id: draft.id, expected_revision: 1, changes: { due_date: "2026-12-20" } });
  try {
    await login(page, pm); await page.goto(`/organisations/${org}/requests/${draft.id}`);
    const field = page.getByRole("button", { name: /^Due date / });
    const popup = page.getByRole("dialog", { name: "Due date calendar", exact: true });
    await field.click(); await expect(popup).toBeVisible();
    await expect(popup.getByRole("button", { name: "Sunday, 20 December 2026", exact: true })).toBeFocused();
    await popup.getByRole("button", { name: "Next month", exact: true }).click();
    await popup.getByRole("button", { name: "Friday, 15 January 2027", exact: true }).click();
    await expect(field).toHaveText("15 Jan 2027"); await expect(field).toBeFocused();
    await expect(popup).toHaveCount(0);
    await expect(savedTicketStatus(page)).toBeVisible();
    await page.reload(); await expect(field).toHaveText("15 Jan 2027");
    await field.click(); await popup.getByLabel("Exact date", { exact: true }).fill("2027-02-30");
    await popup.getByRole("button", { name: "Apply date", exact: true }).click();
    await expect(popup.getByRole("alert")).toContainText("Enter a valid date");
    await expect(field).toHaveText("15 Jan 2027");
    await popup.getByLabel("Exact date", { exact: true }).fill("2028-02-29");
    await popup.getByRole("button", { name: "Apply date", exact: true }).click();
    await expect(field).toHaveText("29 Feb 2028");
    await field.click(); await page.keyboard.press("ArrowRight"); await page.keyboard.press("Enter");
    await expect(field).toHaveText("1 Mar 2028");
    await field.click(); await popup.getByLabel("Exact date", { exact: true }).fill("2030-01-01");
    await page.keyboard.press("Escape"); await expect(field).toBeFocused(); await expect(field).toHaveText("1 Mar 2028");
    await field.click(); await page.getByLabel("Title", { exact: true }).click();
    await expect(popup).toHaveCount(0);
    await field.click(); await popup.getByRole("button", { name: "Clear date", exact: true }).click();
    await expect(field).toHaveText("Unscheduled");
    await page.getByLabel("Title", { exact: true }).fill("Polished calendar");
    await page.getByLabel("Description", { exact: true }).fill("Pick a purple date or leave scheduling open.");
    await expect(savedTicketStatus(page)).toBeVisible();
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await field.click(); await popup.getByLabel("Exact date", { exact: true }).fill("2030-06-15");
    await popup.getByRole("button", { name: "Apply date", exact: true }).click();
    await page.getByRole("button", { name: "Update", exact: true }).click();
    await expect(savedTicketStatus(page)).toBeVisible();
    await page.reload(); await expect(field).toHaveText("15 Jun 2030");
    await field.click(); await expect(popup).toBeVisible(); await page.screenshot({ path: "test-results/purple-calendar-desktop.png" });
    await page.keyboard.press("Escape"); await page.setViewportSize({ width: 390, height: 844 }); await field.click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await expect(popup).toBeVisible(); await page.screenshot({ path: "test-results/purple-calendar-mobile.png" });
    await page.keyboard.press("Escape"); await page.setViewportSize({ width: 740, height: 300 });
    await field.evaluate(element => element.scrollIntoView({ block: "center" })); await field.click();
    const bounds = (await popup.boundingBox())!;
    expect(bounds.y).toBeGreaterThanOrEqual(0); expect(bounds.y + bounds.height).toBeLessThanOrEqual(300);
  } finally { await fixture.cleanup(); }
});

test.describe("calendar date boundaries", () => {
  test.use({ timezoneId: "America/Los_Angeles" });
  test("keeps local date boundaries, Today and year navigation correct in a negative timezone", async ({ page }) => {
    const fixture = localFixture(); const pm = await fixture.actor("PM");
    const org = (await pm.client.rpc("create_organisation", { organisation_name: "Calendar boundaries" })).data;
    const draft = (await pm.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
    try {
      await login(page, pm); await page.goto(`/organisations/${org}/requests/${draft.id}`);
      const field = page.getByRole("button", { name: /^Due date / });
      const popup = page.getByRole("dialog", { name: "Due date calendar", exact: true });
      for (const value of ["0001-01-01", "0099-12-31", "2000-02-29", "9999-12-31"]) {
        const request = page.waitForRequest(request => request.method() === "POST" && request.url().endsWith(`/requests/${draft.id}`) && request.postDataJSON().delivery?.changes.due_date === value);
        await setDueDate(page, value); await request;
        await expect(savedTicketStatus(page)).toBeVisible();
        await page.reload(); await field.click();
        await expect(popup.getByLabel("Exact date", { exact: true })).toHaveValue(value);
        await page.keyboard.press("Escape");
      }
      await field.click();
      await expect(popup.getByRole("button", { name: "Next month", exact: true })).toBeDisabled();
      for (const value of ["0000-01-01", "1900-02-29", "2026-12", "2026-12-20extra", "10000-01-01"]) {
        await popup.getByLabel("Exact date", { exact: true }).fill(value);
        await popup.getByRole("button", { name: "Apply date", exact: true }).click();
        await expect(popup.getByRole("alert")).toContainText("Enter a valid date");
        await expect(field).toHaveText("31 Dec 9999");
      }
      await popup.getByLabel("Calendar year", { exact: true }).fill("2026");
      await popup.getByLabel("Calendar year", { exact: true }).press("Enter");
      await popup.getByLabel("Calendar month", { exact: true }).selectOption("0");
      await popup.getByRole("button", { name: "Saturday, 10 January 2026", exact: true }).click();
      await expect(field).toHaveText("10 Jan 2026");
      await field.click(); await popup.getByRole("button", { name: "Today", exact: true }).click();
      const today = await page.evaluate(() => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date()));
      await expect(field).toHaveText(today);
      await field.click(); await popup.getByRole("button", { name: "Apply date", exact: true }).focus(); await page.keyboard.press("Tab");
      await expect(popup).toHaveCount(0);
      await expect(page.getByRole("combobox", { name: "Assignees", exact: true })).toBeFocused();
      await expect(savedTicketStatus(page)).toBeVisible();
    } finally { await fixture.cleanup(); }
  });
});

test("priority and delivery status use accessible colored pill dropdowns", async ({ page }) => {
  const fixture = localFixture(); const pm = await fixture.actor("PM");
  const org = (await pm.client.rpc("create_organisation", { organisation_name: "Pill dropdowns" })).data;
  const draft = (await pm.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
  try {
    await login(page, pm); await page.goto(`/organisations/${org}/requests/${draft.id}`);
    const priority = page.getByRole("combobox", { name: "Priority", exact: true });
    const status = page.getByRole("combobox", { name: "Delivery status", exact: true });
    await expect(status).toBeDisabled();
    await priority.focus(); await priority.press("Space");
    const choices = page.getByRole("listbox", { name: "Priority options", exact: true });
    await expect(choices.getByRole("option")).toHaveText(["Low", "Medium", "High"]);
    await expect(choices.getByRole("option", { name: "Urgent", exact: true })).toHaveCount(0);
    await priority.press("ArrowDown"); await priority.press("Escape");
    await expect(priority).toBeFocused(); await expect(priority).toHaveText("Medium");
    await priority.press("Enter"); await priority.press("End"); await priority.press("Enter");
    await expect(priority).toHaveText("High");
    await priority.click(); await page.getByLabel("Title", { exact: true }).click();
    await expect(choices).toHaveCount(0);
    await priority.click(); await priority.press("Tab");
    await expect(page.getByLabel("Due date", { exact: true })).toBeFocused();
    await expect(choices).toHaveCount(0);
    await page.getByLabel("Title", { exact: true }).fill("Colored work");
    await page.getByLabel("Description", { exact: true }).fill("Three priority labels and shared status pills.");
    await expect(savedTicketStatus(page)).toBeVisible();
    await page.reload(); await expect(priority).toHaveText("High");
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(status).toBeEnabled(); await status.click();
    await expect(page.getByRole("listbox", { name: "Delivery status options", exact: true }).getByRole("option")).toHaveText(["To do", "In progress", "In review", "Done", "Cancelled"]);
    await page.getByRole("option", { name: "Done", exact: true }).click();
    await page.getByRole("button", { name: "Update", exact: true }).click();
    await expect(savedTicketStatus(page)).toBeVisible();
    await page.reload(); await expect(status).toHaveText("Done");
    await page.setViewportSize({ width: 390, height: 844 }); await priority.click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: "test-results/pill-dropdowns-mobile.png", fullPage: true });
    await priority.press("Escape"); await page.goto(`/organisations/${org}/requests`);
    const table = page.getByRole("table", { name: "Requests", exact: true });
    await expect(table.getByRole("columnheader")).toHaveText(["Title", "Owner", "Assignees", "Status", "Priority"]);
    const row = table.getByRole("row").filter({ has: page.getByRole("link", { name: "Colored work", exact: true }) });
    await expect(row.getByRole("cell")).toHaveText(["Colored work", pm.username, "Unassigned", "Done", "High"]);
    await selectPill(page, "Status for Colored work", "In review");
    await expect(row.getByRole("combobox", { name: "Status for Colored work" })).toHaveText("In review");
    const tablePriority = row.getByRole("combobox", { name: "Priority for Colored work" });
    await tablePriority.press("Home"); await tablePriority.press("Enter");
    await expect(tablePriority).toHaveText("Low");
    await expect(tablePriority).toBeFocused();
    await expect(page.getByText("Delivery updated.", { exact: true })).toHaveCount(0);
    await expect(page.getByText("Submitted requests are shared with your team. Drafts are private to their author.")).toHaveCount(0);
    await expect(page.getByRole("checkbox", { name: "Overdue only" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Refresh requests" })).toHaveCount(0);
    const filters = page.getByRole("form", { name: "Ticket filters" });
    await expect(filters.getByRole("combobox")).toHaveCount(4);
    const priorityFilter = filters.getByRole("combobox", { name: "Priority filter" });
    await priorityFilter.press("Enter");
    await expect(filters.getByRole("listbox").getByRole("option")).toHaveText(["All priorities", "Low", "Medium", "High"]);
    await priorityFilter.press("End"); await priorityFilter.press("Enter");
    await expect(priorityFilter).toHaveText("High");
    await filters.getByRole("searchbox", { name: "Search by title" }).fill("nonmatching title");
    await filters.getByRole("button", { name: "Apply search" }).click();
    await expect(page.getByText("No tickets match these filters.", { exact: true })).toBeVisible();
    await page.reload();
    await expect(row.getByRole("combobox", { name: "Priority for Colored work" })).toHaveText("Low");
    await expect(row.getByRole("combobox", { name: "Status for Colored work" })).toHaveText("In review");
    await expect(page.getByText("Loading members…", { exact: true })).toHaveCount(0);
    for (const width of [1280, 390]) {
      await page.setViewportSize({ width, height: 844 });
      const heading = (await page.getByRole("heading", { name: "Requests", exact: true }).boundingBox())!;
      const newTask = (await page.getByRole("button", { name: "New task", exact: true }).boundingBox())!;
      const headingCenter = heading.y + heading.height / 2;
      const buttonCenter = newTask.y + newTask.height / 2;
      expect(Math.abs(headingCenter - buttonCenter)).toBeLessThan(1);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: "test-results/requests-pm-mobile.png", fullPage: true });
  } finally { await fixture.cleanup(); }
});

test("one ticket action publishes and updates text and delivery together", { tag: "@smoke" }, async ({ page }) => {
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
    await setDueDate(page, "2026-12-20");
    await selectPill(page, "Priority", "Low");
    await expect(page.getByRole("button", { name: "Save delivery details", exact: true })).toHaveCount(0);
    await expect(savedTicketStatus(page)).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Due date", { exact: true })).toHaveText("20 Dec 2026");
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Publish everything");
    await expect(page.getByRole("region", { name: "Task visibility", exact: true })).toHaveText("This task is private and unpublished");
    // Publish must include delivery changes made just before clicking.
    await selectPill(page, "Priority", "High");
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByRole("button", { name: "Update", exact: true })).toBeVisible();
    await page.getByLabel("Title", { exact: true }).fill("Updated everything");
    await setDueDate(page, "2026-12-25");
    await page.waitForTimeout(1000);
    const before = (await pm.client.rpc("read_request", { target_org: org, request_id: draft.id })).data;
    expect(before.fields.title).toBe("Publish everything"); expect(before.due_date).toBe("2026-12-20");
    await page.getByRole("button", { name: "Update", exact: true }).click();
    await expect(savedTicketStatus(page)).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Updated everything");
    await expect(page.getByLabel("Due date", { exact: true })).toHaveText("25 Dec 2026");
  } finally { await fixture.cleanup(); }
});

test("email assignees support keyboard selection, self assignment, removal and reload", async ({ page }) => {
  const fixture = localFixture(); const pm = await fixture.actor("PM"); const dev = await fixture.actor("Developer");
  const org = (await pm.client.rpc("create_organisation", { organisation_name: "Email picker" })).data;
  await pm.client.rpc("invite_member", { target_org: org, target_email: dev.email });
  await dev.client.rpc("respond_invitation", { invitation_id: (await dev.client.rpc("list_invitations")).data[0].id, decision: "accept" });
  const draft = (await pm.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
  try {
    await login(page, pm); await page.goto(`/organisations/${org}/requests/${draft.id}`);
    const input = page.getByRole("combobox", { name: "Assignees", exact: true });
    const count = page.getByText(/^\(\d\/5\)$/);
    await expect(count).toHaveText("(0/5)");
    await expect(input).toHaveAccessibleDescription("(0/5)");
    await expect(page.getByText("Search organisation members by email.", { exact: false })).toHaveCount(0);
    await input.fill(dev.email.slice(5, 20).toUpperCase());
    await expect(page.getByRole("option", { name: dev.email, exact: true })).toBeVisible();
    await input.press("ArrowDown"); await input.press("Enter");
    await expect(page.getByRole("button", { name: `Remove ${dev.email}`, exact: true })).toBeVisible();
    await input.fill(pm.email); await page.getByRole("option", { name: pm.email, exact: true }).click();
    await expect(page.getByRole("button", { name: "Assign me", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: `Remove ${pm.email}`, exact: true })).toBeVisible();
    await expect(count).toHaveText("(2/5)");
    await expect(savedTicketStatus(page)).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: `Remove ${dev.email}`, exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: `Remove ${pm.email}`, exact: true })).toBeVisible();
    await page.getByRole("button", { name: `Remove ${dev.email}`, exact: true }).click();
    await expect(count).toHaveText("(1/5)");
    await input.fill("non-member@example.com"); await expect(page.getByText("No matching members.", { exact: true })).toBeVisible();
    await input.press("Escape"); await expect(page.getByRole("listbox")).toHaveCount(0);
    await input.fill(pm.email); await expect(page.getByText("No matching members.", { exact: true })).toBeVisible();
    await input.press("Tab"); await expect(input).not.toBeFocused();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: "test-results/email-assignees-mobile.png", fullPage: true });
    await expect(savedTicketStatus(page)).toBeVisible();
    await page.reload(); await expect(page.getByRole("button", { name: `Remove ${dev.email}`, exact: true })).toHaveCount(0);
  } finally { await fixture.cleanup(); }
});

test("author schedules work; assignee updates status and comments; list filters and mobile details work", { tag: "@smoke" }, async ({ page, browser }) => {
  const fixture = localFixture(); const pm = await fixture.actor("PM"); const dev = await fixture.actor("Developer");
  const org = (await pm.client.rpc("create_organisation", { organisation_name: "Delivery workspace" })).data;
  await pm.client.rpc("invite_member", { target_org: org, target_email: dev.email });
  await dev.client.rpc("respond_invitation", { invitation_id: (await dev.client.rpc("list_invitations")).data[0].id, decision: "accept" });
  const draft = (await pm.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
  await pm.client.rpc("save_draft", { target_org: org, request_id: draft.id, expected_revision: 1, content: { title: "Release search", description: "Find saved requirements" } });
  const context = await browser.newContext({ baseURL: origin }); const reader = await context.newPage();
  try {
    await login(page, pm); await page.goto(`/organisations/${org}/requests/${draft.id}`);
    await setDueDate(page, "2026-12-20");
    await selectPill(page, "Priority", "High");
    await page.getByRole("combobox", { name: "Assignees", exact: true }).fill(dev.email);
    await page.getByRole("option", { name: dev.email, exact: true }).click();
    await expect(savedTicketStatus(page)).toBeVisible();
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByRole("region", { name: "Task visibility", exact: true })).toContainText("This task is visible to members of the");
    await expect(page.getByText(`Author: ${pm.username}`, { exact: true })).toBeVisible();
    const args = { target_org: org, request_id: draft.id };
    const published = (await pm.client.rpc("read_request", args)).data;
    expect((await pm.client.rpc("update_delivery", { ...args, expected_revision: published.delivery_revision, changes: { assignee_ids: [dev.id, pm.id] } })).error).toBeNull();
    await login(reader, dev); await reader.goto(`/organisations/${org}/requests/${draft.id}`);
    await expect(reader.getByText(`Author: ${pm.username}`, { exact: true })).toBeVisible();
    await expect(reader.getByText(`Assignees: ${dev.username} → ${dev.username}, ${pm.username}`, { exact: true })).toBeVisible();
    await expect(reader.getByLabel("Due date", { exact: true })).toHaveCount(0);
    await selectPill(reader, "Delivery status", "In progress");
    await reader.getByRole("button", { name: "Update", exact: true }).click();
    await expect(reader.getByText("Delivery details saved.", { exact: true })).toBeVisible();
    await reader.getByLabel("Comment", { exact: true }).fill("<script>window.ticketInjected = true</script>");
    await reader.getByRole("button", { name: "Post comment", exact: true }).click();
    const comment = reader.locator(".activity-entry").filter({ hasText: "<script>window.ticketInjected = true</script>" });
    await expect(comment).toContainText(dev.username);
    await expect(comment).not.toContainText(dev.id);
    await expect(reader.getByText("Loading activity…", { exact: true })).toHaveCount(0);
    expect(await reader.evaluate(() => "ticketInjected" in window)).toBe(false);
    await reader.setViewportSize({ width: 390, height: 844 });
    expect(await reader.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await reader.screenshot({ path: "test-results/delivery-mobile.png", fullPage: true });
    await page.screenshot({ path: "test-results/delivery-author.png", fullPage: true });
    await reader.goto(`/organisations/${org}/requests`);
    const filter = reader.getByRole("combobox", { name: "Assignee filter", exact: true });
    await expect(reader.getByText("Loading members…", { exact: true })).toHaveCount(0);
    await filter.click();
    const assignees = reader.getByRole("listbox", { name: "Assignee filter options", exact: true });
    await expect(assignees.getByRole("option", { name: `${dev.username} (Developer)`, exact: true })).toBeVisible();
    await filter.press("a"); await filter.press("s"); await filter.press("Enter");
    await expect(filter).toHaveText("Assigned to me");
    const row = reader.getByRole("row").filter({ has: reader.getByRole("link", { name: "Release search", exact: true }) });
    await expect(row.getByRole("cell", { name: `${dev.username}, ${pm.username}`, exact: true })).toBeVisible();
    await expect(row.getByRole("cell", { name: pm.username, exact: true })).toBeVisible();
    await expect(row.getByRole("combobox", { name: "Priority for Release search" })).toHaveCount(0);
    await expect(row.getByRole("cell", { name: "High", exact: true })).toBeVisible();
    await reader.getByRole("button", { name: "Apply filters", exact: true }).click();
    await expect(reader.getByRole("link", { name: "Release search", exact: true })).toBeVisible();
    await reader.setViewportSize({ width: 1280, height: 800 });
    await reader.screenshot({ path: "test-results/requests-developer-desktop.png", fullPage: true });
    await selectPill(reader, "Sort tickets", "Status");
    await reader.getByRole("combobox", { name: "Status filter", exact: true }).click();
    await reader.getByRole("option", { name: "In progress", exact: true }).click();
    await reader.getByRole("button", { name: "Apply filters", exact: true }).click();
    await expect(row).toBeVisible();
    await selectPill(reader, "Status for Release search", "Done");
    await expect(reader.getByText("No tickets match these filters.", { exact: true })).toBeVisible();
    expect((await dev.client.rpc("read_request", args)).data.status).toBe("done");
  } finally { await context.close(); await fixture.cleanup(); }
});

test("Requests table reconciles conflicts and lost priority responses without replay", async ({ page }) => {
  const fixture = localFixture(); const pm = await fixture.actor("PM");
  const org = (await pm.client.rpc("create_organisation", { organisation_name: "Table delivery recovery" })).data;
  const draft = (await pm.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
  const args = { target_org: org, request_id: draft.id };
  try {
    await login(page, pm); await page.goto(`/organisations/${org}/requests`);
    const row = page.getByRole("row").filter({ has: page.getByRole("link", { name: "Untitled draft" }) });
    const priority = row.getByRole("combobox", { name: "Priority for Untitled draft" });
    await expect(priority).toHaveText("Medium");
    await expect(row.getByRole("cell", { name: "Private draft" })).toBeVisible();
    await expect(row.getByRole("combobox")).toHaveCount(1);
    const updated = await pm.client.rpc("update_delivery", { ...args, expected_revision: draft.delivery_revision, changes: { priority: "high" } });
    expect(updated.error).toBeNull();
    let attempts = 0;
    await page.route(`**/api/organisations/${org}/requests/${draft.id}/delivery`, async route => {
      attempts++;
      if (attempts === 2) { expect((await route.fetch()).ok()).toBe(true); await route.abort(); }
      else await route.continue();
    });
    await selectPill(page, "Priority for Untitled draft", "Low");
    await expect(page.getByRole("alert").filter({ hasText: "changed before" })).toBeVisible();
    await expect(priority).toHaveText("High");
    expect(attempts).toBe(1);
    await selectPill(page, "Priority for Untitled draft", "Low");
    await expect(page.getByRole("alert").filter({ hasText: "Could not confirm" })).toBeVisible();
    await expect(priority).toHaveText("Low");
    expect(attempts).toBe(2);
    await page.route(`**/api/organisations/${org}/requests`, route => route.abort(), { times: 1 });
    await selectPill(page, "Priority for Untitled draft", "Medium");
    await expect(page.getByRole("alert").filter({ hasText: "Could not reload requests" })).toBeVisible();
    await expect(priority).toHaveCount(0);
    await page.getByRole("button", { name: "Apply filters", exact: true }).click();
    await expect(priority).toHaveText("Medium");
    expect(attempts).toBe(3);
  } finally { await fixture.cleanup(); }
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
    await pm.client.rpc("update_delivery", { ...args, expected_revision: 2, changes: { priority: "high" } });
    await setDueDate(page, "2026-12-25");
    await page.getByRole("button", { name: "Update", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "saved request changed" })).toBeVisible();
    await expect(page.getByLabel("Due date", { exact: true })).toHaveText("25 Dec 2026");
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "Reload saved version and discard edits", exact: true }).click();
    await expect(page.getByLabel("Priority", { exact: true })).toHaveText("High");
    await expect(page.getByLabel("Due date", { exact: true })).toHaveText("20 Dec 2026");
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
    await setDueDate(page, "2026-12-20");
    release(); await expect(savedTicketStatus(page)).toBeVisible();
    await expect(page.getByRole("button", { name: "Publish", exact: true })).toBeEnabled();
    await page.reload();
    await expect(page.getByLabel("Due date", { exact: true })).toHaveText("20 Dec 2026");
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
    await selectPill(page, "Delivery status", "In review");
    await page.route(`**/api/organisations/${org}/requests/${draft.id}`, route => route.fulfill({ status: 503, json: { error: "Temporary read failure" } }));
    await page.getByRole("button", { name: "Refresh saved request", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Temporary read failure" })).toBeVisible();
    await expect(page.getByLabel("Comment", { exact: true })).toHaveValue("Unsaved comment survives refresh");
    await expect(page.getByLabel("Delivery status", { exact: true })).toHaveText("In review");
  } finally { await fixture.cleanup(); }
});

test("member search ignores an older load-more response", async ({ page }) => {
  const fixture = localFixture(); const pm = await fixture.actor("PM");
  const org = (await pm.client.rpc("create_organisation", { organisation_name: "Member paging" })).data;
  const draft = (await pm.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
  await pm.client.rpc("save_draft", { target_org: org, request_id: draft.id, expected_revision: 1, content: { title: "Member search", description: "Choose a member" } });
  const first = randomUUID(); const oldPage = randomUUID(); const found = randomUUID();
  const initialMembers = [{ user_id: first, email: "first@example.com", app_role: "Developer" }, ...Array.from({ length: 12 }, (_, i) => ({ user_id: randomUUID(), email: `member${i}@example.com`, app_role: "Developer" }))];
  let release!: () => void; const hold = new Promise<void>(resolve => { release = resolve; });
  let started!: () => void; const captured = new Promise<void>(resolve => { started = resolve; });
  try {
    await login(page, pm);
    await page.route(`**/api/organisations/${org}/ticket-members?**`, async route => {
      const query = new URL(route.request().url()).searchParams;
      if (query.has("after")) { started(); await hold; await route.fulfill({ json: { members: [{ user_id: oldPage, email: "old@example.com", app_role: "Developer" }], selected_members: [], next_cursor: null } }); }
      else await route.fulfill({ json: { members: query.get("search") ? [{ user_id: found, email: "needle@example.com", app_role: "Developer" }] : initialMembers, selected_members: [], next_cursor: query.get("search") ? null : first } });
    });
    await page.goto(`/organisations/${org}/requests/${draft.id}`); await page.getByRole("combobox", { name: "Assignees", exact: true }).click();
    await expect(page.getByRole("option", { name: "first@example.com", exact: true })).toBeVisible();
    expect(await page.getByRole("listbox").evaluate(element => element.scrollHeight > element.clientHeight)).toBe(true);
    await page.getByRole("button", { name: "Load more members", exact: true }).click(); await captured;
    await expect(page.getByText("Loading members…", { exact: true })).toBeVisible();
    await page.getByRole("combobox", { name: "Assignees", exact: true }).fill("needle");
    await expect(page.getByRole("option", { name: "needle@example.com", exact: true })).toBeVisible();
    const finished = page.waitForResponse(response => response.url().includes("ticket-members?after="));
    release(); await finished; await page.waitForTimeout(150); // Let the stale page continuation reach React.
    await expect(page.getByRole("option", { name: "old@example.com", exact: true })).toHaveCount(0);
    await expect(page.getByRole("option", { name: "needle@example.com", exact: true })).toBeVisible();
  } finally { release?.(); await fixture.cleanup(); }
});

test("email picker retries lookup failures, restores off-page selections and enforces five assignees", async ({ page }) => {
  const fixture = localFixture(); const pm = await fixture.actor("PM");
  const org = (await pm.client.rpc("create_organisation", { organisation_name: "Picker states" })).data;
  const members = [pm];
  for (let i = 0; i < 5; i++) {
    const member = await fixture.actor("Developer"); members.push(member);
    await pm.client.rpc("invite_member", { target_org: org, target_email: member.email });
    await member.client.rpc("respond_invitation", { invitation_id: (await member.client.rpc("list_invitations")).data[0].id, decision: "accept" });
  }
  const draft = (await pm.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
  await pm.client.rpc("update_delivery", { target_org: org, request_id: draft.id, expected_revision: 1, changes: { assignee_ids: [members[5].id] } });
  let failSelected = true;
  try {
    await login(page, pm);
    await page.route(`**/api/organisations/${org}/ticket-members?**`, async route => {
      const query = new URL(route.request().url()).searchParams;
      if (query.has("selected")) {
        if (failSelected) { await route.fulfill({ status: 503, json: { error: "Selected emails unavailable" } }); }
        else await route.continue();
      } else await route.fulfill({ json: { members: members.slice(0, 5).map(member => ({ user_id: member.id, email: member.email, app_role: member.id === pm.id ? "PM" : "Developer" })), selected_members: [], next_cursor: null } });
    });
    await page.goto(`/organisations/${org}/requests/${draft.id}`);
    await expect(page.getByRole("alert").filter({ hasText: "Selected emails unavailable" })).toBeVisible();
    failSelected = false;
    await page.getByRole("button", { name: "Retry assignee emails", exact: true }).click();
    await expect(page.getByRole("button", { name: `Remove ${members[5].email}`, exact: true })).toBeVisible();
    const input = page.getByRole("combobox", { name: "Assignees", exact: true }); await input.click();
    // Fail a fresh query so the retry is independent of the selected-email retry.
    await page.route(`**/api/organisations/${org}/ticket-members?search=failure`, route => route.fulfill({ status: 503, json: { error: "Search temporarily unavailable" } }));
    await input.fill("failure");
    await expect(page.getByRole("alert").filter({ hasText: "Search temporarily unavailable" })).toBeVisible();
    await page.unroute(`**/api/organisations/${org}/ticket-members?search=failure`);
    await page.getByRole("button", { name: "Retry member list", exact: true }).click();
    await expect(page.getByRole("option", { name: pm.email, exact: true })).toBeVisible();
    await page.screenshot({ path: "test-results/email-assignees-desktop.png", fullPage: true });
    for (const member of members.slice(0, 4)) {
      await expect(page.getByRole("option", { name: member.email, exact: true })).toBeVisible();
      await page.getByRole("option", { name: member.email, exact: true }).click();
    }
    await expect(page.getByText("(5/5)", { exact: true })).toBeVisible();
    await expect(input).toHaveAccessibleDescription("(5/5)");
    await expect(page.getByRole("listbox")).toHaveCount(0);
    await expect(input).toHaveAttribute("aria-expanded", "false");
    await page.getByRole("button", { name: `Remove ${pm.email}`, exact: true }).click();
    await expect(page.getByRole("option", { name: members[4].email, exact: true })).toBeVisible();
    await input.press("ArrowUp"); await input.press("Enter");
    await expect(page.getByRole("button", { name: `Remove ${members[4].email}`, exact: true })).toBeVisible();
    await expect(savedTicketStatus(page)).toBeVisible();
    await page.reload();
    await expect(page.getByRole("button", { name: `Remove ${members[5].email}`, exact: true })).toBeVisible();
    await expect(page.locator(".assignee-chip")).toHaveCount(5);
  } finally { await fixture.cleanup(); }
});

test("removing every assignee clears a selected-email lookup error", async ({ page }) => {
  const fixture = localFixture(); const pm = await fixture.actor("PM");
  const org = (await pm.client.rpc("create_organisation", { organisation_name: "Selected email recovery" })).data;
  const draft = (await pm.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
  await pm.client.rpc("update_delivery", { target_org: org, request_id: draft.id, expected_revision: 1, changes: { assignee_ids: [pm.id] } });
  try {
    await login(page, pm);
    await page.route(`**/api/organisations/${org}/ticket-members?selected=*`, route => route.fulfill({ status: 503, json: { error: "Selected lookup failed" } }));
    await page.goto(`/organisations/${org}/requests/${draft.id}`);
    await expect(page.getByRole("alert").filter({ hasText: "Selected lookup failed" })).toBeVisible();
    await page.getByRole("button", { name: "Remove Assignee unavailable", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Selected lookup failed" })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "Retry assignee emails", exact: true })).toHaveCount(0);
    await expect(savedTicketStatus(page)).toBeVisible();
  } finally { await fixture.cleanup(); }
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
    await expect(page.getByLabel("Delivery status", { exact: true })).toHaveText("To do");
    await pm.client.rpc("update_delivery", { ...args, expected_revision: 2, changes: { priority: "high", due_date: "2026-12-25" } });
    await page.getByRole("button", { name: "Refresh saved request", exact: true }).click();
    await expect(page.getByText("High", { exact: true })).toBeVisible();
    await expect(page.getByText("2026-12-25", { exact: true })).toBeVisible();
    await selectPill(page, "Delivery status", "In review");
    await pm.client.rpc("update_delivery", { ...args, expected_revision: 3, changes: { priority: "low" } });
    await page.getByRole("button", { name: "Refresh saved request", exact: true }).click();
    await expect(page.getByLabel("Delivery status", { exact: true })).toHaveText("In review");
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
    await setDueDate(page, "");
    await page.getByRole("button", { name: "Update", exact: true }).click();
    await page.getByRole("button", { name: "Check saved version", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: /The saved version is unchanged/ })).toBeVisible();
    await expect(page.getByLabel("Due date", { exact: true })).toBeEnabled();
    await setDueDate(page, "2026-12-25");
    await page.route(`**/api/organisations/${org}/requests/${draft.id}`, async route => {
      if (route.request().method() === "POST") { await route.fetch(); await route.abort("failed"); }
      else await route.continue();
    });
    await page.getByRole("button", { name: "Update", exact: true }).click();
    await page.getByRole("button", { name: "Check saved version", exact: true }).click();
    await expect(savedTicketStatus(page)).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Keep corrected scheduling");
    await expect(page.getByLabel("Due date", { exact: true })).toHaveText("25 Dec 2026");
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
    await expect(savedTicketStatus(page)).toBeVisible();
    await page.getByRole("button", { name: "Publish", exact: true }).click({ timeout: 5000 });
    await expect(page.getByRole("button", { name: "Update", exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Due date", { exact: true })).toHaveText("Unscheduled");
    await setDueDate(page, "2026-12-20");
    await page.getByRole("button", { name: "Update", exact: true }).click();
    await expect(savedTicketStatus(page)).toBeVisible();
    await setDueDate(page, "");
    await page.getByRole("button", { name: "Update", exact: true }).click();
    await expect(savedTicketStatus(page)).toBeVisible();
    await page.reload();
    await expect(page.getByLabel("Due date", { exact: true })).toHaveText("Unscheduled");
    await expect(page.getByRole("button", { name: "Update", exact: true })).toBeVisible();
  } finally { await fixture.cleanup(); }
});
