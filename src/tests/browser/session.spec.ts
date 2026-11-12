import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { localFixture } from "../local.fixture";
import { expectAccessible, savedTicketStatus } from "./ui.fixture";

test("an ended session shows the sign-in banner and keeps unsaved ticket text", async ({ page, context }) => {
  const fixture = localFixture();
  const actor = await fixture.actor("PM");
  const org = (await actor.client.rpc("create_organisation", { organisation_name: "Session expiry" })).data;
  const draft = (await actor.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
  try {
    await page.goto("/sign-in");
    await page.getByLabel("Email address").fill(actor.email);
    await page.getByLabel("Password", { exact: true }).fill(actor.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/workspace$/);
    await page.goto(`/organisations/${org}/requests/${draft.id}`);
    const description = page.getByLabel("Description", { exact: true });
    await description.fill("Saved idea");
    await expect(savedTicketStatus(page)).toBeVisible();

    // Sign out in a second tab of the same browser; the first tab is not told.
    const other = await context.newPage();
    await other.goto("/workspace");
    await other.getByRole("button", { name: /Account options$/ }).click();
    await other.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(other).toHaveURL(/\/sign-in$/);
    await other.close();

    await description.fill("Unsaved idea typed after the session ended");
    const banner = page.getByRole("alert").filter({ hasText: "Your session has ended. Sign in again to continue." });
    await expect(banner).toBeVisible();
    await expect(banner).toHaveCount(1);
    await expect(description).toHaveValue("Unsaved idea typed after the session ended");
    await expect(page).toHaveURL(new RegExp(`/requests/${draft.id}$`));
    await expectAccessible(page, ".session-banner");

    // Following the link asks before leaving the unsaved text.
    let warned = false;
    page.once("dialog", async dialog => {
      warned = true;
      await dialog.dismiss();
    });
    await banner.getByRole("link", { name: "Sign in again", exact: true }).click();
    expect(warned).toBe(true);
    await expect(description).toHaveValue("Unsaved idea typed after the session ended");
    page.once("dialog", dialog => dialog.accept());
    await banner.getByRole("link", { name: "Sign in again", exact: true }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await expect(page.getByRole("alert").filter({ hasText: "Your session has ended." })).toHaveCount(0);
  } finally {
    await fixture.cleanup();
  }
});
