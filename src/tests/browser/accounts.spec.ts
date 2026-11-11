import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { localFixture } from "../local.fixture";
import { expectAccessible } from "./ui.fixture";
const origin = process.env.SPECFORGE_BROWSER_ORIGIN ?? "http://localhost:3000";

async function codeFor(email: string) {
  const inbox = await fetch("http://127.0.0.1:55324/api/v1/messages").then(response => response.json());
  const message = inbox.messages.find((item: { ID: string; To: { Address: string }[] }) => item.To.some(to => to.Address === email));
  if (!message) return "";
  const mail = await fetch(`http://127.0.0.1:55324/api/v1/message/${message.ID}`).then(response => response.json());
  return String(mail.Text).match(/\b\d{8}\b/)?.[0] ?? "";
}

for (const role of ["PM", "Developer"] as const) {
  test(`${role} signs up, verifies email, creates an organisation and signs in again`, { tag: "@smoke" }, async ({ page }) => {
    const email = `browser-${randomUUID()}@example.com`;
    const username = `Tester_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
    const password = "Disposable-browser-password-2026";
    const fixture = localFixture();
    const errors: string[] = [];
    page.on("pageerror", error => errors.push(error.name));
    try {
      await page.goto("/sign-up");
      await expectAccessible(page);
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
      if (role === "PM") {
        await expect(page.getByRole("status").filter({ hasText: "Check your email" })).toHaveCount(0, { timeout: 4500 });
        await expect(page.getByRole("link", { name: "Enter your verification code" })).toBeVisible();
      }
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
      await expect(page.getByRole("dialog", { name: `Manage ${role} test team`, exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Close management", exact: true }).click();
      await expect(page.getByText("Active organisation", { exact: true })).toHaveCount(0);

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
      if (role === "PM") await page.setViewportSize({ width: 1280, height: 900 });
      const navigation = page.getByRole("navigation", { name: "Main navigation" });
      const accountControl = navigation.getByRole("button", { name: "Account options" });
      await expect(accountControl).toContainText(username.toLowerCase());
      await expect(accountControl).toContainText(email);
      await expect(navigation.getByRole("link", { name: "Workspace", exact: true })).toHaveCount(0);
      const headingRow = page.getByRole("heading", { name: "Organisations", exact: true }).locator("../..");
      await expect(headingRow).not.toContainText(email);
      await expect(headingRow.getByRole("button", { name: "Sign out", exact: true })).toHaveCount(0);
      await page.getByRole("link", { name: new RegExp(`${role} test team Admin`) }).press("Enter");
      await expect(page).toHaveURL(/\/requests$/);
      await expect(accountControl).toContainText(username.toLowerCase());
      await page.getByRole("link", { name: "SpecForge home" }).click();
      await expect(page).toHaveURL(/\/workspace$/);
      const signout = navigation.getByRole("button", { name: "Sign out", exact: true });
      await expect(signout).toBeHidden();
      await accountControl.hover();
      await expect(signout).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: `test-results/account-menu-${role}.png`, fullPage: true });
      await signout.hover();
      await expect(signout).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(signout).toBeHidden();
      await accountControl.focus();
      await accountControl.press("Enter");
      await page.keyboard.press("Tab");
      await expect(navigation.getByRole("link", { name: "Profile", exact: true })).toBeFocused();
      await page.keyboard.press("Tab");
      await expect(signout).toBeFocused();
      await page.keyboard.press("Escape");
      await expect(accountControl).toBeFocused();
      await accountControl.click();
      await page.getByText("Choose a team space, or create a new one.", { exact: true }).click();
      await expect(signout).toBeHidden();
      await accountControl.click();
      await page.route("**/api/auth/signout", route => route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Please try signing out again." }) }));
      await signout.click();
      await expect(page.getByRole("alert").filter({ hasText: "Please try signing out again." })).toHaveText("Please try signing out again.");
      await expect(signout).toBeEnabled();
      await page.unroute("**/api/auth/signout");
      await signout.click();
      await expect(page).toHaveURL(/\/sign-in$/);
      await expect(accountControl).toHaveCount(0);
      expect((await page.request.get("/api/account")).status()).toBe(401);
      const replay = await page.request.post("/api/auth/verify", { headers: { origin }, data: { email, token } });
      expect(replay.status()).toBe(400);
      await page.getByLabel("Email address").fill(email);
      await page.getByLabel("Password", { exact: true }).fill(password);
      if (role === "PM") await page.screenshot({ path: "test-results/signin-mobile.png", fullPage: true, caret: "initial" });
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page).toHaveURL(/\/workspace$/);
      await expect(page.getByRole("link", { name: new RegExp(`${role} test team Admin`) })).toBeVisible();
      await expect(accountControl).toContainText(username.toLowerCase());
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
  await expectAccessible(page);
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


test("signing out respects unsaved ticket edits before ending the session", async ({ page }) => {
  const fixture = localFixture();
  const actor = await fixture.actor("PM");
  const org = (await actor.client.rpc("create_organisation", { organisation_name: "Sign-out guard" })).data;
  const draft = (await actor.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
  try {
    await page.goto("/sign-in");
    await page.getByLabel("Email address").fill(actor.email);
    await page.getByLabel("Password", { exact: true }).fill(actor.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/workspace$/);
    await page.goto(`/organisations/${org}/requests/${draft.id}`);
    await page.getByLabel("Title", { exact: true }).fill("Published ticket");
    await page.getByLabel("Description", { exact: true }).fill("Original description");
    await page.getByRole("button", { name: "Publish", exact: true }).click();
    await expect(page.getByRole("button", { name: "Update", exact: true })).toBeVisible();
    await page.getByLabel("Title", { exact: true }).fill("Unsaved title");
    const accountControl = page.getByRole("button", { name: /Account options$/ });
    await accountControl.click();
    let warned = false;
    page.once("dialog", async dialog => { warned = true; await dialog.dismiss(); });
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    expect(warned).toBe(true);
    await expect(page.getByLabel("Title", { exact: true })).toHaveValue("Unsaved title");
    expect((await page.request.get("/api/account")).status()).toBe(200);
    await accountControl.click();
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    expect((await page.request.get("/api/account")).status()).toBe(401);
  } finally { await fixture.cleanup(); }
});

test("organisation links navigate directly and Manage switches team context", { tag: "@smoke" }, async ({ page }) => {
  const fixture = localFixture();
  const actor = await fixture.actor("PM");
  const first = (await actor.client.rpc("create_organisation", { organisation_name: "First team" })).data;
  await actor.client.rpc("create_organisation", { organisation_name: "Second team" });
  try {
    await page.goto("/sign-in");
    await page.getByLabel("Email address").fill(actor.email);
    await page.getByLabel("Password", { exact: true }).fill(actor.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByRole("button", { name: "Manage First team", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Manage First team", exact: true })).toBeVisible();
    const initialClose = page.getByRole("button", { name: "Close management", exact: true });
    await expect(initialClose).not.toBeFocused();
    await expect(page.getByRole("region", { name: "Management content", exact: true })).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    await expect(initialClose).toBeFocused();
    await expect(page.getByRole("dialog", { name: "Manage First team", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Close management", exact: true }).press("Escape");
    await expect(page.getByRole("button", { name: "Manage First team", exact: true })).toBeFocused();
    await page.getByRole("button", { name: "Manage Second team", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Manage Second team", exact: true })).toBeVisible();
    await expect(page).toHaveURL(/\/workspace$/);
    await expect(page.getByText("Active organisation", { exact: true })).toHaveCount(0);
    await expect(page.getByRole("link", { name: "View requests", exact: true })).toHaveCount(0);
    const bounds = await page.getByRole("dialog").boundingBox();
    expect(bounds!.width).toBeCloseTo(1280 * 0.7, -1);
    expect(bounds!.height).toBeCloseTo(720 * 0.7, -1);
    await page.setViewportSize({ width: 390, height: 844 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    const modal = page.getByRole("dialog");
    await expect(modal.getByRole("heading", { name: "Invite Member", exact: true })).toBeVisible();
    await expect(modal.getByRole("heading", { name: "Existing members", exact: true })).toBeVisible();
    await expect(modal.getByRole("heading", { name: "Membership", exact: true })).toHaveCount(0);
    await expect(modal.getByRole("button", { name: "Refresh membership", exact: true })).toHaveCount(0);
    const close = page.getByRole("button", { name: "Close management", exact: true });
    await expect(close.locator("svg")).toHaveAttribute("aria-hidden", "true");
    const closeBefore = await close.boundingBox();
    const content = page.getByRole("region", { name: "Management content", exact: true });
    await content.evaluate(element => { element.scrollTop = element.scrollHeight; });
    expect(await content.evaluate(element => element.scrollTop)).toBeGreaterThan(0);
    expect((await close.boundingBox())!.y).toBe(closeBefore!.y);
    await close.click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await page.getByRole("link", { name: /First team Admin/ }).click();
    await expect(page).toHaveURL(`/organisations/${first}/requests`);
  } finally { await fixture.cleanup(); }
});
