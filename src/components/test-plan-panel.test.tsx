import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { expectAccessible, renderComponent } from "@/tests/render";
import { TestPlanPanel } from "./test-plan-panel";

const path = "/api/organisations/org-1/requests/ticket-1/test-plan";

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

async function openPanel() {
  renderComponent(
    <TestPlanPanel
      path={path}
      fields={{ title: "Title", description: "Description" }}
      ticketRevision={1}
      canGenerate
    />,
  );
  await userEvent.click(page.getByRole("button", { name: "Show test plan", exact: true }));
}

describe("TestPlanPanel loading", () => {
  afterEach(() => vi.restoreAllMocks());

  it("says there is no test plan only after a successful empty load", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => reply({ saved: null, turns: [] }));
    await openPanel();
    await expect.element(page.getByText("No test plan yet.", { exact: true })).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Retry loading test plan" })).not.toBeInTheDocument();
  });

  it("shows a failed load and a retry instead of the empty text, then recovers", async () => {
    const fetch = vi
      .spyOn(globalThis, "fetch")
      .mockImplementation(async () => reply({ error: "Test plans are temporarily unavailable." }, 503));
    await openPanel();
    const failure = page.getByText("Test plans are temporarily unavailable.", { exact: false });
    await expect.element(failure).toBeVisible();
    await expect.element(page.getByText("No test plan yet.", { exact: true })).not.toBeInTheDocument();
    await expectAccessible();

    // The failure stays after transient notices expire, until a retry succeeds.
    fetch.mockImplementation(async () => reply({ saved: null, turns: [] }));
    await userEvent.click(page.getByRole("button", { name: "Retry loading test plan", exact: true }));
    await expect.element(page.getByText("No test plan yet.", { exact: true })).toBeVisible();
    await expect.element(failure).not.toBeInTheDocument();
  });
});
