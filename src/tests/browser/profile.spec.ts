import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { localFixture } from "../local.fixture";
import { expectAccessible } from "./ui.fixture";

for (const role of ["PM", "Developer"] as const) {
  test(`${role} views and edits their profile`, { tag: "@smoke" }, async ({ page }) => {
    const fixture = localFixture();
    const actor = await fixture.actor(role);
    await actor.client.rpc("create_organisation", { organisation_name: "Profile team" });
    try {
      await page.goto("/sign-in");
      await page.getByLabel("Email address").fill(actor.email);
      await page.getByLabel("Password", { exact: true }).fill(actor.password);
      await page.getByRole("button", { name: "Sign in", exact: true }).click();
      await expect(page).toHaveURL(/\/workspace$/);
      const accountControl = page.getByRole("button", { name: /Account options$/ });
      await accountControl.click();
      await page.getByRole("link", { name: "Profile", exact: true }).click();
      await expect(page).toHaveURL(/\/profile$/);
      await expect(page.getByRole("heading", { name: "Your profile", exact: true })).toBeVisible();
      await expectAccessible(page);
      await expect(page.getByLabel("Username", { exact: true })).toHaveValue(actor.username);
      await expect(page.getByText(actor.email, { exact: true }).last()).toBeVisible();
      await expect(page.getByText("Verified", { exact: true })).toBeVisible();
      const createdAt = (await actor.client.auth.getUser()).data.user!.created_at;
      await expect(page.locator("time")).toHaveAttribute("datetime", createdAt);
      await expect(page.locator("time")).toHaveText(
        new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(
          new Date(createdAt),
        ),
      );
      await expect(page.getByRole("heading", { name: "Profile team", exact: true })).toBeVisible();
      await expect(page.getByRole("button", { name: "Save changes", exact: true })).toBeDisabled();
      const newName = `Renamed_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
      await page.getByLabel("Username", { exact: true }).fill(newName);
      await page.getByRole("button", { name: "Save changes", exact: true }).click();
      await expect(page.getByRole("status").filter({ hasText: "Profile updated." })).toBeVisible();
      await expect(accountControl).toContainText(newName.toLowerCase());
      await expect(page.getByLabel("Username", { exact: true })).toHaveValue(newName.toLowerCase());
      await page.setViewportSize(role === "Developer" ? { width: 390, height: 844 } : { width: 1280, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      await page.screenshot({ path: `test-results/profile-${role}.png`, fullPage: true });
      await page.reload();
      await expect(page.getByLabel("Username", { exact: true })).toHaveValue(newName.toLowerCase());
    } finally {
      await fixture.cleanup();
    }
  });
}

test("profile handles loading failures, validation, save failures and cancelled departures", async ({ page }) => {
  const fixture = localFixture();
  const actor = await fixture.actor("PM");
  const peer = await fixture.actor("Developer");
  try {
    await page.goto("/sign-in");
    await page.getByLabel("Email address").fill(actor.email);
    await page.getByLabel("Password", { exact: true }).fill(actor.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/workspace$/);
    await page.route("**/api/account", route =>
      route.fulfill({
        status: 503,
        contentType: "application/json",
        body: JSON.stringify({ error: "Profile temporarily unavailable." }),
      }),
    );
    await page.goto("/profile");
    await expect(page.getByRole("alert").filter({ hasText: "Profile temporarily unavailable." })).toHaveText(
      "Profile temporarily unavailable.",
    );
    await page.unroute("**/api/account");
    await page.getByRole("button", { name: "Retry loading profile" }).click();
    const username = page.getByLabel("Username", { exact: true });
    await expect(username).toHaveValue(actor.username);
    await expect(page.getByRole("button", { name: /Account options$/ })).toBeVisible();
    await expect(
      page.getByText("No organisations yet. Create a team or accept an invitation to get started."),
    ).toBeVisible();
    await username.fill("Legacy_reserved");
    const save = page.getByRole("button", { name: "Save changes", exact: true });
    await save.click();
    await expect(username).toHaveAccessibleDescription("Choose a different username.");
    await expect(username).toHaveAttribute("aria-invalid", "true");
    await username.fill(peer.username);
    await save.click();
    await expect(username).toHaveAccessibleDescription("That username is already taken. Choose another.");
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect(username).toHaveValue(actor.username);
    await expect(save).toBeDisabled();
    await username.fill("local_unsaved_name");
    await page.route("**/api/account", async route => {
      if (route.request().method() === "POST")
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ error: "Unable to save. Please retry." }),
        });
      else await route.continue();
    });
    await save.click();
    await expect(page.getByRole("alert").filter({ hasText: "Unable to save. Please retry." })).toHaveText(
      "Unable to save. Please retry.",
    );
    await expect(username).toHaveValue("local_unsaved_name");
    page.once("dialog", dialog => dialog.dismiss());
    await page.getByRole("link", { name: "SpecForge home" }).click();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(username).toHaveValue("local_unsaved_name");
    await page.getByRole("button", { name: "Account options" }).click();
    page.once("dialog", dialog => dialog.dismiss());
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    expect((await page.request.get("/api/account")).status()).toBe(200);
    await expect(username).toHaveValue("local_unsaved_name");
    await page.unroute("**/api/account");
    await save.click();
    await expect(page.getByRole("status").filter({ hasText: "Profile updated." })).toBeVisible();
    await username.fill("another_local_name");
    page.once("dialog", dialog => dialog.accept());
    await page.getByRole("link", { name: "SpecForge home" }).click();
    await expect(page).toHaveURL(/\/workspace$/);
  } finally {
    await fixture.cleanup();
  }
});

test("signed-out profile visitors are sent to sign in", async ({ page }) => {
  await page.goto("/profile");
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("button", { name: "Account options" })).toHaveCount(0);
});
