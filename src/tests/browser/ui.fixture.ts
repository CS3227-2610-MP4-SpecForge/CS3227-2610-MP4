import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, type Response } from "@playwright/test";

/** Record non-GET requests for one ticket, to prove that edits stayed local. */
export function recordTicketWrites(page: Page, requestId: string) {
  const writes: string[] = [];
  page.on("request", request => {
    if (request.method() !== "GET" && request.url().includes(`/requests/${requestId}`))
      writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
  });
  return writes;
}

/**
 * Wait until a held response has fully reached the page and React has had two
 * frames to process it, so a test can assert that a stale response was ignored.
 */
export async function settleAfter(page: Page, response: Promise<Response>) {
  await (await response).finished();
  await page.evaluate(
    () => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  );
}

/** Fail on serious or critical axe violations on the page, or inside one CSS scope. */
export async function expectAccessible(page: Page, scope?: string) {
  const builder = new AxeBuilder({ page });
  if (scope) builder.include(scope);
  const { violations } = await builder.analyze();
  expect(
    violations
      .filter(violation => violation.impact === "serious" || violation.impact === "critical")
      .map(
        violation =>
          `${violation.id}: ${violation.help} (${violation.nodes.map(node => node.target.join(" ")).join(", ")})`,
      ),
  ).toEqual([]);
}

export function savedTicketStatus(page: Page) {
  return page
    .getByRole("region", { name: "About this ticket", exact: true })
    .getByRole("status")
    .filter({ hasText: /^Last (?:auto)?saved: / });
}

export async function selectPill(page: Page, label: string, option: string) {
  await page.getByRole("combobox", { name: label, exact: true }).click();
  await page
    .getByRole("listbox", { name: `${label} options`, exact: true })
    .getByRole("option", { name: option, exact: true })
    .click();
}

export async function setDueDate(page: Page, value: string) {
  await page.getByRole("button", { name: /^Due date / }).click();
  const calendar = page.getByRole("dialog", { name: "Due date calendar", exact: true });
  if (!value) await calendar.getByRole("button", { name: "Clear date", exact: true }).click();
  else {
    await calendar.getByLabel("Exact date", { exact: true }).fill(value);
    await calendar.getByRole("button", { name: "Apply date", exact: true }).click();
  }
}
