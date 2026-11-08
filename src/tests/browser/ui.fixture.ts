import type { Page } from "@playwright/test";

export function savedTicketStatus(page: Page) {
  return page.getByRole("region", { name: "About this ticket", exact: true }).getByRole("status")
    .filter({ hasText: /^Last (?:auto)?saved: / });
}

export async function selectPill(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page.getByRole("listbox", { name: `${label} options`, exact: true }).getByRole("option", { name: option, exact: true }).click();
}

export async function setDueDate(page: Page, value: string) {
  await page.getByRole("button", { name: "Due date", exact: true }).click();
  const calendar = page.getByRole("dialog", { name: "Due date calendar", exact: true });
  if (!value) await calendar.getByRole("button", { name: "Clear date", exact: true }).click();
  else {
    await calendar.getByLabel("Exact date", { exact: true }).fill(value);
    await calendar.getByRole("button", { name: "Apply date", exact: true }).click();
  }
}
