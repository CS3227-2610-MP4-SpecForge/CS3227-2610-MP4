import { test, expect, type Page } from "@playwright/test";
import { randomUUID } from "node:crypto";
import { localFixture } from "../local.fixture";
import { localDay } from "../../overview";
import { expectAccessible } from "./ui.fixture";

// Organisation overview journey (workflow/specs/2026-11-13-organisation-overview.md, criteria 1, 4, 5, 6 and 7).
async function login(page: Page, actor: { email: string; password: string }) {
  await page.goto("/sign-in");
  await page.getByLabel("Email address").fill(actor.email);
  await page.getByLabel("Password", { exact: true }).fill(actor.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/workspace$/);
}

test("overview counts lead to a filtered Requests view that survives reload", async ({ page }) => {
  const fixture = localFixture();
  const pm = await fixture.actor("PM");
  const dev = await fixture.actor("Developer");
  const outsider = await fixture.actor("Developer");
  const org = (await pm.client.rpc("create_organisation", { organisation_name: "Overview journey" })).data;
  await pm.client.rpc("invite_member", { target_org: org, target_email: dev.email });
  const accepted = await dev.client.rpc("respond_invitation", {
    invitation_id: (await dev.client.rpc("list_invitations")).data[0].id,
    decision: "accept",
  });
  expect(accepted.error).toBeNull();
  const yesterday = localDay(new Date(Date.now() - 86_400_000));
  const publish = async (title: string, changes: Record<string, unknown>) => {
    const draft = (await pm.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
    const args = { target_org: org, request_id: draft.id };
    if (Object.keys(changes).length)
      expect((await pm.client.rpc("update_delivery", { ...args, expected_revision: 1, changes })).error).toBeNull();
    const published = await pm.client.rpc("publish_request", {
      ...args,
      expected_revision: 1,
      content: { title, description: "Overview journey" },
      acknowledged: true,
      first_submission: true,
    });
    expect(published.error).toBeNull();
  };
  await publish("Late shared ticket", { due_date: yesterday, assignee_ids: [dev.id, pm.id] });
  await publish("Undated ticket", {});
  try {
    await login(page, dev);
    await page.getByRole("link", { name: /Overview journey Member/ }).click();
    await expect(page).toHaveURL(`/organisations/${org}/overview`);
    await expect(page.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible();
    await expect(page.getByRole("link", { name: "2 To do", exact: true })).toBeVisible();
    // The shared overdue ticket is one ticket in the total, and one on each assignee's row.
    await expect(page.getByRole("link", { name: "1 Overdue", exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: `${dev.username}: 1 overdue`, exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: `${pm.username}: 1 overdue`, exact: true })).toBeVisible();
    await expectAccessible(page);

    await page.getByRole("link", { name: "1 Overdue", exact: true }).click();
    await expect(page).toHaveURL(`/organisations/${org}/requests?status=overdue`);
    const table = page.getByRole("table", { name: "Requests", exact: true });
    await expect(table.getByRole("link", { name: "Late shared ticket", exact: true })).toBeVisible();
    await expect(table.getByRole("link", { name: "Undated ticket", exact: true })).toHaveCount(0);
    await expect(page.getByRole("combobox", { name: "Status filter", exact: true })).toHaveText("Overdue");
    await page.reload();
    await expect(table.getByRole("link", { name: "Late shared ticket", exact: true })).toBeVisible();
    await expect(table.getByRole("link", { name: "Undated ticket", exact: true })).toHaveCount(0);

    await page.getByRole("link", { name: "Overview", exact: true }).click();
    await page.setViewportSize({ width: 375, height: 812 });
    await expect(page.getByRole("link", { name: "1 Overdue", exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

    await page.getByRole("button", { name: "Account options" }).click();
    await page.getByRole("button", { name: "Sign out", exact: true }).click();
    await expect(page).toHaveURL(/\/sign-in$/);
    await login(page, outsider);
    await page.goto(`/organisations/${org}/overview`);
    await expect(
      page.getByRole("alert").filter({ hasText: "You no longer have permission to view this organisation." }),
    ).toBeVisible();
  } finally {
    await fixture.cleanup();
  }
});
