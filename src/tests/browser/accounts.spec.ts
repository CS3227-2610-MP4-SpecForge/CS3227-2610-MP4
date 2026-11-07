import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { localFixture } from "../local.fixture";
const origin = process.env.SPECFORGE_BROWSER_ORIGIN ?? "http://localhost:3000";

async function codeFor(email: string) {
  const inbox = await fetch("http://127.0.0.1:55324/api/v1/messages").then(response => response.json());
  const message = inbox.messages.find((item: { ID: string; To: { Address: string }[] }) => item.To.some(to => to.Address === email));
  if (!message) return "";
  const mail = await fetch(`http://127.0.0.1:55324/api/v1/message/${message.ID}`).then(response => response.json());
  return String(mail.Text).match(/\b\d{8}\b/)?.[0] ?? "";
}

for (const role of ["PM", "Developer"] as const) {
  test(`${role} signs up, verifies email, creates an organisation and signs in again`, async ({ page }) => {
    const email = `browser-${randomUUID()}@example.com`;
    const password = "Disposable-browser-password-2026";
    const fixture = localFixture();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.name));
    try {
      await page.goto("/sign-up");
      await page.getByLabel("Email address").fill(email);
      await page.getByLabel("Password", { exact: true }).fill(password);
      await page.getByLabel("Application role").selectOption(role);
      await page.getByRole("button", { name: "Create account", exact: true }).click();
      await expect(page.getByRole("status")).toContainText("Check your email");
      const denied = await page.request.post("/api/organisations", { headers: { origin }, data: { name: "Unverified team" } });
      expect(denied.status()).toBe(401);
      let token = "";
      await expect.poll(async () => { token = await codeFor(email); return Boolean(token); }).toBe(true);
      await page.getByRole("link", { name: "Enter your verification code" }).click();
      await expect(page).toHaveURL(/\/verify-email$/);
      await expect(page.getByRole("heading", { name: "Verify your email" })).toBeVisible();
      await page.getByLabel("Email address").fill(email);
      await page.getByLabel("Verification code").fill(token);
      await page.getByRole("button", { name: "Verify email", exact: true }).click();
      await expect(page).toHaveURL(/\/workspace$/);
      await expect(page.getByRole("heading", { name: "Organisations", exact: true })).toBeVisible();
      await expect(page.getByText("Your team starts here")).toBeVisible();
      await page.getByLabel("Organisation name").fill(`${role} test team`);
      await page.getByRole("button", { name: "Create organisation", exact: true }).click();
      await expect(page.getByRole("status").filter({ hasText: "Organisation created" })).toContainText("Organisation created");
      await expect(page.getByRole("heading", { name: `${role} test team`, exact: true })).toBeVisible();
      await page.getByRole("button", { name: new RegExp(`${role} test team Admin`) }).click();
      await expect(page.getByText("You have admin access to this organisation.")).toBeVisible();
      const cookies = await page.context().cookies();
      const authCookies = cookies.filter(cookie => cookie.name.includes("auth-token"));
      expect(authCookies.length).toBeGreaterThan(0);
      expect(authCookies.every(cookie => cookie.httpOnly && cookie.sameSite === "Lax")).toBe(true);
      if (role === "PM") {
        await page.screenshot({ path: "test-results/workspace-desktop.png", fullPage: true, caret: "initial" });
        await page.setViewportSize({ width: 390, height: 844 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
        await page.screenshot({ path: "test-results/workspace-mobile.png", fullPage: true, caret: "initial" });
      }
      await page.getByRole("button", { name: "Sign out", exact: true }).click();
      await expect(page).toHaveURL(/\/sign-in$/);
      expect((await page.request.get("/api/account")).status()).toBe(401);
      const replay = await page.request.post("/api/auth/verify", { headers: { origin }, data: { email, token } });
      expect(replay.status()).toBe(400);
      await page.getByLabel("Email address").fill(email);
      await page.getByLabel("Password", { exact: true }).fill(password);
      if (role === "PM") await page.screenshot({ path: "test-results/signin-mobile.png", fullPage: true, caret: "initial" });
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page).toHaveURL(/\/workspace$/);
      await expect(page.getByRole("button", { name: new RegExp(`${role} test team Admin`) })).toBeVisible();
      expect(errors).toEqual([]);
    } finally {
      const { data } = await fixture.admin.auth.admin.listUsers();
      const user = data.users.find(user => user.email === email);
      if (user) await fixture.admin.auth.admin.deleteUser(user.id);
    }
  });
}

test("account forms support keyboard focus and do not overflow on mobile", async ({ page }) => {
  let hydrationWarnings = 0;
  page.on("console", message => { if (message.type() === "error" && message.text().includes("hydrated")) hydrationWarnings++; });
  await page.goto("/sign-in");
  await page.keyboard.press("Tab");
  await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
  await page.screenshot({ path: "test-results/signin-desktop.png", fullPage: true, caret: "initial" });
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByLabel("Email address")).toBeVisible();
  expect(hydrationWarnings).toBe(0);
});
