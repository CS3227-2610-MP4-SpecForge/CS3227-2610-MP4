import { test, expect, type Page } from "@playwright/test";
import { localFixture } from "../local.fixture";
const origin = process.env.SPECFORGE_BROWSER_ORIGIN ?? "http://localhost:3000";
async function login(page: Page, actor: { email: string; password: string }) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(actor.email);
  await page.getByLabel("Password", { exact: true }).fill(actor.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/workspace$/);
}
const content = { "Title": "Find saved requirements", "Description": "## Problem description\n\nPMs need to find work.\n\n## Desired behaviour\n\n- Filter requests by title.\n\n<script>window.requestInjected = true</script>\n\n![tracking](https://tracking.invalid/pixel)\n\n[unsafe](javascript:alert(1))" };
async function fill(page: Page) { for (const [label, value] of Object.entries(content)) await page.getByLabel(label, { exact: true }).fill(value); }
const saved = (page: Page) => page.getByRole("status").filter({ hasText: /^Saved$/ });

test("PM autosaves/resumes and publishes; Developer reads only saved published changes", async ({ page, browser }) => {
  const fixture = localFixture();
  const pm = await fixture.actor("PM");
  const developer = await fixture.actor("Developer");
  const org = (await pm.client.rpc("create_organisation", { organisation_name: "Requirements team" })).data;
  await pm.client.rpc("invite_member", { target_org: org, target_email: developer.email });
  await developer.client.rpc("respond_invitation", { invitation_id: (await developer.client.rpc("list_invitations")).data[0].id, decision: "accept" });
  const context = await browser.newContext({ baseURL: origin });
  const reader = await context.newPage();
  try {
    await login(page, pm);
    await page.getByRole("button", { name: /Requirements team Admin/ }).click();
    await page.getByRole("link", { name: "View requests", exact: true }).click();
    await page.getByRole("button", { name: "New draft", exact: true }).click();
    await page.getByLabel("Title", { exact: true }).focus();
    await page.keyboard.press("Tab");
    await expect(page.getByLabel("Description", { exact: true })).toBeFocused();
    await fill(page);
    await expect(saved(page)).toBeVisible();
    const editorUrl = page.url();
    await page.reload();
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue(content.Title);
    await login(reader, developer);
    await reader.goto(`/organisations/${org}/requests`);
    await expect(reader.getByText("No requests yet.")).toBeVisible();
    await expect(reader.getByRole("button", { name: "New draft", exact: true })).toHaveCount(0);
    await page.getByLabel("I acknowledge the assumptions and unresolved questions.").check();
    await page.getByRole("button", { name: "Submit request", exact: true }).click();
    await expect(page.getByText("Submitted", { exact: true })).toBeVisible();
    await reader.reload();
    await reader.getByRole("link", { name: content.Title, exact: true }).click();
    await expect(reader.getByRole("heading", { name: content.Title, exact: true })).toBeVisible();
    await expect(reader.getByText(`Author account: ${pm.id}`, { exact: true })).toBeVisible();
    await expect(reader.getByLabel("Title", { exact: true })).toHaveCount(0);
    await expect(reader.getByRole("heading", { name: "Problem description", exact: true })).toBeVisible();
    await expect(reader.locator("script").filter({ hasText: "window.requestInjected = true" })).toHaveCount(0);
    expect(await reader.evaluate(() => "requestInjected" in window)).toBe(false);
    await expect(reader.locator("img")).toHaveCount(0);
    await expect(reader.locator('a[href^="javascript:"]')).toHaveCount(0);
    await page.getByLabel("Title", { exact: true }).fill("Updated saved requirements");
    await page.waitForTimeout(1000); // Allow the draft debounce interval to elapse: published edits must remain local.
    await reader.reload();
    await expect(reader.getByRole("heading", { name: content.Title, exact: true })).toBeVisible();
    await page.getByLabel("I acknowledge the assumptions and unresolved questions.").check();
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(saved(page)).toBeVisible();
    await reader.reload();
    await expect(reader.getByRole("heading", { name: "Updated saved requirements", exact: true })).toBeVisible();
    await reader.setViewportSize({ width: 390, height: 844 });
    expect(await reader.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await reader.screenshot({ path: "test-results/request-reader-mobile.png", fullPage: true, caret: "initial" });
    await page.screenshot({ path: "test-results/request-editor-desktop.png", fullPage: true, caret: "initial" });
    expect(page.url()).toBe(editorUrl);
  } finally { await context.close(); await fixture.cleanup(); }
});

async function setupEditor(page: Page) {
  const fixture = localFixture();
  const pm = await fixture.actor("PM");
  const org = (await pm.client.rpc("create_organisation", { organisation_name: "Save recovery" })).data;
  await login(page, pm);
  await page.goto(`/organisations/${org}/requests`);
  await page.getByRole("button", { name: "New draft", exact: true }).click();
  await expect(page.getByLabel("Title", { exact: true })).toBeVisible();
  return { fixture, pm, org, id: page.url().split("/").at(-1)! };
}

test("lost creation/save responses reconcile without duplicate drafts or automatic retry", async ({ page }) => {
  const fixture = localFixture();
  const pm = await fixture.actor("PM");
  const org = (await pm.client.rpc("create_organisation", { organisation_name: "Response loss" })).data;
  try {
    await login(page, pm);
    await page.goto(`/organisations/${org}/requests`);
    let loseCreation = true;
    await page.route(`**/api/organisations/${org}/requests`, async route => {
      if (route.request().method() === "POST" && loseCreation) { loseCreation = false; await route.fetch(); await route.abort(); }
      else await route.continue();
    });
    await page.getByRole("button", { name: "New draft", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "retrying uses the same creation key" })).toBeVisible();
    await page.getByRole("button", { name: "New draft", exact: true }).click();
    await expect(page.getByLabel("Title", { exact: true })).toBeVisible();
    expect((await pm.client.rpc("list_requests", { target_org: org })).data).toHaveLength(1);
    let saveAttempts = 0;
    await page.route(`**/api/organisations/${org}/requests/*`, async route => {
      if (route.request().method() === "POST") { saveAttempts++; if (saveAttempts === 1) { await route.fetch(); await route.abort(); return; } }
      await route.continue();
    });
    await page.getByLabel("Title", { exact: true }).fill("Saved despite response loss");
    await expect(page.getByText("Save failed — local text preserved", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Saved despite response loss");
    expect(saveAttempts).toBe(1);
    await page.getByRole("button", { name: "Check saved version", exact: true }).click();
    await expect(saved(page)).toBeVisible();
    await expect(page.getByText("The saved version confirms your change succeeded.")).toBeVisible();
    expect(saveAttempts).toBe(1);
    await page.reload();
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Saved despite response loss");
  } finally { await fixture.cleanup(); }
});

test("failed saves require reconciliation; in-flight edits and stale editor text are preserved", async ({ page }) => {
  const { fixture, pm, org, id } = await setupEditor(page);
  const endpoint = `**/api/organisations/${org}/requests/${id}`;
  try {
    let fail = true;
    await page.route(endpoint, async route => {
      if (route.request().method() === "POST" && fail) { fail = false; await route.abort(); } else await route.continue();
    });
    await page.getByLabel("Title", { exact: true }).fill("Keep this failed edit");
    await expect(page.getByText("Save failed — local text preserved", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Check saved version", exact: true }).click();
    await page.getByRole("button", { name: "Retry draft save", exact: true }).click();
    await expect(saved(page)).toBeVisible();
    await page.unroute(endpoint);
    let release!: () => void;
    let intercepted!: () => void;
    const held = new Promise<void>(resolve => { release = resolve; });
    const started = new Promise<void>(resolve => { intercepted = resolve; });
    let hold = true;
    await page.route(endpoint, async route => {
      if (route.request().method() === "POST" && hold) { hold = false; intercepted(); await held; }
      await route.continue();
    });
    await page.getByLabel("Title", { exact: true }).fill("Earlier in-flight edit");
    await started;
    await page.getByLabel("Title", { exact: true }).fill("Latest edit during save");
    release();
    await expect(saved(page)).toBeVisible();
    await expect.poll(async () => (await pm.client.rpc("read_request", { target_org: org, request_id: id })).data.fields.title).toBe("Latest edit during save");
    const current = (await pm.client.rpc("read_request", { target_org: org, request_id: id })).data;
    await pm.client.rpc("save_draft", { target_org: org, request_id: id, expected_revision: current.revision, content: { ...current.fields, title: "A newer saved version" } });
    await page.getByLabel("Title", { exact: true }).fill("Local stale edit to keep");
    await expect(page.getByText("Save failed — local text preserved", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Local stale edit to keep");
    let historyWarning = false;
    page.once("dialog", dialog => { historyWarning = true; return dialog.dismiss(); });
    await page.goBack({ waitUntil: "domcontentloaded", timeout: 2000 }).catch(() => null);
    expect(historyWarning).toBe(true);
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Local stale edit to keep");
    page.once("dialog", dialog => dialog.dismiss());
    await page.getByRole("link", { name: "Back to requests", exact: true }).click();
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Local stale edit to keep");
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "Reload saved version and discard edits", exact: true }).click();
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue("A newer saved version");
    await expect(saved(page)).toBeVisible();
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "Delete draft", exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`/organisations/${org}/requests$`));
    await expect(page.getByText("No requests yet.")).toBeVisible();
  } finally { await fixture.cleanup(); }
});


test("same-document skip link keeps unsaved-work protection active", async ({ page }) => {
  const { fixture } = await setupEditor(page);
  let warnings = 0;
  const dismiss = async (dialog: import("@playwright/test").Dialog) => { warnings++; await dialog.dismiss(); };
  page.on("dialog", dismiss);
  try {
    await page.route("**/api/organisations/*/requests/*", async route => {
      if (route.request().method() === "POST") await route.abort(); else await route.continue();
    });
    await page.getByLabel("Title", { exact: true }).fill("Unsaved navigation text");
    await expect(page.getByText("Save failed — local text preserved", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Skip to content", exact: true }).focus();
    await page.getByRole("link", { name: "Skip to content", exact: true }).click();
    expect(warnings).toBe(0);
    await page.getByRole("link", { name: "Back to requests", exact: true }).click();
    expect(warnings).toBe(1);
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Unsaved navigation text");
  } finally { page.off("dialog", dismiss); await fixture.cleanup(); }
});

test("two-field AI workspace keeps clarification separate, applies fresh proposals and blocks stale updates", async ({ page }) => {
  const { fixture, pm, org, id } = await setupEditor(page);
  try {
    await expect(page.getByRole("form", { name: "Request editor" }).getByRole("textbox")).toHaveCount(2);
    await page.getByLabel("Chat message", { exact: true }).fill("Clarify this feature");
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(page.getByText("Who is this feature for?", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue("");
    await page.getByRole("button", { name: "Request task proposal", exact: true }).click();
    const apply = () => page.getByRole("button", { name: "Apply update", exact: true }).last();
    await expect(apply()).toBeEnabled();
    await expect(page.getByLabel("Description", { exact: true })).toHaveValue("");
    await apply().click();
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue("AI task proposal");
    await expect(saved(page)).toBeVisible();
    await page.getByLabel("Chat message", { exact: true }).fill("slow proposal");
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(page.getByText("AI is responding…", { exact: true })).toBeVisible();
    await page.getByLabel("Title", { exact: true }).fill("Manual edit during generation");
    await expect(page.getByText("AI is responding…", { exact: true })).toHaveCount(0);
    await expect(apply()).toBeDisabled();
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Manual edit during generation");
    await expect(saved(page)).toBeVisible();
    await page.getByRole("button", { name: "Request task proposal", exact: true }).click();
    await expect(apply()).toBeEnabled();
    const task = (await pm.client.rpc("read_request", { target_org: org, request_id: id })).data;
    await pm.client.rpc("save_draft", { target_org: org, request_id: id, expected_revision: task.revision, content: { ...task.fields, title: "Another editor saved this" } });
    await apply().click();
    await expect(apply()).toBeDisabled();
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Manual edit during generation");
    await page.reload();
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Another editor saved this");
    await expect(page.getByText("Who is this feature for?", { exact: true })).toBeVisible();
    await page.screenshot({ path: "test-results/ai-workspace-desktop.png", fullPage: true, caret: "initial" });
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByRole("tab", { name: "Task", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByLabel("Chat message", { exact: true })).not.toBeVisible();
    await page.getByRole("tab", { name: "Chat", exact: true }).click();
    await expect(page.getByLabel("Title", { exact: true })).not.toBeVisible();
    await expect(page.getByText("Who is this feature for?", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: "test-results/ai-workspace-mobile.png", fullPage: true, caret: "initial" });
    await page.getByRole("tab", { name: "Chat", exact: true }).focus();
    await page.keyboard.press("ArrowLeft");
    await expect(page.getByRole("tab", { name: "Task", exact: true })).toBeFocused();
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Another editor saved this");
  } finally { await fixture.cleanup(); }
});

test("lost chat responses reconcile once and failed turns retry without duplicate messages", async ({ page }) => {
  const { fixture, pm, org, id } = await setupEditor(page);
  try {
    const chat = `**/api/organisations/${org}/requests/${id}/chat`;
    let posts = 0;
    await page.route(chat, async route => {
      if (route.request().method() === "POST") { posts++; if (posts === 1) { await route.fetch(); await route.abort(); return; } }
      await route.continue();
    });
    await page.getByLabel("Chat message", { exact: true }).fill("Clarify response loss");
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Refresh chat to reconcile" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Send message", exact: true })).toBeDisabled();
    await expect(page.getByLabel("Chat message", { exact: true })).toHaveValue("Clarify response loss");
    await page.getByRole("button", { name: "Refresh chat", exact: true }).click();
    await expect(page.getByText("Who is this feature for?", { exact: true })).toBeVisible();
    await expect(page.getByText("Clarify response loss", { exact: true })).toHaveCount(1);
    await expect(page.getByLabel("Chat message", { exact: true })).toHaveValue("");
    expect(posts).toBe(1);
    await page.getByLabel("Chat message", { exact: true }).fill("simulate failure");
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    await page.getByRole("button", { name: "Retry AI turn", exact: true }).click();
    await expect.poll(async () => (await pm.client.rpc("read_chat", { target_org: org, request_id: id })).data.at(-1).generation).toBe(2);
    await expect(page.getByText("simulate failure", { exact: true })).toHaveCount(1);
    expect((await pm.client.rpc("read_chat", { target_org: org, request_id: id })).data).toHaveLength(2);
    expect(posts).toBe(3);
  } finally { await fixture.cleanup(); }
});

test("applying a proposal to a published task remains local until explicit Save changes", async ({ page }) => {
  const { fixture, pm, org, id } = await setupEditor(page);
  try {
    await fill(page); await expect(saved(page)).toBeVisible();
    await page.getByLabel("I acknowledge the assumptions and unresolved questions.").check();
    await page.getByRole("button", { name: "Submit request", exact: true }).click();
    await expect(page.getByText("Submitted", { exact: true })).toBeVisible();
    const before = (await pm.client.rpc("read_request", { target_org: org, request_id: id })).data;
    await page.getByRole("button", { name: "Request task proposal", exact: true }).click();
    await page.getByRole("button", { name: "Apply update", exact: true }).click();
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue("AI task proposal");
    await expect(page.getByLabel("I acknowledge the assumptions and unresolved questions.")).not.toBeChecked();
    expect((await pm.client.rpc("read_request", { target_org: org, request_id: id })).data.fields).toEqual(before.fields);
    await page.getByLabel("I acknowledge the assumptions and unresolved questions.").check();
    await page.getByRole("button", { name: "Save changes", exact: true }).click();
    await expect(saved(page)).toBeVisible();
    expect((await pm.client.rpc("read_request", { target_org: org, request_id: id })).data.fields.title).toBe("AI task proposal");
  } finally { await fixture.cleanup(); }
});


test("an unadmitted send can use the current task after reconciliation without losing either draft", async ({ page }) => {
  const { fixture, org, id } = await setupEditor(page);
  try {
    let abort = true;
    await page.route(`**/api/organisations/${org}/requests/${id}/chat`, async route => {
      if (route.request().method() === "POST" && abort) { abort = false; await route.abort(); } else await route.continue();
    });
    await page.getByLabel("Chat message", { exact: true }).fill("My unsent question");
    await page.getByRole("button", { name: "Send message", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Refresh chat to reconcile" })).toBeVisible();
    await page.getByLabel("Title", { exact: true }).fill("Changed after failed send");
    await expect(saved(page)).toBeVisible();
    await page.getByRole("button", { name: "Refresh chat", exact: true }).click();
    await page.getByRole("button", { name: "Send reconciled message with current task", exact: true }).click();
    await expect(page.getByText("Who is this feature for?", { exact: true })).toBeVisible();
    await expect(page.getByText("My unsent question", { exact: true })).toHaveCount(1);
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Changed after failed send");
    await expect(page.getByLabel("Chat message", { exact: true })).toHaveValue("");
  } finally { await fixture.cleanup(); }
});


test("AI failures show distinct durable local timeout, upstream HTTP and network diagnostics", async ({ page }) => {
  const { fixture } = await setupEditor(page);
  try {
    for (const [message, expected] of [
      ["simulate upstream 502", "SoC returned HTTP 502 after 1.2 s"],
      ["simulate local timeout", "SpecForge stopped waiting for SoC after 60.0 s"],
      ["simulate network failure", "The connection to SoC failed after 0.6 s"],
      ["simulate failure", "No detailed diagnostic was recorded for this turn"],
    ]) {
      await page.getByLabel("Chat message", { exact: true }).fill(message);
      await page.getByRole("button", { name: "Send message", exact: true }).click();
      await expect(page.getByRole("alert").filter({ hasText: expected })).toBeVisible();
    }
    await page.reload();
    await expect(page.getByRole("alert").filter({ hasText: "SoC returned HTTP 502 after 1.2 s" })).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: "local 60-second deadline" })).toBeVisible();
    await expect(page.getByRole("alert").filter({ hasText: "No upstream HTTP error response was received" })).toBeVisible();
    await page.screenshot({ path: "test-results/ai-failure-diagnostics.png", fullPage: true, caret: "initial" });
  } finally { await fixture.cleanup(); }
});
