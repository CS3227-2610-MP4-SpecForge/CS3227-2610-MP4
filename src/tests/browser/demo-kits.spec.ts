import { test, expect, type Page } from "@playwright/test";
import { localFixture, resetLocalDemoKitWindows } from "../local.fixture";
import { expectAccessible } from "./ui.fixture";

const origin = process.env.SPECFORGE_BROWSER_ORIGIN ?? "http://localhost:3000";

async function readLogin(page: Page, role: "Product Manager" | "Developer") {
  const login = page.getByRole("region", { name: `${role} login`, exact: true });
  const [email, password] = await login.locator("code").allTextContents();
  return { email, password };
}
async function signIn(page: Page, login: { email: string; password: string }) {
  await page.getByLabel("Email address").fill(login.email);
  await page.getByLabel("Password", { exact: true }).fill(login.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/workspace$/);
}

test("a visitor creates a demo kit and both logins work together without a mailbox", async ({ page, browser }) => {
  resetLocalDemoKitWindows();
  const fixture = localFixture();
  const ids: string[] = [];
  const context = await browser.newContext();
  const developerPage = await context.newPage();
  page.on("dialog", dialog => dialog.accept());
  try {
    await page.goto(origin + "/sign-in");
    await page.getByRole("button", { name: "Create demo kit", exact: true }).click();
    await expect(page.getByText(/shown only once/)).toBeVisible();
    await expectAccessible(page, ".demo-kit");
    const pm = await readLogin(page, "Product Manager");
    const developer = await readLogin(page, "Developer");
    expect(pm.email).toMatch(/^demo-pm-[0-9a-f]{32}@example\.com$/);
    expect(developer.email).toMatch(/^demo-dev-[0-9a-f]{32}@example\.com$/);
    for (const login of [pm, developer]) {
      const { data } = await fixture.client().auth.signInWithPassword(login);
      ids.push(data.user!.id);
    }

    // Reloading, or leaving and coming back, never shows the logins again.
    await page.reload();
    await expect(page.getByText(pm.email)).toHaveCount(0);
    await page.goto(origin + "/sign-up");
    await page.goBack();
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByText(pm.email)).toHaveCount(0);

    await signIn(page, pm);
    await page.getByLabel("Organisation name").fill("Demo kit trial");
    await page.getByRole("button", { name: "Create organisation", exact: true }).click();
    await page.getByLabel("Invite by email").fill(developer.email);
    await page.getByRole("button", { name: "Send invitation", exact: true }).click();
    await expect(page.getByText(developer.email, { exact: true })).toBeVisible();

    await developerPage.goto(origin + "/sign-in");
    await signIn(developerPage, developer);
    await developerPage.getByRole("button", { name: "Accept", exact: true }).click();
    await expect(developerPage.getByRole("button", { name: "Manage Demo kit trial", exact: true })).toBeVisible();
  } finally {
    await context.close();
    for (const id of ids) await fixture.admin.auth.admin.deleteUser(id);
  }
});

test("a full daily limit reads as a deliberate limit with a way forward", async ({ page }) => {
  await page.route("**/api/demo-kits", route =>
    route.fulfill({
      status: 429,
      headers: { "Retry-After": "7200" },
      json: { error: "Demo kit limit reached.", limit: "daily", retryAfter: 7200 },
    }),
  );
  await page.goto(origin + "/sign-in");
  await page.getByRole("button", { name: "Create demo kit", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Singapore time" })).toContainText(
    "Today's 30 demo kits have all been used.",
  );
  await expect(page.getByRole("region", { name: "Try SpecForge" }).getByRole("alert")).toHaveCount(0);
  await page.getByRole("link", { name: "create an account", exact: true }).click();
  await expect(page).toHaveURL(/\/sign-up$/);
});
