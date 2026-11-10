import { test, expect } from "@playwright/test";
import { localFixture } from "../local.fixture";
async function reopenManagement(page: import("@playwright/test").Page, name: string) {
  await page.getByRole("button", { name: "Close management", exact: true }).click();
  await page.getByRole("button", { name: `Manage ${name}`, exact: true }).click();
}
const origin = process.env.SPECFORGE_BROWSER_ORIGIN ?? "http://localhost:3000";

test("PM and Developer manage invitations, admin handover and leaving", async ({ page, browser }) => {
  const fixture = localFixture();
  const a = await fixture.actor("PM");
  const b = await fixture.actor("Developer");
  const context = await browser.newContext();
  const recipient = await context.newPage();
  const login = async (target: typeof page, actor: typeof a) => {
    await target.goto(origin + "/sign-in");
    await target.getByLabel("Email address").fill(actor.email);
    await target.getByLabel("Password", { exact: true }).fill(actor.password);
    await target.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(target).toHaveURL(/\/workspace$/);
  };
  page.on("dialog", dialog => dialog.accept());
  recipient.on("dialog", dialog => dialog.accept());
  try {
    await login(page, a);
    await page.getByLabel("Organisation name").fill("Membership journey");
    await page.getByRole("button", { name: "Create organisation", exact: true }).click();
    await expect(page.getByRole("dialog", { name: "Manage Membership journey", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Leave organisation", exact: true }).click();
    await expect(page.getByRole("region", { name: "Organisation membership" }).getByRole("alert")).toContainText("at least one admin");
    await page.getByLabel("Invite by email").fill(b.email);
    await page.getByRole("button", { name: "Send invitation", exact: true }).click();
    await expect(page.getByText(b.email, { exact: true })).toBeVisible();
    await login(recipient, b);
    await expect(recipient.getByRole("heading", { name: "Your invitations" })).toBeVisible();
    await recipient.getByRole("button", { name: "Decline", exact: true }).click();
    await expect(recipient.getByText("No pending invitations.")).toBeVisible();
    await reopenManagement(page, "Membership journey");
    await expect(page.getByText("Declined", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Cancel invitation", exact: true }).click();
    await expect(page.getByText("No pending outgoing invitations.")).toBeVisible();
    await page.getByLabel("Invite by email").fill(b.email);
    await page.getByRole("button", { name: "Send invitation", exact: true }).click();
    await expect(page.getByText(b.email, { exact: true })).toBeVisible();
    await recipient.getByRole("button", { name: "Refresh membership", exact: true }).click();
    await recipient.getByRole("button", { name: "Accept", exact: true }).click();
    await expect(recipient.getByRole("button", { name: "Manage Membership journey", exact: true })).toBeVisible();
    await reopenManagement(page, "Membership journey");
    const member = page.getByRole("listitem").filter({ has: page.getByText(b.username, { exact: true }) });
    await member.getByRole("button", { name: "Promote admin", exact: true }).click();
    await expect(member.getByRole("button", { name: "Demote admin", exact: true })).toBeVisible();
    await member.getByRole("button", { name: "Demote admin", exact: true }).click();
    await expect(member.getByRole("button", { name: "Promote admin", exact: true })).toBeVisible();
    await member.getByRole("button", { name: "Promote admin", exact: true }).click();
    await expect(member.getByRole("button", { name: "Demote admin", exact: true })).toBeVisible();
    await page.route("**/api/organisations", async route => {
      if (route.request().method() === "GET") await new Promise(resolve => setTimeout(resolve, 1500));
      await route.continue();
    });
    const self = page.getByRole("listitem").filter({ has: page.getByText(a.username, { exact: true }) });
    await self.getByRole("button", { name: "Demote admin", exact: true }).click();
    await expect(page.getByRole("link", { name: /Membership journey Member/ })).toBeVisible();
    await expect(page.getByLabel("Invite by email")).toHaveCount(0);
    await expect(page.getByRole("dialog", { name: "Manage Membership journey", exact: true })).toBeVisible();
    const membership = page.getByRole("region", { name: "Organisation membership" });
    await expect(membership.getByRole("button", { name: "Refresh membership", exact: true })).toHaveCount(0);
    await expect(membership.getByRole("alert")).toHaveCount(0);
    await page.getByRole("button", { name: "Leave organisation", exact: true }).click();
    await expect(page.getByText("Your team starts here")).toBeVisible();
    await recipient.getByRole("button", { name: "Refresh membership", exact: true }).click();
    await recipient.getByRole("button", { name: "Manage Membership journey", exact: true }).click();
    await expect(recipient.getByRole("dialog", { name: "Manage Membership journey", exact: true })).toBeVisible();
    await expect(recipient.getByLabel("Invite by email")).toBeVisible();
    await recipient.setViewportSize({ width: 390, height: 844 });
    expect(await recipient.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await recipient.screenshot({ path: "test-results/membership-mobile.png", fullPage: true, caret: "initial" });
    await page.screenshot({ path: "test-results/membership-pm.png", fullPage: true, caret: "initial" });
  } finally { await context.close(); await fixture.cleanup(); }
});

test("Developer admin resends expired invitations, cancels and removes a PM member", async ({ page }) => {
  const fixture = localFixture();
  const admin = await fixture.actor("Developer");
  const pm = await fixture.actor("PM");
  const org = (await admin.client.rpc("create_organisation", { organisation_name: "Outgoing controls" })).data;
  page.on("dialog", dialog => dialog.accept());
  try {
    await page.goto("/sign-in");
    await page.getByLabel("Email address").fill(admin.email);
    await page.getByLabel("Password", { exact: true }).fill(admin.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/workspace$/);
    await page.getByRole("button", { name: "Manage Outgoing controls", exact: true }).click();
    await page.getByLabel("Invite by email").fill(pm.email);
    await page.getByRole("button", { name: "Send invitation", exact: true }).click();
    await expect(page.getByText(pm.email, { exact: true })).toBeVisible();
    const invitation = (await pm.client.rpc("list_invitations")).data[0].id;
    await fixture.admin.from("organisation_invitations").update({ expires_at: "2020-01-01T00:00:00Z" }).eq("id", invitation);
    await reopenManagement(page, "Outgoing controls");
    await page.getByRole("button", { name: "Resend", exact: true }).click();
    await expect(page.getByRole("button", { name: "Resend", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Cancel invitation", exact: true }).click();
    await expect(page.getByText("No pending outgoing invitations.")).toBeVisible();
    await page.getByLabel("Invite by email").focus();
    await page.keyboard.press("Tab");
    await expect(page.getByRole("button", { name: "Send invitation", exact: true })).toBeFocused();
    await page.getByLabel("Invite by email").fill(pm.email);
    await page.getByRole("button", { name: "Send invitation", exact: true }).click();
    await expect(page.getByText(pm.email, { exact: true })).toBeVisible();
    const fresh = (await pm.client.rpc("list_invitations")).data[0].id;
    await pm.client.rpc("respond_invitation", { invitation_id: fresh, decision: "accept" });
    await reopenManagement(page, "Outgoing controls");
    const member = page.getByRole("listitem").filter({ has: page.getByText(pm.username, { exact: true }) });
    await expect(member.getByRole("button", { name: "Remove member", exact: true })).toBeVisible();
    await page.screenshot({ path: "test-results/membership-desktop.png", fullPage: true, caret: "initial" });
    await member.getByRole("button", { name: "Remove member", exact: true }).click();
    await expect(page.getByText(pm.username, { exact: true })).toHaveCount(0);
    expect((await pm.client.from("organisations").select("id").eq("id", org)).data).toEqual([]);
  } finally { await fixture.cleanup(); }
});

test("unknown email invites persist and creation/withdrawal banners float without shifting the modal", async ({ page }) => {
  const fixture = localFixture();
  const owner = await fixture.actor("PM");
  const org = (await owner.client.rpc("create_organisation", { organisation_name: "Banner team" })).data;
  const email = `unknown-${crypto.randomUUID()}@example.com`;
  page.on("dialog", dialog => dialog.accept());
  try {
    await page.goto("/sign-in");
    await page.getByLabel("Email address").fill(owner.email);
    await page.getByLabel("Password", { exact: true }).fill(owner.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await page.getByRole("button", { name: "Manage Banner team", exact: true }).click();
    const input = page.getByLabel("Invite by email", { exact: true });
    const modal = page.getByRole("dialog", { name: "Manage Banner team", exact: true });
    await input.fill(email);
    const before = await input.boundingBox();
    await page.getByRole("button", { name: "Send invitation", exact: true }).click();
    const banner = page.getByRole("status").filter({ hasText: "Invitation created." });
    await expect(banner).toBeVisible();
    await expect(input).toBeVisible();
    expect((await input.boundingBox())!.y).toBe(before!.y);
    const bannerBounds = (await banner.boundingBox())!;
    const modalBounds = (await modal.boundingBox())!;
    expect(bannerBounds.y).toBeLessThan(modalBounds.y);
    expect(Math.abs(bannerBounds.x + bannerBounds.width / 2 - 640)).toBeLessThan(2);
    const outgoing = modal.getByRole("listitem").filter({ hasText: email });
    await expect(outgoing).toBeVisible();
    await expect(banner).toHaveCount(0, { timeout: 4500 });
    await input.fill(email);
    await page.getByRole("button", { name: "Send invitation", exact: true }).click();
    const duplicateBanner = page.getByRole("status").filter({ hasText: "Invitation already pending." });
    await expect(duplicateBanner).toBeVisible();
    await page.waitForTimeout(1800); // Trigger again before the original three-second lifetime ends.
    await input.fill(email);
    await page.getByRole("button", { name: "Send invitation", exact: true }).click();
    await expect(input).toHaveValue(""); // Wait for the repeated request to finish.
    await page.waitForTimeout(1700); // Past the first deadline, within the restarted lifetime.
    await expect(duplicateBanner).toBeVisible();
    await expect(duplicateBanner).toHaveCount(0, { timeout: 4500 });

    await page.setViewportSize({ width: 390, height: 844 });
    await outgoing.getByRole("button", { name: "Cancel invitation", exact: true }).click();
    const withdrawn = page.getByRole("status").filter({ hasText: "The invitation has been withdrawn" });
    await expect(withdrawn).toBeVisible();
    await expect(outgoing).toHaveCount(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: "test-results/invitation-banner-mobile.png", fullPage: true });
    await expect(withdrawn).toHaveCount(0, { timeout: 4500 });
    expect((await owner.client.rpc("list_invitations", { target_org: org })).data).toEqual([]);
  } finally { await fixture.cleanup(); }
});
