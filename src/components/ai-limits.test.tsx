import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { expectAccessible, renderComponent } from "@/tests/render";
import { ChatPanel } from "./chat-panel";
import { OrganisationAiUsage } from "./organisation-ai-usage";
import { TestPlanPanel } from "./test-plan-panel";
import { useAssistant } from "./use-assistant";

// Shared AI limits in the panels (workflow/specs/2026-11-13-site-wide-ai-limit.md, criteria 10, 13 and 16).
const chatPath = "/api/organisations/org-1/requests/ticket-1/chat";
const fields = { title: "Title", description: "Description" };
const capacity = "SpecForge's AI is at capacity right now. Try again in about 1 minute, or keep editing manually.";

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
const usage = (daily: number) => ({
  remaining: 19,
  limit: 20,
  resets_at: "2099-01-01T00:00:00Z",
  daily: { remaining: daily, limit: 40, resets_at: "2099-01-01T16:00:00Z" },
});

function Assistant() {
  const assistant = useAssistant({ path: chatPath, canSend: true, onSuggestion: async () => {} });
  return (
    <ChatPanel
      assistant={assistant}
      fields={fields}
      revision={1}
      canSend
      rejections={{}}
      onReview={() => {}}
      header={null}
      footer={null}
    >
      {null}
    </ChatPanel>
  );
}

describe("PM assistant limits", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows the daily allowance next to the hourly count", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => reply({ turns: [], usage: usage(37) }));
    renderComponent(<Assistant />);
    await expect.element(page.getByText("19/20 AI requests left this hour. 37 of 40 left today.")).toBeVisible();
  });

  it("shows a shared limit as a calm notice and keeps sending available", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) =>
      init?.method === "POST"
        ? reply({ error: capacity, limit: "site", retryAfter: 15, usage: usage(37) }, 429)
        : reply({ turns: [], usage: usage(37) }),
    );
    renderComponent(<Assistant />);
    await userEvent.fill(page.getByLabelText("Ask AI to change or explain this ticket"), "Shorter please");
    await userEvent.click(page.getByRole("button", { name: "Ask AI", exact: true }));
    await expect.element(page.getByRole("status").filter({ hasText: capacity })).toBeVisible();
    await expect.element(page.getByRole("alert").filter({ hasText: capacity })).not.toBeInTheDocument();
    await expect.element(page.getByRole("button", { name: "Ask AI", exact: true })).toBeEnabled();
    await expectAccessible();
  });

  it("stops sending once today's personal allowance is used", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => reply({ turns: [], usage: usage(0) }));
    renderComponent(<Assistant />);
    await expect.element(page.getByText("0 of 40 left today.", { exact: false })).toBeVisible();
    await userEvent.fill(page.getByLabelText("Ask AI to change or explain this ticket"), "Shorter please");
    await expect.element(page.getByRole("button", { name: "Ask AI", exact: true })).toBeDisabled();
  });
});

describe("test plan limits", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows a shared limit beside the button as a calm notice", async () => {
    const notice =
      "Your organisation has used today's AI allowance. It resets at midnight Singapore time (in about 3 hours), or plan manually.";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) =>
      init?.method === "POST"
        ? reply({ error: notice, limit: "organisation", retryAfter: 9000 }, 429)
        : reply({ saved: null, turns: [] }),
    );
    renderComponent(
      <TestPlanPanel
        path="/api/organisations/org-1/requests/ticket-1/test-plan"
        fields={fields}
        ticketRevision={1}
        canGenerate
      />,
    );
    await userEvent.click(page.getByRole("button", { name: "Show test plan", exact: true }));
    await userEvent.click(page.getByRole("button", { name: "Generate test cases", exact: true }));
    await expect.element(page.getByRole("status").filter({ hasText: notice })).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Generate test cases", exact: true })).toBeEnabled();
  });
});

describe("test plan personal daily limit", () => {
  afterEach(() => vi.restoreAllMocks());

  it("keeps generating off after a personal daily-limit block", async () => {
    const notice =
      "You have used today's 40 AI requests. They reset at midnight Singapore time (in about 3 hours), or plan manually.";
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) =>
      init?.method === "POST"
        ? reply({ error: notice, limit: "user_daily", retryAfter: 9000 }, 429)
        : reply({ saved: null, turns: [] }),
    );
    renderComponent(
      <TestPlanPanel
        path="/api/organisations/org-1/requests/ticket-1/test-plan"
        fields={fields}
        ticketRevision={1}
        canGenerate
      />,
    );
    await userEvent.click(page.getByRole("button", { name: "Show test plan", exact: true }));
    await userEvent.click(page.getByRole("button", { name: "Generate test cases", exact: true }));
    await expect.element(page.getByRole("status").filter({ hasText: notice })).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Generate test cases", exact: true })).toBeDisabled();
  });
});

describe("organisation AI usage", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows the organisation's requests left today", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      reply({ remaining: 52, limit: 80, resets_at: "2099-01-01T16:00:00Z" }),
    );
    renderComponent(<OrganisationAiUsage organisationId="org-1" />);
    await expect.element(page.getByText("AI today: 52 of 80 left · resets at midnight Singapore time.")).toBeVisible();
    await expect.element(page.getByRole("meter", { name: "Organisation AI requests left today" })).toBeVisible();
    await expectAccessible();
  });

  it("hides the bar when the count cannot be read", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      reply({ error: "You no longer have permission for this action." }, 403),
    );
    renderComponent(<OrganisationAiUsage organisationId="org-1" />);
    await expect.poll(() => vi.mocked(globalThis.fetch).mock.calls.length).toBeGreaterThan(0);
    await expect.element(page.getByRole("meter")).not.toBeInTheDocument();
  });
});
