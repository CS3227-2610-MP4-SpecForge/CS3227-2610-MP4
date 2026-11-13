import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { expect, test, type Locator, type Page } from "@playwright/test";
import { localFixture } from "../tests/local.fixture";
import { savedTicketStatus as saved } from "../tests/browser/ui.fixture";
import { localDay } from "../overview";

// Walks the User Guide's five-minute journey against the local stack with the
// fake AI and saves the screenshots the guide shows. The two demo accounts and
// their organisation are disposable and removed at the end.
const images = join(process.cwd(), "docs", "images");
const people = {
  pm: { email: "alex@example.com", username: "alex_pm" },
  developer: { email: "sam@example.com", username: "sam_dev" },
};

/** Captures the page, or one element of it, once transient notices have closed. */
async function shot(page: Page, name: string, target?: Locator) {
  await expect(page.locator(".notification-banner")).toHaveCount(0, { timeout: 5000 });
  // The Next.js development badge is not part of the product.
  await page.addStyleTag({ content: "nextjs-portal { display: none !important; }" });
  const options = { path: join(images, `${name}.png`), animations: "disabled", caret: "hide" } as const;
  await (target ? target.screenshot(options) : page.screenshot(options));
}

/** Returns a setup call's data, or fails naming the call, so a broken setup is not a later timeout. */
function ok<Result extends { data: unknown; error: unknown }>(name: string, result: Result): Result["data"] {
  if (result.error) throw new Error(`Screenshot setup failed at ${name}.`);
  return result.data;
}

async function signIn(page: Page, actor: { email: string; password: string }) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(actor.email);
  await page.getByLabel("Password", { exact: true }).fill(actor.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/workspace$/);
}

test("User Guide screenshots", async ({ page, browser }) => {
  test.setTimeout(120_000);
  const fixture = localFixture();
  try {
    // Remove demo accounts an interrupted earlier run may have left behind.
    const existing = ok("listUsers", await fixture.admin.auth.admin.listUsers({ perPage: 1000 }));
    for (const user of existing.users)
      if (user.email === people.pm.email || user.email === people.developer.email) await fixture.deleteActor(user.id);
    const pm = await fixture.actor("PM", true, people.pm.email);
    const developer = await fixture.actor("Developer", true, people.developer.email);
    for (const [actor, { username }] of [
      [pm, people.pm],
      [developer, people.developer],
    ] as const)
      ok("rename_username", await actor.client.rpc("rename_username", { new_username: username }));

    // A new account with no organisation yet.
    await signIn(page, pm);
    await expect(page.getByRole("heading", { name: "Your team starts here", exact: true })).toBeVisible();
    await shot(page, "workspace-empty");

    const org = ok(
      "create_organisation",
      await pm.client.rpc("create_organisation", { organisation_name: "Acme Product" }),
    );
    ok("invite_member", await pm.client.rpc("invite_member", { target_org: org, target_email: developer.email }));
    const [invitation] = ok("list_invitations", await developer.client.rpc("list_invitations"));
    ok(
      "respond_invitation",
      await developer.client.rpc("respond_invitation", { invitation_id: invitation.id, decision: "accept" }),
    );

    // Draft a ticket from a rough idea, then ask for a change to review.
    await page.goto(`/organisations/${org}/requests`);
    await page.getByRole("button", { name: "New task", exact: true }).click();
    await page.getByLabel("Description", { exact: true }).fill("Remember filters when I return to the request list.");
    await expect(saved(page)).toBeVisible();
    await page.getByRole("button", { name: "Draft with AI", exact: true }).click();
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue("AI task proposal");
    await expect(saved(page)).toBeVisible();
    // A hand edit, so the next AI suggestion has a change to review.
    await page.getByLabel("Title", { exact: true }).fill("Remember my filters");
    await expect(saved(page)).toBeVisible();
    const assistant = page.getByRole("complementary", { name: "AI assistant", exact: true });
    const latest = () =>
      assistant.getByRole("list", { name: "Conversation", exact: true }).getByRole("listitem").last();
    const ask = async (message: string) => {
      await page.getByLabel("Ask AI to change or explain this ticket", { exact: true }).fill(message);
      await page.getByRole("button", { name: "Ask AI", exact: true }).click();
    };
    await ask("Suggest a proposal for clearer wording.");
    await expect(latest().getByRole("button", { name: "Review changes", exact: true })).toBeVisible();
    await page.evaluate(() => window.scrollTo(0, 0));
    await shot(page, "ticket-editor-ai");

    await latest().getByRole("button", { name: "Review changes", exact: true }).click();
    const review = page.getByRole("dialog", { name: "Review AI changes", exact: true });
    await expect(review).toBeVisible();
    await shot(page, "change-review");
    await review.getByRole("button", { name: "Accept all", exact: true }).click();
    await review.getByRole("button", { name: "Done", exact: true }).click();
    await expect(review).toHaveCount(0);
    await expect(saved(page)).toBeVisible();

    // A failed AI turn, with its diagnostic opened.
    await ask("simulate upstream 502");
    await expect(latest().getByRole("alert")).toBeVisible();
    await latest().getByText("Details", { exact: true }).click();
    await expect(latest().getByText(/SoC returned HTTP 502/)).toBeVisible();
    // The conversation area follows the window height; a taller window fits the
    // whole failed turn, scrolled to the top of the conversation's own area.
    await page.setViewportSize({ width: 1280, height: 1300 });
    await latest().evaluate(turn => turn.scrollIntoView({ block: "start" }));
    await shot(page, "ai-failure-details", assistant);
    await page.setViewportSize(test.info().project.use.viewport!);

    // Publish, so the Developer can plan tests against it.
    const ticket = page.url().split("/").at(-1)!;
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect
      .poll(
        async () => (await pm.client.rpc("read_request", { target_org: org, request_id: ticket })).data?.submitted_at,
      )
      .toBeTruthy();

    const context = await browser.newContext({
      baseURL: test.info().project.use.baseURL,
      viewport: test.info().project.use.viewport,
    });
    const reader = await context.newPage();
    await signIn(reader, developer);
    await reader.goto(`/organisations/${org}/requests/${ticket}`);
    await reader.getByRole("button", { name: "Show test plan", exact: true }).click();
    await reader.getByRole("button", { name: "Generate test cases", exact: true }).click();
    await expect(reader.getByRole("button", { name: "Save to ticket", exact: true })).toBeVisible();
    await reader.getByRole("heading", { name: "Test plan", exact: true }).evaluate(heading => {
      heading.scrollIntoView({ block: "start" });
      window.scrollBy(0, -32);
    });
    await shot(reader, "test-plan-panel");

    // A few more published tickets, so the Overview has something to count.
    const day = (offset: number) => localDay(new Date(Date.now() + offset * 86_400_000));
    const extra = [
      { title: "Export filtered requests", due_date: day(-2), priority: "high", assignee_ids: [developer.id] },
      { title: "Keyboard shortcuts", due_date: day(3), priority: "medium", assignee_ids: [developer.id, pm.id] },
      { title: "Empty-state copy", due_date: day(10), priority: "low", assignee_ids: [] },
    ];
    for (const { title, ...changes } of extra) {
      const draft = ok(
        "create_request",
        await pm.client.rpc("create_request", { target_org: org, creation_key: randomUUID() }),
      );
      const args = { target_org: org, request_id: draft.id };
      ok("update_delivery", await pm.client.rpc("update_delivery", { ...args, expected_revision: 1, changes }));
      ok(
        "publish_request",
        await pm.client.rpc("publish_request", {
          ...args,
          expected_revision: 1,
          content: { title, description: "A sample ticket for the Overview screenshot." },
          acknowledged: true,
          first_submission: true,
        }),
      );
    }
    await reader.goto(`/organisations/${org}/overview`);
    await expect(reader.getByRole("link", { name: "1 Overdue", exact: true })).toBeVisible();
    await shot(reader, "organisation-overview", reader.locator("main"));
    await context.close();
  } finally {
    await fixture.cleanup();
  }
});
