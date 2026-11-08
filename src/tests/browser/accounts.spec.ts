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
    const username = `Tester_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
    const password = "Disposable-browser-password-2026";
    const fixture = localFixture();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.name));
    try {
      await page.goto("/sign-up");
      const usernameInput = page.getByLabel("Username", { exact: true });
      const emailInput = page.getByLabel("Email address", { exact: true });
      const passwordInput = page.getByLabel("Password", { exact: true });
      const rolePicker = page.getByRole("combobox", { name: "Application role" });
      const createAccount = page.getByRole("button", { name: "Create account", exact: true });
      await usernameInput.focus();
      await page.keyboard.press("Tab");
      await expect(emailInput).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(passwordInput).toBeFocused();
      await emailInput.fill(email);
      await passwordInput.fill(password);
      await expect(usernameInput).toHaveAttribute("required", "");
      await expect(usernameInput).toHaveAccessibleDescription("Choose a username with 3–24 letters, digits or underscores.");
      await expect(passwordInput).toHaveAccessibleDescription("Use 12–128 characters.");
      await expect(page.getByText("Your role cannot be changed after signup.", { exact: true })).toBeVisible();
      const roleLabel = role === "PM" ? "Product Manager" : "Developer";
      await rolePicker.press(role === "PM" ? "Home" : "End");
      await expect(page.getByRole("listbox", { name: "Application role options" })).toBeVisible();
      await rolePicker.press("Enter");
      await expect(rolePicker).toHaveText(roleLabel);
      await createAccount.click();
      await expect(usernameInput).toBeFocused();
      await usernameInput.fill("Legacy_reserved");
      await createAccount.click();
      await expect(page.getByRole("alert").filter({ hasText: "Choose a different username." })).toBeVisible();
      await expect(usernameInput).toHaveValue("Legacy_reserved");
      if (role === "Developer") {
        await page.setViewportSize({ width: 390, height: 844 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      }
      await usernameInput.fill(username);
      await createAccount.click();
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
      expect(await (await page.request.get("/api/account")).json()).toMatchObject({ account: { role, username: username.toLowerCase() } });
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
  await page.getByRole("link", { name: "Verify your email", exact: true }).click();
  const backToSignIn = page.getByRole("link", { name: "Back to sign in", exact: true });
  await expect(backToSignIn.locator("svg")).toHaveAttribute("aria-hidden", "true");
  await backToSignIn.press("Enter");
  await expect(page).toHaveURL(/\/sign-in$/);
  expect(hydrationWarnings).toBe(0);
});
