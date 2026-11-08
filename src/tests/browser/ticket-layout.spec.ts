import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { localFixture } from "../local.fixture";

async function login(page: Page, actor: { email: string; password: string }) {
  await page.goto("/sign-in"); await page.getByLabel("Email address").fill(actor.email);
  await page.getByLabel("Password", { exact: true }).fill(actor.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click(); await expect(page).toHaveURL(/\/workspace$/);
}
const privateVisibility = "This task is private and unpublished";
const visibility = (page: Page) => page.getByRole("region", { name: "Task visibility", exact: true });

test("ticket fields follow the title while every AI tool stays in a persistent right panel", async ({ page }) => {
  const fixture = localFixture(); const pm = await fixture.actor("PM");
  const org = (await pm.client.rpc("create_organisation", { organisation_name: "Ticket layout" })).data;
  const draft = (await pm.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
  await pm.client.rpc("save_draft", { target_org: org, request_id: draft.id, expected_revision: 1, content: { title: "Remember filters", description: "Keep selected filters when returning." } });
  try {
    await page.goto("/sign-in"); await page.getByLabel("Email address").fill(pm.email); await page.getByLabel("Password", { exact: true }).fill(pm.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click(); await expect(page).toHaveURL(/\/workspace$/);
    await page.goto(`/organisations/${org}/requests/${draft.id}`);
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Remember filters");
    await expect(page.getByRole("region", { name: "Task visibility", exact: true })).toHaveText("This task is private and unpublished");
    const card = page.locator(".ticket-content");
    const about = card.getByText("About this ticket", { exact: true });
    await expect(about).toBeVisible();
    expect((await about.boundingBox())!.y).toBeGreaterThan((await page.getByRole("button", { name: "Publish", exact: true }).boundingBox())!.y);
    await expect(page.getByText(`Author account: ${pm.id}`, { exact: true })).not.toBeVisible();
    await expect(page.locator(".ticket-topbar").getByText("About this ticket", { exact: true })).toHaveCount(0);
    await expect(card.getByRole("region", { name: "Task visibility", exact: true })).toBeVisible();
    const cardBox = (await card.boundingBox())!; const bannerBox = (await visibility(page).boundingBox())!;
    expect(Math.abs(bannerBox.y - cardBox.y - 1)).toBeLessThanOrEqual(2);
    expect(Math.abs(bannerBox.x - cardBox.x - 1)).toBeLessThanOrEqual(2);
    expect(Math.abs(bannerBox.width - cardBox.width + 2)).toBeLessThanOrEqual(2);
    await expect(page.getByRole("link", { name: "Back to requests", exact: true }).locator("svg")).toHaveAttribute("aria-hidden", "true");
    await expect(page.getByLabel("Delivery status", { exact: true })).toHaveValue("to_do");
    await expect(page.getByLabel("Delivery status", { exact: true })).toBeDisabled();
    await expect(page.getByRole("heading", { name: "Remember filters", exact: true })).toHaveCount(0);
    await expect(page.getByText(/^SF-\d+$/)).toHaveCount(0);
    const panel = page.getByRole("complementary", { name: "AI discussion", exact: true });
    await expect(panel).toBeVisible();
    await expect(panel.getByRole("button", { name: "Improve clarity", exact: true })).toBeVisible();
    const title = (await page.getByLabel("Title", { exact: true }).boundingBox())!;
    const due = (await page.getByLabel("Due date", { exact: true }).boundingBox())!;
    const description = (await page.getByLabel("Description", { exact: true }).boundingBox())!;
    const sidebar = (await panel.boundingBox())!;
    expect(due.y).toBeGreaterThan(title.y); expect(due.y).toBeLessThan(description.y); expect(due.x).toBeLessThan(sidebar.x);
    await panel.getByLabel("AI instruction or question", { exact: true }).fill("Keep my unsent thought");
    await page.getByRole("button", { name: "Hide AI assistant", exact: true }).click();
    await expect(panel).not.toBeVisible();
    await expect(page.getByLabel("Title", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Show AI assistant", exact: true }).click();
    await expect(panel.getByLabel("AI instruction or question", { exact: true })).toHaveValue("Keep my unsent thought");
    await panel.getByRole("button", { name: "Improve clarity", exact: true }).click();
    await expect(panel.getByRole("region", { name: "Suggested ticket changes", exact: true })).toBeVisible();
    await page.screenshot({ path: "test-results/ticket-layout-author.png", fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: "test-results/ticket-layout-mobile.png", fullPage: true });
    await page.getByRole("link", { name: "Back to requests", exact: true }).click();
    await expect(page.getByText(/^SF-\d+$/)).toHaveCount(0);
    await expect(page.getByPlaceholder("Title or SF-number", { exact: true })).toHaveCount(0);
  } finally { await fixture.cleanup(); }
});

test("a new ticket is editable with AI collapsed and a Developer reads the same field order", async ({ page, browser }) => {
  const fixture = localFixture(); const pm = await fixture.actor("PM"); const developer = await fixture.actor("Developer");
  const organisationName = "Product Engineering and Cross Organisation Delivery Coordination Group";
  const publishedVisibility = `This task is visible to members of the ${organisationName} organisation`;
  const org = (await pm.client.rpc("create_organisation", { organisation_name: organisationName })).data;
  await pm.client.rpc("invite_member", { target_org: org, target_email: developer.email });
  await developer.client.rpc("respond_invitation", { invitation_id: (await developer.client.rpc("list_invitations")).data[0].id, decision: "accept" });
  const context = await browser.newContext({ baseURL: process.env.SPECFORGE_BROWSER_ORIGIN ?? "http://localhost:3000" }); const reader = await context.newPage();
  try {
    await page.goto("/sign-in"); await page.getByLabel("Email address").fill(pm.email); await page.getByLabel("Password", { exact: true }).fill(pm.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click(); await expect(page).toHaveURL(/\/workspace$/);
    await page.goto(`/organisations/${org}/requests`); await page.getByRole("button", { name: "New draft", exact: true }).click();
    await expect(page.getByLabel("Title", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Description", { exact: true })).toBeVisible();
    await expect(page.getByRole("complementary", { name: "AI discussion", exact: true }).getByLabel("What needs to change?", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Hide AI assistant", exact: true }).click();
    await page.getByLabel("Title", { exact: true }).fill("Write the ticket directly");
    await page.getByLabel("Description", { exact: true }).fill("The main editor stays available without AI.");
    await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
    await page.getByLabel("Due date", { exact: true }).fill("2026-12-20");
    await expect(page.getByRole("status").filter({ hasText: /^Saved$/ })).toBeVisible();
    let release!: () => void; const hold = new Promise<void>(resolve => { release = resolve; });
    let started!: () => void; const captured = new Promise<void>(resolve => { started = resolve; });
    await page.route("**/api/organisations/*/requests/*", async route => {
      if (route.request().method() === "POST" && route.request().postDataJSON().action === "submit") {
        const response = await route.fetch(); started(); await hold; await route.fulfill({ response });
      } else await route.continue();
    });
    await page.getByRole("button", { name: "Publish", exact: true }).click(); await captured;
    await expect(visibility(page)).toHaveText(privateVisibility);
    release(); await expect(visibility(page)).toHaveText(publishedVisibility);
    await expect(page.getByLabel("Delivery status", { exact: true })).toBeEnabled();
    await expect(visibility(page).locator("svg")).toHaveAttribute("aria-hidden", "true");
    await page.getByLabel("Title", { exact: true }).fill("Local unpublished edits");
    await expect(visibility(page)).toHaveText(publishedVisibility);
    await page.getByLabel("Title", { exact: true }).fill("Write the ticket directly");
    await page.screenshot({ path: "test-results/ticket-visibility-author.png", fullPage: true });
    expect((await page.getByLabel("Comment", { exact: true }).boundingBox())!.height).toBeLessThan(240);
    const path = new URL(page.url()).pathname;
    await reader.goto("/sign-in"); await reader.getByLabel("Email address").fill(developer.email); await reader.getByLabel("Password", { exact: true }).fill(developer.password);
    await reader.getByRole("button", { name: "Sign in", exact: true }).click(); await expect(reader).toHaveURL(/\/workspace$/);
    await reader.goto(path);
    await expect(visibility(reader)).toHaveText(publishedVisibility);
    const aboutReader = reader.getByText("About this ticket", { exact: true });
    expect((await aboutReader.boundingBox())!.y).toBeGreaterThan((await reader.getByRole("button", { name: "Refresh saved request", exact: true }).boundingBox())!.y);
    expect((await aboutReader.boundingBox())!.y).toBeLessThan((await reader.getByRole("heading", { name: "Team discussion & activity", exact: true }).boundingBox())!.y);
    await aboutReader.focus(); await reader.keyboard.press("Enter");
    await expect(reader.getByText(`Author account: ${pm.id}`, { exact: true })).toBeVisible();
    await reader.keyboard.press("Enter");
    await expect(reader.locator(".ticket-content").getByRole("region", { name: "Task visibility", exact: true })).toBeVisible();
    expect((await visibility(reader).boundingBox())!.y).toBeGreaterThan((await reader.getByRole("link", { name: "Back to requests", exact: true }).boundingBox())!.y);
    const title = reader.getByRole("heading", { name: "Write the ticket directly", exact: true });
    await expect(title).toHaveCount(1); await expect(reader.getByRole("complementary", { name: "AI discussion", exact: true })).toHaveCount(0);
    await expect(reader.getByText(/^SF-\d+$/)).toHaveCount(0);
    await expect(reader.locator(".badge").filter({ hasText: /Submitted|Private draft/ })).toHaveCount(0);
    expect((await title.boundingBox())!.y).toBeLessThan((await reader.getByRole("region", { name: "Ticket delivery details", exact: true }).boundingBox())!.y);
    await reader.setViewportSize({ width: 390, height: 844 });
    expect(await reader.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await reader.screenshot({ path: "test-results/ticket-layout-reader-mobile.png", fullPage: true });
  } finally { await context.close(); await fixture.cleanup(); }
});

test("visibility stays private until a lost publication response is reconciled", async ({ page }) => {
  const fixture = localFixture(); const pm = await fixture.actor("PM");
  const org = (await pm.client.rpc("create_organisation", { organisation_name: "Visibility recovery" })).data;
  const draft = (await pm.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
  await pm.client.rpc("save_draft", { target_org: org, request_id: draft.id, expected_revision: 1, content: { title: "Review visibility", description: "Only publish on confirmation." } });
  try {
    await login(page, pm); await page.goto(`/organisations/${org}/requests/${draft.id}`);
    await expect(visibility(page)).toHaveText(privateVisibility);
    await page.route(`**/api/organisations/${org}/requests/${draft.id}`, async route => {
      if (route.request().method() === "POST" && route.request().postDataJSON().action === "submit") {
        await route.fetch(); await route.abort("failed");
      } else await route.continue();
    });
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByRole("button", { name: "Check saved version", exact: true })).toBeVisible();
    await expect(visibility(page)).toHaveText(privateVisibility);
    await page.getByRole("button", { name: "Check saved version", exact: true }).click();
    await expect(visibility(page)).toHaveText("This task is visible to members of the Visibility recovery organisation");
    await expect(page.getByLabel("Delivery status", { exact: true })).toBeEnabled();
  } finally { await fixture.cleanup(); }
});

test("visibility is not guessed while organisation loading fails and name is rendered as text", async ({ page }) => {
  const fixture = localFixture(); const pm = await fixture.actor("PM");
  const name = "Team <img src=x onerror=alert(1)>";
  const org = (await pm.client.rpc("create_organisation", { organisation_name: name })).data;
  const draft = (await pm.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
  await pm.client.rpc("save_ticket", { target_org: org, request_id: draft.id, expected_revision: 1, expected_delivery_revision: 1,
    content: { title: "Safe visibility name", description: "Show authorised organisation text." }, delivery_changes: {}, action: "submit", acknowledged: true });
  let release!: () => void; const hold = new Promise<void>(resolve => { release = resolve; });
  let started!: () => void; const captured = new Promise<void>(resolve => { started = resolve; });
  let fail = true;
  try {
    await login(page, pm);
    await page.route(`**/api/organisations/${org}`, async route => {
      if (fail) { started(); await hold; await route.fulfill({ status: 503, json: { error: "Organisation temporarily unavailable" } }); }
      else await route.continue();
    });
    await page.goto(`/organisations/${org}/requests/${draft.id}`); await captured;
    await expect(page.getByText("Loading request…", { exact: true })).toBeVisible();
    await expect(visibility(page)).toHaveCount(0);
    release(); await expect(page.getByRole("alert").filter({ hasText: "Organisation temporarily unavailable" })).toBeVisible();
    await expect(visibility(page)).toHaveCount(0);
    fail = false;
    await page.getByRole("button", { name: "Retry loading request", exact: true }).click();
    await expect(visibility(page)).toHaveText(`This task is visible to members of the ${name} organisation`);
    await expect(visibility(page).locator("img")).toHaveCount(0);
  } finally { release?.(); await fixture.cleanup(); }
});
