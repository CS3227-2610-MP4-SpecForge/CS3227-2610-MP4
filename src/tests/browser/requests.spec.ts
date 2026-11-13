import {
  expectAccessible,
  recordTicketWrites,
  savedTicketStatus as saved,
  setDueDate,
  answerConfirmation,
} from "./ui.fixture";
import { test, expect, type Page } from "@playwright/test";
import { localFixture, testAiLimits } from "../local.fixture";
const origin = process.env.SPECFORGE_BROWSER_ORIGIN ?? "http://localhost:3000";
async function login(page: Page, actor: { email: string; password: string }) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(actor.email);
  await page.getByLabel("Password", { exact: true }).fill(actor.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/workspace$/);
}
async function openAi(page: Page) {
  const show = page.getByRole("button", { name: "Show AI assistant", exact: true });
  if (await show.isVisible()) await show.click();
}
async function askAi(page: Page, message: string) {
  await page.getByLabel("Ask AI to change or explain this ticket", { exact: true }).fill(message);
  await page.getByRole("button", { name: "Ask AI", exact: true }).click();
}
function assistantPanel(page: Page) {
  return page.getByRole("complementary", { name: "AI assistant", exact: true });
}
function lastTurn(page: Page) {
  return assistantPanel(page).getByRole("list", { name: "Conversation", exact: true }).getByRole("listitem").last();
}
async function openReview(page: Page) {
  await lastTurn(page).getByRole("button", { name: "Review changes", exact: true }).click({ timeout: 10000 });
  const dialog = page.getByRole("dialog", { name: "Review AI changes", exact: true });
  await expect(dialog).toBeVisible();
  return dialog;
}
async function acceptAll(page: Page) {
  const dialog = await openReview(page);
  await dialog.getByRole("button", { name: "Accept all", exact: true }).click();
  await dialog.getByRole("button", { name: "Done", exact: true }).click();
  await expect(dialog).toHaveCount(0);
}
const content = {
  Title: "Find saved requirements",
  Description:
    "## Problem description\n\nPMs need to find work.\n\n## Desired behaviour\n\n- Filter requests by title.\n\n<script>window.requestInjected = true</script>\n\n![tracking](https://tracking.invalid/pixel)\n\n[unsafe](javascript:alert(1))",
};
async function fill(page: Page) {
  for (const [label, value] of Object.entries(content)) await page.getByLabel(label, { exact: true }).fill(value);
}

test(
  "PM autosaves/resumes and publishes; Developer reads only saved published changes",
  { tag: "@smoke" },
  async ({ page, browser }) => {
    const fixture = localFixture();
    const pm = await fixture.actor("PM");
    const developer = await fixture.actor("Developer");
    const org = (await pm.client.rpc("create_organisation", { organisation_name: "Requirements team" })).data;
    await pm.client.rpc("invite_member", { target_org: org, target_email: developer.email });
    await developer.client.rpc("respond_invitation", {
      invitation_id: (await developer.client.rpc("list_invitations")).data[0].id,
      decision: "accept",
    });
    const context = await browser.newContext({ baseURL: origin });
    const reader = await context.newPage();
    await page.clock.install();
    try {
      await login(page, pm);
      await page.getByRole("link", { name: /Requirements team Admin/ }).click();
      await page
        .getByRole("navigation", { name: "Organisation sections" })
        .getByRole("link", { name: "Requests", exact: true })
        .click();
      await page.getByRole("button", { name: "New task", exact: true }).click();
      await page.getByLabel("Title", { exact: true }).focus();
      await page.keyboard.press("Tab");
      await expect(page.getByLabel("Priority", { exact: true })).toBeFocused();
      await fill(page);
      await expect(saved(page)).toBeVisible();
      const editorUrl = page.url();
      await page.reload();
      await expect(page.getByLabel("Title", { exact: true })).toHaveValue(content.Title);
      await login(reader, developer);
      await reader.goto(`/organisations/${org}/requests`);
      await expect(reader.getByText("No published tickets yet.", { exact: false })).toBeVisible();
      await expect(reader.getByRole("button", { name: "New task", exact: true })).toHaveCount(0);
      await setDueDate(page, "2026-12-20");
      await expect(saved(page)).toBeVisible();
      await page.getByRole("button", { name: "Publish", exact: true }).click();
      await expect(page.getByRole("region", { name: "Task visibility", exact: true })).toContainText(
        "This task is visible to members of the",
      );
      await reader.reload();
      const requestRow = reader
        .getByRole("row")
        .filter({ has: reader.getByRole("link", { name: content.Title, exact: true }) });
      await expect(requestRow).toBeVisible();
      await expectAccessible(reader);
      await expect(requestRow.getByRole("combobox")).toHaveCount(0);
      await reader.getByRole("link", { name: content.Title, exact: true }).click();
      await expect(reader.getByRole("heading", { name: content.Title, exact: true })).toBeVisible();
      const about = reader.getByRole("region", { name: "About this ticket", exact: true });
      await expect(about.getByText(`Author: ${pm.username}`, { exact: true })).toBeVisible();
      await expect(reader.getByLabel("Title", { exact: true })).toHaveCount(0);
      await expect(reader.getByRole("heading", { name: "Problem description", exact: true })).toBeVisible();
      await expect(reader.locator("script").filter({ hasText: "window.requestInjected = true" })).toHaveCount(0);
      expect(await reader.evaluate(() => "requestInjected" in window)).toBe(false);
      await expect(reader.locator("img")).toHaveCount(0);
      await expect(reader.locator('a[href^="javascript:"]')).toHaveCount(0);
      const writes = recordTicketWrites(page, editorUrl.split("/").at(-1)!);
      await page.getByLabel("Title", { exact: true }).fill("Updated saved requirements");
      await page.clock.runFor(1000); // Past the draft debounce interval: published edits must remain local.
      expect(writes).toEqual([]);
      await reader.reload();
      await expect(reader.getByRole("heading", { name: content.Title, exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Update", exact: true }).click();
      await expect(saved(page)).toBeVisible();
      await reader.reload();
      await expect(reader.getByRole("heading", { name: "Updated saved requirements", exact: true })).toBeVisible();
      await reader.setViewportSize({ width: 390, height: 844 });
      expect(await reader.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await reader.screenshot({ path: "test-results/request-reader-mobile.png", fullPage: true, caret: "initial" });
      await page.screenshot({ path: "test-results/request-editor-desktop.png", fullPage: true, caret: "initial" });
      expect(page.url()).toBe(editorUrl);
    } finally {
      await context.close();
      await fixture.cleanup();
    }
  },
);

async function setupEditor(page: Page) {
  const fixture = localFixture();
  const pm = await fixture.actor("PM");
  const org = (await pm.client.rpc("create_organisation", { organisation_name: "Save recovery" })).data;
  await login(page, pm);
  await page.goto(`/organisations/${org}/requests`);
  await page.getByRole("button", { name: "New task", exact: true }).click();
  await openAi(page);
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
      if (route.request().method() === "POST" && loseCreation) {
        loseCreation = false;
        await route.fetch();
        await route.abort();
      } else await route.continue();
    });
    await page.getByRole("button", { name: "New task", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "retrying uses the same creation key" })).toBeVisible();
    await page.getByRole("button", { name: "New task", exact: true }).click();
    await expect(page.getByLabel("Title", { exact: true })).toBeVisible();
    expect((await pm.client.rpc("list_requests", { target_org: org })).data).toHaveLength(1);
    let saveAttempts = 0;
    await page.route(`**/api/organisations/${org}/requests/*`, async route => {
      if (route.request().method() === "POST") {
        saveAttempts++;
        if (saveAttempts === 1) {
          await route.fetch();
          await route.abort();
          return;
        }
      }
      await route.continue();
    });
    await page.getByLabel("Title", { exact: true }).fill("Saved despite response loss");
    await expect(page.getByText("Save failed — local edits preserved", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Saved despite response loss");
    expect(saveAttempts).toBe(1);
    await page.getByRole("button", { name: "Check saved version", exact: true }).click();
    await expect(saved(page)).toBeVisible();
    await expect(page.getByText("The saved version confirms your change succeeded.")).toBeVisible();
    expect(saveAttempts).toBe(1);
    await page.reload();
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Saved despite response loss");
  } finally {
    await fixture.cleanup();
  }
});

test("failed saves require reconciliation; in-flight edits and stale editor text are preserved", async ({ page }) => {
  const { fixture, pm, org, id } = await setupEditor(page);
  const endpoint = `**/api/organisations/${org}/requests/${id}`;
  try {
    let fail = true;
    await page.route(endpoint, async route => {
      if (route.request().method() === "POST" && fail) {
        fail = false;
        await route.abort();
      } else await route.continue();
    });
    await page.getByLabel("Title", { exact: true }).fill("Keep this failed edit");
    await expect(page.getByText("Save failed — local edits preserved", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Check saved version", exact: true }).click();
    await page.getByRole("button", { name: "Retry draft save", exact: true }).click();
    await expect(saved(page)).toBeVisible();
    await page.unroute(endpoint);
    let release!: () => void;
    let intercepted!: () => void;
    const held = new Promise<void>(resolve => {
      release = resolve;
    });
    const started = new Promise<void>(resolve => {
      intercepted = resolve;
    });
    let hold = true;
    await page.route(endpoint, async route => {
      if (route.request().method() === "POST" && hold) {
        hold = false;
        intercepted();
        await held;
      }
      await route.continue();
    });
    await page.getByLabel("Title", { exact: true }).fill("Earlier in-flight edit");
    await started;
    await page.getByLabel("Title", { exact: true }).fill("Latest edit during save");
    release();
    await expect(saved(page)).toBeVisible();
    await expect
      .poll(async () => (await pm.client.rpc("read_request", { target_org: org, request_id: id })).data.fields.title)
      .toBe("Latest edit during save");
    const current = (await pm.client.rpc("read_request", { target_org: org, request_id: id })).data;
    await pm.client.rpc("save_draft", {
      target_org: org,
      request_id: id,
      expected_revision: current.revision,
      content: { ...current.fields, title: "A newer saved version" },
    });
    await page.getByLabel("Title", { exact: true }).fill("Local stale edit to keep");
    await expect(page.getByText("Save failed — local edits preserved", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Local stale edit to keep");
    let historyWarning = false;
    page.once("dialog", dialog => {
      historyWarning = true;
      return dialog.dismiss();
    });
    await page.goBack({ waitUntil: "domcontentloaded", timeout: 2000 }).catch(() => null);
    expect(historyWarning).toBe(true);
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Local stale edit to keep");
    await page.getByRole("link", { name: "Back to requests", exact: true }).click();
    await answerConfirmation(page, "Leave with unsaved work?", "Stay");
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Local stale edit to keep");
    await page.getByRole("button", { name: "Reload saved version and discard edits", exact: true }).click();
    await answerConfirmation(page, "Discard local edits?", "Discard and reload");
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue("A newer saved version");
    await expect(saved(page)).toBeVisible();
    await page.getByRole("button", { name: "Delete draft", exact: true }).click();
    await answerConfirmation(page, "Delete draft?", "Delete draft");
    await expect(page).toHaveURL(new RegExp(`/organisations/${org}/requests$`));
    await expect(page.getByText("No tickets yet.", { exact: false })).toBeVisible();
  } finally {
    await fixture.cleanup();
  }
});

test("same-document skip link keeps unsaved-work protection active", async ({ page }) => {
  const { fixture } = await setupEditor(page);
  const warning = page.getByRole("dialog", { name: "Leave with unsaved work?", exact: true });
  try {
    await page.route("**/api/organisations/*/requests/*", async route => {
      if (route.request().method() === "POST") await route.abort();
      else await route.continue();
    });
    await page.getByLabel("Title", { exact: true }).fill("Unsaved navigation text");
    await expect(page.getByText("Save failed — local edits preserved", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Skip to content", exact: true }).focus();
    await page.getByRole("link", { name: "Skip to content", exact: true }).click();
    await expect(warning).toHaveCount(0);
    await page.getByRole("link", { name: "Back to requests", exact: true }).click();
    await answerConfirmation(page, "Leave with unsaved work?", "Stay");
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Unsaved navigation text");
  } finally {
    await fixture.cleanup();
  }
});

test(
  "the AI transcript keeps every turn and reviews proposals change by change",
  { tag: "@smoke" },
  async ({ page }) => {
    const { fixture, pm, org, id } = await setupEditor(page);
    try {
      const panel = assistantPanel(page);
      await expect(page.getByLabel("Title", { exact: true })).toBeVisible();
      await page.getByLabel("Description", { exact: true }).fill("Rough notes");
      await expect(saved(page)).toBeVisible();
      await askAi(page, "Clarify this feature");
      await expect(page.getByText("Who is this feature for?", { exact: true })).toBeVisible();
      await expect(page.getByLabel("Title", { exact: true })).toHaveValue("");
      await askAi(page, "Please suggest a task proposal.");
      await expect(lastTurn(page).getByText("2 changes: title and 1 in Description", { exact: true })).toBeVisible();
      await expect(lastTurn(page).getByText("Not reviewed", { exact: true })).toBeVisible();
      await expect(page.getByLabel("Description", { exact: true })).toHaveValue("Rough notes");
      const dialog = await openReview(page);
      await expect(dialog.getByRole("region", { name: "Change 1 of 2: Title", exact: true })).toBeVisible();
      await expectAccessible(page, ".review-modal");
      await page.screenshot({ path: "test-results/ai-review-modal-desktop.png", caret: "initial" });
      await dialog.getByRole("button", { name: "Accept all", exact: true }).click();
      await expect(dialog.getByText("2 applied, 0 rejected", { exact: true })).toBeVisible();
      await dialog.getByRole("button", { name: "Done", exact: true }).click();
      await expect(lastTurn(page).getByRole("button", { name: "Review changes", exact: true })).toBeFocused();
      await expect(page.getByLabel("Title", { exact: true })).toHaveValue("AI task proposal");
      await expect(lastTurn(page).getByText("All applied", { exact: true })).toBeVisible();
      await expect(saved(page)).toBeVisible();
      await askAi(page, "slow proposal");
      await expect(page.getByText("AI is responding…", { exact: true })).toBeVisible();
      await expect(page.getByLabel("Title", { exact: true })).not.toBeEditable();
      await expect(page.getByLabel("Description", { exact: true })).not.toBeEditable();
      await expect(page.getByText("AI is responding…", { exact: true })).toHaveCount(0);
      await page.getByLabel("Title", { exact: true }).fill("Manual edit after generation");
      await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Manual edit after generation");
      await expect(saved(page)).toBeVisible();
      await askAi(page, "Please suggest a task proposal.");
      await expect(lastTurn(page).getByText("1 change: title", { exact: true })).toBeVisible();
      const task = (await pm.client.rpc("read_request", { target_org: org, request_id: id })).data;
      await pm.client.rpc("save_draft", {
        target_org: org,
        request_id: id,
        expected_revision: task.revision,
        content: { ...task.fields, title: "Another editor saved this" },
      });
      const review = await openReview(page);
      await review.getByRole("button", { name: "Accept", exact: true }).click();
      await expect(page.getByLabel("Title", { exact: true })).toHaveValue("AI task proposal");
      // Accepting is an ordinary edit, so the autosave meets the conflict.
      await expect(
        review
          .getByRole("alert")
          .filter({ hasText: "Resolve the save problem on the ticket before accepting AI changes." }),
      ).toBeVisible();
      await expect(review.getByRole("button", { name: "Undo", exact: true })).toBeDisabled();
      await page.keyboard.press("Escape");
      await expect(review).toHaveCount(0);
      await page.reload();
      await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Another editor saved this");
      await openAi(page);
      const conversation = panel.getByRole("list", { name: "Conversation", exact: true });
      await expect(
        conversation.getByText("Here is a proposed task. Review it before applying.", { exact: true }),
      ).toHaveCount(3);
      await expect(conversation.getByText("Clarify this feature", { exact: true })).toBeVisible();
      await expect(panel.getByText(/Earlier requests/)).toHaveCount(0);
      await page.screenshot({ path: "test-results/ai-workspace-desktop.png", fullPage: true, caret: "initial" });
      await page.setViewportSize({ width: 390, height: 844 });
      await expect(page.getByLabel("Title", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Hide AI assistant", exact: true }).click();
      await expect(page.getByLabel("Ask AI to change or explain this ticket", { exact: true })).not.toBeVisible();
      await page.getByRole("button", { name: "Show AI assistant", exact: true }).focus();
      await page.keyboard.press("Enter");
      await expect(
        lastTurn(page).getByText("Here is a proposed task. Review it before applying.", { exact: true }),
      ).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: "test-results/ai-workspace-mobile.png", fullPage: true, caret: "initial" });
      await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Another editor saved this");
    } finally {
      await fixture.cleanup();
    }
  },
);

test("lost chat responses reconcile once and failed turns retry without duplicate messages", async ({ page }) => {
  const { fixture, pm, org, id } = await setupEditor(page);
  try {
    await page.getByLabel("Description", { exact: true }).fill("Rough notes");
    await expect(saved(page)).toBeVisible();
    const chat = `**/api/organisations/${org}/requests/${id}/chat`;
    let posts = 0;
    let failedRead = false;
    await page.route(chat, async route => {
      if (route.request().method() === "POST") {
        posts++;
        if (posts === 1) {
          await route.fetch();
          await route.abort();
          return;
        }
      } else if (posts === 1 && !failedRead) {
        failedRead = true;
        await route.abort();
        return;
      }
      await route.continue();
    });
    await page.getByLabel("Ask AI to change or explain this ticket", { exact: true }).fill("Clarify response loss");
    await page.getByRole("button", { name: "Ask AI", exact: true }).click();
    await expect(
      page
        .getByRole("complementary", { name: "AI assistant", exact: true })
        .getByRole("alert")
        .filter({ hasText: "Reopen the AI assistant" }),
    ).toBeVisible();
    expect(failedRead).toBe(true);
    await expect(page.getByRole("button", { name: "Ask AI", exact: true })).toBeDisabled();
    await expect(page.getByLabel("Ask AI to change or explain this ticket", { exact: true })).toHaveValue(
      "Clarify response loss",
    );
    await page.getByRole("button", { name: "Hide AI assistant", exact: true }).click();
    await page.getByRole("button", { name: "Show AI assistant", exact: true }).click();
    await expect(page.getByText("Who is this feature for?", { exact: true })).toBeVisible();
    await expect(page.getByText("Clarify response loss", { exact: true })).toHaveCount(1);
    await expect(page.getByLabel("Ask AI to change or explain this ticket", { exact: true })).toHaveValue("");
    expect(posts).toBe(1);
    await page.getByLabel("Ask AI to change or explain this ticket", { exact: true }).fill("simulate failure");
    await page.getByRole("button", { name: "Ask AI", exact: true }).click();
    await page.getByRole("button", { name: "Try again", exact: true }).click();
    await expect
      .poll(async () => (await pm.client.rpc("read_chat", { target_org: org, request_id: id })).data.at(-1).generation)
      .toBe(2);
    await expect(page.getByText("simulate failure", { exact: true })).toHaveCount(1);
    expect((await pm.client.rpc("read_chat", { target_org: org, request_id: id })).data).toHaveLength(2);
    expect(posts).toBe(3);
  } finally {
    await fixture.cleanup();
  }
});

test("applying a proposal to a published task remains local until explicit Update", async ({ page }) => {
  const { fixture, pm, org, id } = await setupEditor(page);
  try {
    await fill(page);
    await expect(saved(page)).toBeVisible();
    await setDueDate(page, "2026-12-20");
    await expect(saved(page)).toBeVisible();
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByRole("region", { name: "Task visibility", exact: true })).toContainText(
      "This task is visible to members of the",
    );
    const before = (await pm.client.rpc("read_request", { target_org: org, request_id: id })).data;
    await page
      .getByLabel("Ask AI to change or explain this ticket", { exact: true })
      .fill("Please suggest a task proposal.");
    await page.getByRole("button", { name: "Ask AI", exact: true }).click();
    await acceptAll(page);
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue("AI task proposal");
    expect((await pm.client.rpc("read_request", { target_org: org, request_id: id })).data.fields).toEqual(
      before.fields,
    );
    await page.getByRole("button", { name: "Update", exact: true }).click();
    await expect(saved(page)).toBeVisible();
    expect((await pm.client.rpc("read_request", { target_org: org, request_id: id })).data.fields.title).toBe(
      "AI task proposal",
    );
  } finally {
    await fixture.cleanup();
  }
});

test("an unadmitted send can use the current task after reconciliation without losing either draft", async ({
  page,
}) => {
  const { fixture, pm, org, id } = await setupEditor(page);
  try {
    await page.getByLabel("Description", { exact: true }).fill("Rough notes");
    await expect(saved(page)).toBeVisible();
    const target = { target_org: org, request_id: id, actor_id: pm.id };
    let otherTurn: { id: string; generation: number } | undefined;
    let reads = 0;
    await page.route(`**/api/organisations/${org}/requests/${id}/chat`, async route => {
      if (route.request().method() === "POST" && !otherTurn) {
        const input = route.request().postDataJSON();
        const admitted = await fixture.admin.rpc("begin_chat_turn", {
          ...target,
          turn_key: crypto.randomUUID(),
          base_revision: input.revision,
          input_fields: input.fields,
          user_message: "A turn from another session",
          retry_failed: false,
          ai_limits: testAiLimits,
        });
        expect(admitted.error).toBeNull();
        otherTurn = admitted.data.turn;
        await route.abort();
      } else if (route.request().method() === "GET" && otherTurn && ++reads === 2) await route.abort();
      else await route.continue();
    });
    await page.getByLabel("Ask AI to change or explain this ticket", { exact: true }).fill("My unsent question");
    await page.getByRole("button", { name: "Ask AI", exact: true }).click();
    await expect(
      page
        .getByRole("complementary", { name: "AI assistant", exact: true })
        .getByRole("alert")
        .filter({ hasText: "Reopen the AI assistant" }),
    ).toBeVisible();
    const completed = await fixture.admin.rpc("finish_chat_turn", {
      ...target,
      turn_id: otherTurn!.id,
      worker_generation: otherTurn!.generation,
      human_reply: "The other turn finished.",
      task_proposal: null,
      failure_code: null,
      failure_diagnostic: null,
    });
    expect(completed.error).toBeNull();
    await page.getByLabel("Title", { exact: true }).fill("Changed after failed send");
    await expect(saved(page)).toBeVisible();
    await page.getByRole("button", { name: "Hide AI assistant", exact: true }).click();
    await page.getByRole("button", { name: "Show AI assistant", exact: true }).click();
    await expect(page.getByText("The other turn finished.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Send again", exact: true }).click();
    await expect(page.getByText("Who is this feature for?", { exact: true })).toBeVisible();
    await expect(page.getByText("My unsent question", { exact: true })).toHaveCount(1);
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Changed after failed send");
    await expect(page.getByLabel("Ask AI to change or explain this ticket", { exact: true })).toHaveValue("");
  } finally {
    await fixture.cleanup();
  }
});

test("AI failures read as one plain sentence with diagnostics behind Details", async ({ page }) => {
  const { fixture } = await setupEditor(page);
  try {
    const panel = assistantPanel(page);
    const latest = lastTurn(page);
    for (const [message, expected] of [
      ["simulate upstream 502", "SoC returned HTTP 502 after 1.2 s"],
      ["simulate local timeout", "AI response timed out after 90 seconds."],
      ["simulate historical timeout", "AI response timed out after 60 seconds."],
      ["simulate network failure", "The connection to SoC failed after 0.6 s"],
      ["simulate failure", "No detailed diagnostic was recorded for this turn"],
      ["simulate malformed JSON", "SoC completed its response, but it was not valid JSON"],
      ["simulate unmatched edit", "AI tried to change text that is not in your ticket exactly once"],
      ["simulate truncated response", "SoC reached the 2,000-token output limit before finishing"],
    ]) {
      await askAi(page, message);
      await expect(latest.getByRole("alert")).toHaveText(
        "AI couldn't complete this request. Your ticket is unchanged, and this did not use one of your hourly AI requests.",
      );
      await expect(latest.getByText(expected)).not.toBeVisible();
      await latest.getByText("Details", { exact: true }).click();
      await expect(latest.getByText(expected)).toBeVisible();
      await expect(latest.getByRole("button", { name: "Try again", exact: true })).toBeEnabled();
    }
    await expect(
      panel.getByText("20/20 AI requests left this hour. 200 of 200 left today.", { exact: true }),
    ).toBeVisible();
    await page.reload();
    await openAi(page);
    await latest.getByText("Details", { exact: true }).click();
    await expect(latest.getByText("SoC reached the 2,000-token output limit before finishing")).toBeVisible();
    await expect(
      panel.getByText("This request failed and did not use one of your hourly AI requests.", { exact: true }),
    ).toHaveCount(7);
    await page.screenshot({ path: "test-results/ai-failure-diagnostics.png", fullPage: true, caret: "initial" });
  } finally {
    await fixture.cleanup();
  }
});

test("the usage meter shows what is left and blocks requests at the limit", async ({ page }) => {
  const { fixture, pm, org, id } = await setupEditor(page);
  try {
    const panel = page.getByRole("complementary", { name: "AI assistant", exact: true });
    await page.getByLabel("Description", { exact: true }).fill("Rough notes");
    await expect(saved(page)).toBeVisible();
    await askAi(page, "Clarify this feature");
    await expect(
      panel.getByText("19/20 AI requests left this hour. 199 of 200 left today.", { exact: true }),
    ).toBeVisible();
    await expect(panel.getByRole("meter", { name: "AI requests left this hour", exact: true })).toHaveAttribute(
      "aria-valuenow",
      "19",
    );
    await askAi(page, "Explain the edge cases");
    await expect(
      panel.getByText("18/20 AI requests left this hour. 198 of 200 left today.", { exact: true }),
    ).toBeVisible();
    // Repeating an earlier request reuses that saved answer without a new turn.
    await askAi(page, "Clarify this feature");
    await expect(panel.getByLabel("Ask AI to change or explain this ticket", { exact: true })).toHaveValue("");
    await expect(
      panel.getByRole("list", { name: "Conversation", exact: true }).getByText("Clarify this feature", { exact: true }),
    ).toHaveCount(1);
    await expect(
      panel.getByText("18/20 AI requests left this hour. 198 of 200 left today.", { exact: true }),
    ).toBeVisible();
    const target = { target_org: org, request_id: id, actor_id: pm.id };
    const current = (await pm.client.rpc("read_request", { target_org: org, request_id: id })).data;
    for (let i = 0; i < 18; i++) {
      const admitted = await fixture.admin.rpc("begin_chat_turn", {
        ...target,
        turn_key: crypto.randomUUID(),
        base_revision: current.revision,
        input_fields: current.fields,
        user_message: `Seeded ${i}`,
        retry_failed: false,
        ai_limits: testAiLimits,
      });
      expect(admitted.error).toBeNull();
      expect(
        (
          await fixture.admin.rpc("finish_chat_turn", {
            ...target,
            turn_id: admitted.data.turn.id,
            worker_generation: 1,
            human_reply: "Seeded reply",
            task_proposal: null,
            failure_code: null,
          })
        ).error,
      ).toBeNull();
    }
    await page.reload();
    await openAi(page);
    await expect(
      panel.getByText(/^0\/20 AI requests left this hour\. More at .+\. 180 of 200 left today\.$/),
    ).toBeVisible();
    await panel.getByLabel("Ask AI to change or explain this ticket", { exact: true }).fill("One more");
    await expect(panel.getByRole("button", { name: "Ask AI", exact: true })).toBeDisabled();
    await expect(panel.getByRole("button", { name: "Check for gaps", exact: true })).toBeDisabled();
    await expect(page.getByLabel("Title", { exact: true })).toBeEditable();
  } finally {
    await fixture.cleanup();
  }
});

test("rough ideas become private AI drafts with undo and inline review", async ({ page }) => {
  const fixture = localFixture();
  const pm = await fixture.actor("PM");
  const org = (await pm.client.rpc("create_organisation", { organisation_name: "Ticket writing" })).data;
  try {
    await login(page, pm);
    await page.goto(`/organisations/${org}/requests`);
    await page.getByRole("button", { name: "New task", exact: true }).click();
    await page.getByLabel("Description", { exact: true }).fill("Remember filters when I return to the request list.");
    await expect(saved(page)).toBeVisible();
    await page.getByRole("button", { name: "Draft with AI", exact: true }).click();
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue("AI task proposal");
    await expect(saved(page)).toBeVisible();
    await expect(page.getByRole("button", { name: "Hide AI assistant", exact: true })).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await page.getByRole("button", { name: "Undo AI draft", exact: true }).click();
    await expect(page.getByLabel("Description", { exact: true })).toHaveValue(
      "Remember filters when I return to the request list.",
    );
    await page.getByLabel("Title", { exact: true }).fill("Remember my filters");
    await expect(saved(page)).toBeVisible();
    await askAi(page, "Suggest a proposal for clearer wording.");
    const review = await openReview(page);
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Remember my filters");
    await review.getByRole("button", { name: "Reject all", exact: true }).click();
    await review.getByRole("button", { name: "Done", exact: true }).click();
    await expect(lastTurn(page).getByText("Dismissed", { exact: true })).toBeVisible();
    await askAi(page, "Suggest a proposal for clearer wording, again.");
    await acceptAll(page);
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue("AI task proposal");
    await expect(saved(page)).toBeVisible();
    const id = page.url().split("/").at(-1)!;
    expect((await pm.client.rpc("read_request", { target_org: org, request_id: id })).data.submitted_at).toBeNull();
    await page.screenshot({ path: "test-results/ticket-first-desktop.png", fullPage: true });
  } finally {
    await fixture.cleanup();
  }
});

test("a rough idea typed into the AI box on an empty ticket drafts it", async ({ page }) => {
  const fixture = localFixture();
  const pm = await fixture.actor("PM");
  const org = (await pm.client.rpc("create_organisation", { organisation_name: "Composer drafts" })).data;
  try {
    await login(page, pm);
    await page.goto(`/organisations/${org}/requests`);
    await page.getByRole("button", { name: "New task", exact: true }).click();
    await askAi(page, "Help me write a ticket: remove multi-enchantment references from tutorial dialogue.");
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue("AI task proposal");
    await expect(page.getByRole("button", { name: "Undo AI draft", exact: true })).toBeVisible();
    const id = page.url().split("/").at(-1)!;
    expect((await pm.client.rpc("read_chat", { target_org: org, request_id: id })).data[0]).toMatchObject({
      intent: "draft",
      message: "Help me write a ticket: remove multi-enchantment references from tutorial dialogue.",
    });
    await page.getByRole("tab", { name: "Preview", exact: true }).click();
    await expect(
      page
        .getByRole("tabpanel", { name: "Preview", exact: true })
        .getByRole("heading", { name: "Desired behaviour", exact: true }),
    ).toBeVisible();
  } finally {
    await fixture.cleanup();
  }
});

test("Draft with AI says why it is unavailable after a save conflict", async ({ page }) => {
  const { fixture, pm, org, id } = await setupEditor(page);
  try {
    await page.getByLabel("Description", { exact: true }).fill("Rough notes");
    await expect(saved(page)).toBeVisible();
    const current = (await pm.client.rpc("read_request", { target_org: org, request_id: id })).data;
    expect(
      (
        await pm.client.rpc("save_draft", {
          target_org: org,
          request_id: id,
          expected_revision: current.revision,
          content: { ...current.fields, title: "Saved elsewhere" },
        })
      ).error,
    ).toBeNull();
    await page.getByLabel("Description", { exact: true }).fill("Rough notes, edited here");
    const draftButton = page.getByRole("button", { name: "Draft with AI", exact: true });
    await expect(draftButton).toBeDisabled();
    await expect(draftButton).toHaveAccessibleDescription("Resolve the save problem above before using AI.");
    await page.getByRole("button", { name: "Reload saved version and discard edits", exact: true }).click();
    await answerConfirmation(page, "Discard local edits?", "Discard and reload");
    await expect(draftButton).toBeEnabled();
    await expect(page.getByText("Resolve the save problem above before using AI.", { exact: true })).toHaveCount(0);
  } finally {
    await fixture.cleanup();
  }
});

test("switching to manual writing during the first-draft freshness check prevents automatic edits", async ({
  page,
}) => {
  const fixture = localFixture();
  const pm = await fixture.actor("PM");
  const org = (await pm.client.rpc("create_organisation", { organisation_name: "Manual takeover" })).data;
  let release!: () => void;
  try {
    await login(page, pm);
    await page.goto(`/organisations/${org}/requests`);
    await page.getByRole("button", { name: "New task", exact: true }).click();
    await page.getByLabel("Description", { exact: true }).fill("Keep this original rough idea.");
    await expect(saved(page)).toBeVisible();
    const id = page.url().split("/").at(-1)!;
    let started!: () => void;
    const intercepted = new Promise<void>(resolve => {
      started = resolve;
    });
    const hold = new Promise<void>(resolve => {
      release = resolve;
    });
    await page.route(`**/api/organisations/${org}/requests/${id}`, async route => {
      if (route.request().method() === "GET") {
        started();
        await hold;
      }
      await route.continue();
    });
    await page.getByRole("button", { name: "Draft with AI", exact: true }).click();
    await intercepted;
    await page.getByLabel("Title", { exact: true }).fill("Manual title");
    release();
    await expect(lastTurn(page).getByRole("button", { name: "Review changes", exact: true })).toBeVisible();
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Manual title");
    await expect(page.getByLabel("Description", { exact: true })).toHaveValue("Keep this original rough idea.");
  } finally {
    release?.();
    await fixture.cleanup();
  }
});

test("Check for gaps asks structured questions and applies answers in one request for review", async ({ page }) => {
  const { fixture, pm, org, id } = await setupEditor(page);
  try {
    await page.getByLabel("Title", { exact: true }).fill("Remember my filters");
    const original = "## Problem description\n\nKeep my wording.\n\n## Out of scope\n\nNo cross-device sync.";
    await page.getByLabel("Description", { exact: true }).fill(original);
    await expect(saved(page)).toBeVisible();
    const panel = page.getByRole("complementary", { name: "AI assistant", exact: true });
    await panel.getByRole("button", { name: "Check for gaps", exact: true }).click();
    const checklist = panel.getByRole("region", { name: "Open questions", exact: true });
    await expect(checklist.getByRole("group", { name: "Which lists should keep filters?", exact: true })).toBeVisible();
    await expect(lastTurn(page).getByRole("button", { name: "Review changes", exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Description", { exact: true })).toHaveValue(original);
    await expect(checklist.getByRole("button", { name: "Apply answers", exact: true })).toBeDisabled();
    await panel
      .getByLabel("Ask AI to change or explain this ticket", { exact: true })
      .fill("Keep this instruction while I write.");
    await page.getByRole("button", { name: "Hide AI assistant", exact: true }).click();
    await page.getByRole("button", { name: "Show AI assistant", exact: true }).click();
    await expect(panel.getByLabel("Ask AI to change or explain this ticket", { exact: true })).toHaveValue(
      "Keep this instruction while I write.",
    );
    await checklist
      .getByRole("group", { name: "Which lists should keep filters?", exact: true })
      .getByLabel("Requests only", { exact: true })
      .check();
    await checklist
      .getByRole("group", { name: "How long should filters persist?", exact: true })
      .getByLabel("Leave undecided", { exact: true })
      .check();
    await page.screenshot({ path: "test-results/ticket-gaps-desktop.png", fullPage: true });
    await checklist.getByRole("button", { name: "Apply answers", exact: true }).click();
    await expect(lastTurn(page).getByText("1 change in Description", { exact: true })).toBeVisible();
    // The answered checklist becomes read-only.
    await expect(panel.getByRole("region", { name: "Open questions", exact: true })).toHaveCount(0);
    await expect(page.getByLabel("Description", { exact: true })).toHaveValue(original);
    const turns = (await pm.client.rpc("read_chat", { target_org: org, request_id: id })).data;
    expect(turns).toHaveLength(2);
    expect(turns[1]).toMatchObject({
      intent: "edit",
      answers: [
        { question: "Which lists should keep filters?", answer: "Requests only" },
        { question: "How long should filters persist?", answer: null },
      ],
    });
    await acceptAll(page);
    await expect(page.getByLabel("Description", { exact: true })).toHaveValue(
      original +
        "\n\n## Decisions\n\n- Which lists should keep filters? Requests only\n- Unresolved: How long should filters persist?",
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByLabel("Title", { exact: true })).toBeVisible();
    await expect(panel.getByLabel("Ask AI to change or explain this ticket", { exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: "test-results/ticket-review-mobile.png", fullPage: true });
  } finally {
    await fixture.cleanup();
  }
});

test("a lost first-draft response preserves the rough idea and requires review after recovery", async ({ page }) => {
  const fixture = localFixture();
  const pm = await fixture.actor("PM");
  const org = (await pm.client.rpc("create_organisation", { organisation_name: "Draft response recovery" })).data;
  try {
    await login(page, pm);
    await page.goto(`/organisations/${org}/requests`);
    await page.getByRole("button", { name: "New task", exact: true }).click();
    await page.getByLabel("Description", { exact: true }).fill("Keep my original idea after response loss.");
    await expect(saved(page)).toBeVisible();
    const id = page.url().split("/").at(-1)!;
    let lose = true;
    await page.route(`**/api/organisations/${org}/requests/${id}/chat`, async route => {
      if (route.request().method() === "POST" && lose) {
        lose = false;
        await route.fetch();
        await route.abort();
      } else await route.continue();
    });
    await page.getByRole("button", { name: "Draft with AI", exact: true }).click();
    await expect(lastTurn(page).getByRole("button", { name: "Review changes", exact: true })).toBeVisible();
    await expect(page.getByLabel("Description", { exact: true })).toHaveValue(
      "Keep my original idea after response loss.",
    );
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue("");
    await acceptAll(page);
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue("AI task proposal");
    expect((await pm.client.rpc("read_chat", { target_org: org, request_id: id })).data).toHaveLength(1);
  } finally {
    await fixture.cleanup();
  }
});

test("undo cannot replace manual edits or a newer remotely saved ticket", async ({ page }) => {
  const fixture = localFixture();
  const pm = await fixture.actor("PM");
  const org = (await pm.client.rpc("create_organisation", { organisation_name: "Safe draft undo" })).data;
  try {
    await login(page, pm);
    await page.goto(`/organisations/${org}/requests`);
    await page.getByRole("button", { name: "New task", exact: true }).click();
    await page.getByLabel("Description", { exact: true }).fill("Original idea.");
    await expect(saved(page)).toBeVisible();
    await page.getByRole("button", { name: "Draft with AI", exact: true }).click();
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue("AI task proposal");
    await expect(saved(page)).toBeVisible();
    await page.getByLabel("Title", { exact: true }).fill("My manual edit");
    await expect(page.getByRole("button", { name: "Undo AI draft", exact: true })).toBeDisabled();
    await page.getByLabel("Title", { exact: true }).fill("AI task proposal");
    await expect(saved(page)).toBeVisible();
    await expect(page.getByRole("button", { name: "Undo AI draft", exact: true })).toBeEnabled();
    const id = page.url().split("/").at(-1)!;
    const current = (await pm.client.rpc("read_request", { target_org: org, request_id: id })).data;
    expect(
      (
        await pm.client.rpc("save_draft", {
          target_org: org,
          request_id: id,
          expected_revision: current.revision,
          content: { ...current.fields, title: "Newer remote writing" },
        })
      ).error,
    ).toBeNull();
    await page.getByRole("button", { name: "Undo AI draft", exact: true }).click();
    await expect(page.getByRole("alert").filter({ hasText: "Another editor saved a newer ticket" })).toBeVisible();
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue("AI task proposal");
    expect((await pm.client.rpc("read_request", { target_org: org, request_id: id })).data.fields.title).toBe(
      "Newer remote writing",
    );
  } finally {
    await fixture.cleanup();
  }
});

test("a failed first-draft freshness check leaves the draft for review with a usable manual editor", async ({
  page,
}) => {
  const fixture = localFixture();
  const pm = await fixture.actor("PM");
  const org = (await pm.client.rpc("create_organisation", { organisation_name: "Freshness read recovery" })).data;
  try {
    await login(page, pm);
    await page.goto(`/organisations/${org}/requests`);
    await page.getByRole("button", { name: "New task", exact: true }).click();
    await page.getByLabel("Description", { exact: true }).fill("Keep my rough idea on read failure.");
    await expect(saved(page)).toBeVisible();
    const id = page.url().split("/").at(-1)!;
    let fail = true;
    await page.route(`**/api/organisations/${org}/requests/${id}`, async route => {
      if (route.request().method() === "GET" && fail) {
        fail = false;
        await route.abort();
      } else await route.continue();
    });
    await page.getByRole("button", { name: "Draft with AI", exact: true }).click();
    await expect(page.getByLabel("Title", { exact: true })).toBeVisible();
    await acceptAll(page);
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue("AI task proposal");
  } finally {
    await fixture.cleanup();
  }
});

test("each change is accepted, rejected or undone on its own and edited parts become outdated", async ({ page }) => {
  const { fixture } = await setupEditor(page);
  try {
    const panel = assistantPanel(page);
    await page.getByLabel("Description", { exact: true }).fill("Rough notes");
    await expect(saved(page)).toBeVisible();
    await askAi(page, "Please suggest a task proposal.");
    await expect(lastTurn(page).getByText("2 changes: title and 1 in Description", { exact: true })).toBeVisible();
    let dialog = await openReview(page);
    const title = dialog.getByRole("region", { name: "Change 1 of 2: Title", exact: true });
    const description = dialog.getByRole("region", { name: "Change 2 of 2: Description", exact: true });
    await title.getByRole("button", { name: "Accept", exact: true }).click();
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue("AI task proposal");
    await expect(title.getByText("Applied", { exact: true })).toBeVisible();
    await expect(description.getByRole("button", { name: "Accept", exact: true })).toBeFocused();
    await description.getByRole("button", { name: "Reject", exact: true }).click();
    await expect(description.getByText("Rejected", { exact: true })).toBeVisible();
    await expect(page.getByLabel("Description", { exact: true })).toHaveValue("Rough notes");
    await expect(dialog.getByText("1 applied, 1 rejected", { exact: true })).toBeVisible();
    await title.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue("");
    await dialog.getByRole("button", { name: "Formatted", exact: true }).click();
    await expect(description.getByRole("heading", { name: "Desired behaviour", exact: true })).toBeVisible();
    await dialog.getByRole("button", { name: "Close review", exact: true }).click();
    await expect(dialog).toHaveCount(0);
    await expect(lastTurn(page).getByText("0 of 2 applied", { exact: true })).toBeVisible();
    await page.getByLabel("Title", { exact: true }).fill("Remember my filters");
    await expect(saved(page)).toBeVisible();
    await panel.getByRole("button", { name: "Check for gaps", exact: true }).click();
    const checklist = panel.getByRole("region", { name: "Open questions", exact: true });
    await checklist
      .getByRole("group", { name: "Which lists should keep filters?", exact: true })
      .getByLabel("Requests only", { exact: true })
      .check();
    await checklist.getByRole("button", { name: "Apply answers", exact: true }).click();
    await expect(lastTurn(page).getByText("1 change in Description", { exact: true })).toBeVisible();
    // An edit elsewhere in the ticket leaves the change usable.
    await page.getByLabel("Title", { exact: true }).fill("Remember filters per list");
    dialog = await openReview(page);
    await expect(dialog.getByRole("button", { name: "Accept", exact: true })).toBeEnabled();
    await dialog.getByRole("button", { name: "Done", exact: true }).click();
    // Editing the text the change replaces makes it outdated.
    await page.getByLabel("Description", { exact: true }).fill("Rough notes, rewritten by me");
    dialog = await openReview(page);
    await expect(dialog.getByText("You've changed this part since", { exact: true })).toBeVisible();
    await expect(dialog.getByRole("button", { name: "Accept", exact: true })).toHaveCount(0);
    await expect(dialog.getByRole("button", { name: "Accept all", exact: true })).toBeDisabled();
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await dialog.evaluate(element => element.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: "test-results/ai-review-modal-mobile.png", caret: "initial" });
    await dialog.getByRole("button", { name: "Done", exact: true }).click();
    await expect(lastTurn(page).getByText("Outdated", { exact: true })).toBeVisible();
  } finally {
    await fixture.cleanup();
  }
});
