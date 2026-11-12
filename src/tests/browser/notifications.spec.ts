import { randomUUID } from "node:crypto";
import { test, expect } from "@playwright/test";
import { localFixture } from "../local.fixture";

test("test-plan notifications expire without losing saved content or retry controls", async ({ page }) => {
  const fixture = localFixture();
  const pm = await fixture.actor("PM");
  const developer = await fixture.actor("Developer");
  const org = (await pm.client.rpc("create_organisation", { organisation_name: "Notification plans" })).data;
  await pm.client.rpc("invite_member", { target_org: org, target_email: developer.email });
  await developer.client.rpc("respond_invitation", {
    invitation_id: (await developer.client.rpc("list_invitations")).data[0].id,
    decision: "accept",
  });
  const ticket = (await pm.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
  const published = await pm.client.rpc("publish_request", {
    target_org: org,
    request_id: ticket.id,
    expected_revision: 1,
    content: { title: "Shared feedback", description: "Show action outcomes above the current page." },
    acknowledged: true,
    first_submission: true,
  });
  expect(published.error).toBeNull();
  try {
    await page.goto("/sign-in");
    await page.getByLabel("Email address").fill(developer.email);
    await page.getByLabel("Password", { exact: true }).fill(developer.password);
    await page.getByRole("button", { name: "Sign in", exact: true }).click();
    await expect(page).toHaveURL(/\/workspace$/);
    await page.goto(`/organisations/${org}/requests/${ticket.id}`);
    await page.getByRole("button", { name: "Show test plan", exact: true }).click();
    await page.getByRole("button", { name: "Generate test cases", exact: true }).click();
    await page.getByRole("button", { name: "Save to ticket", exact: true }).click();
    const success = page.getByRole("status").filter({ hasText: "Test plan saved to the ticket." });
    await expect(success).toHaveClass(/notification-banner/);
    await expect(success).toHaveCount(0, { timeout: 4500 });
    await expect(page.getByRole("region", { name: "Saved test plan", exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Generate again", exact: true }).click();
    await page.route(`**/api/organisations/${org}/requests/${ticket.id}/test-plan`, route =>
      route.request().method() === "PUT"
        ? route.fulfill({
            status: 503,
            contentType: "application/json",
            body: JSON.stringify({ error: "Plan saving temporarily unavailable." }),
          })
        : route.continue(),
    );
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByRole("button", { name: "Replace saved plan", exact: true }).click();
    const failure = page.getByRole("alert").filter({ hasText: "Plan saving temporarily unavailable." });
    await expect(failure).toHaveClass(/notification-banner danger/);
    await page.screenshot({ path: "test-results/notification-error-mobile.png", fullPage: true });
    await expect(failure).toHaveCount(0, { timeout: 4500 });
    await expect(page.getByRole("region", { name: "Saved test plan", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Replace saved plan", exact: true })).toBeEnabled();
  } finally {
    await fixture.cleanup();
  }
});
