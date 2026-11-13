import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { renderComponent } from "@/tests/render";
import type { ChatTurn } from "@/chat";
import { ChatPanel } from "./chat-panel";
import { useAssistant } from "./use-assistant";

// Visible outcomes of PM assistant turns (workflow/specs/2026-11-13-reliable-ai-edits.md, criteria 5 and 6).
const chatPath = "/api/organisations/org-1/requests/ticket-1/chat";
const fields = { title: "Title", description: "Description" };
const usage = { remaining: 19, limit: 20, resets_at: null };
const turn = (overrides: Partial<ChatTurn>): ChatTurn => ({
  id: "turn-1",
  turn_key: "00000000-0000-4000-8000-000000000001",
  base_revision: 1,
  input_fields: fields,
  message: "Add refill details",
  status: "completed",
  generation: 1,
  lease_until: "2099-01-01T00:00:00Z",
  reply: "Ticket updated with refill details.",
  proposal: null,
  error_code: null,
  created_at: "2026-11-13T00:00:00Z",
  intent: "edit",
  questions: null,
  answers: null,
  ...overrides,
});
const json = (body: unknown) => new Response(JSON.stringify(body), { headers: { "Content-Type": "application/json" } });

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

describe("PM assistant turn outcomes", () => {
  afterEach(() => vi.restoreAllMocks());

  it("says when a reply suggests no ticket change", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => json({ turns: [turn({})], usage }));
    renderComponent(<Assistant />);
    await expect.element(page.getByText("Ticket updated with refill details.")).toBeVisible();
    await expect.element(page.getByText("No ticket changes suggested.", { exact: true })).toBeVisible();
  });

  it("does not add the note to a gaps check", async () => {
    const gaps = turn({ intent: "gaps", reply: "No material gaps." });
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => json({ turns: [gaps], usage }));
    renderComponent(<Assistant />);
    await expect.element(page.getByText("No material gaps.")).toBeVisible();
    await expect.element(page.getByText("No ticket changes suggested.", { exact: true })).not.toBeInTheDocument();
  });

  it("shows a plain pending status without inviting edits", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async (_input, init) =>
      init?.method === "POST" ? new Promise<Response>(() => {}) : json({ turns: [], usage }),
    );
    renderComponent(<Assistant />);
    await userEvent.fill(page.getByLabelText("Ask AI to change or explain this ticket"), "Shorter please");
    await userEvent.click(page.getByRole("button", { name: "Ask AI", exact: true }));
    await expect.element(page.getByRole("status").filter({ hasText: /^AI is responding…$/ })).toBeVisible();
  });
});
