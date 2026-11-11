import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import type { ChatTurn } from "@/chat";
import type { RequestFields } from "@/requests";
import { expectAccessible, renderComponent } from "@/tests/render";
import { ChangeReview } from "./change-review";

const before: RequestFields = { title: "Tutorial text", description: "## Summary\n\nOld intro.\n\n## Notes\n\nKeep this." };
const after: RequestFields = { title: "Remove multi-enchantment from tutorials", description: "## Summary\n\nNew intro.\n\n## Notes\n\nKeep this.\n\n- Level 7" };

function turn(input: RequestFields, proposal: RequestFields): ChatTurn {
  return {
    id: "turn-1", turn_key: "key-1", base_revision: 1, input_fields: input, message: "Tighten it", status: "completed",
    generation: 1, lease_until: "2026-11-12T00:00:00Z", reply: "Done", proposal, error_code: null,
    created_at: "2026-11-12T00:00:00Z", intent: "edit" as ChatTurn["intent"], questions: null, answers: null,
  };
}

function Harness({ input = before, proposal = after, fields: initial = input, blockedReason = null, onChange, onReject }: {
  input?: RequestFields; proposal?: RequestFields; fields?: RequestFields; blockedReason?: string | null;
  onChange(next: RequestFields): void; onReject(ids: string[]): void;
}) {
  const [fields, setFields] = useState(initial);
  const [rejected, setRejected] = useState<ReadonlySet<string>>(new Set());
  return <ChangeReview turn={turn(input, proposal)} fields={fields} rejected={rejected} blockedReason={blockedReason} onClose={() => {}}
    onChange={next => { setFields(next); onChange(next); }}
    onReject={ids => { setRejected(current => new Set([...current, ...ids])); onReject(ids); }} />;
}

const change = (n: number, field: string) => page.getByRole("region", { name: `Change ${n} of 3: ${field}` });
const status = () => page.getByRole("dialog", { name: "Review AI changes" }).getByRole("status");

describe("ChangeReview", () => {
  it("lists each proposed change with an accessible label and summary", async () => {
    await renderComponent(<Harness onChange={vi.fn()} onReject={vi.fn()} />);
    await expect.element(page.getByText("3 changes: title and 2 in Description")).toBeVisible();
    await expect.element(change(1, "Title")).toBeVisible();
    await expect.element(change(2, "Description")).toBeVisible();
    await expect.element(change(3, "Description")).toBeVisible();
    await expect.element(status()).toHaveTextContent("0 applied, 0 rejected");
    await expectAccessible();
  });

  it("accepts one change, moves focus to the next open change, and undoes it", async () => {
    const onChange = vi.fn();
    await renderComponent(<Harness onChange={onChange} onReject={vi.fn()} />);
    await change(1, "Title").getByRole("button", { name: "Accept" }).click();
    expect(onChange).toHaveBeenLastCalledWith({ ...before, title: after.title });
    await expect.element(change(1, "Title")).toMatchTextContent(/Applied/);
    await expect.element(change(2, "Description").getByRole("button", { name: "Accept" })).toHaveFocus();
    await change(1, "Title").getByRole("button", { name: "Undo" }).click();
    expect(onChange).toHaveBeenLastCalledWith(before);
    await expect.element(change(1, "Title").getByRole("button", { name: "Accept" })).toHaveFocus();
  });

  it("rejects one change and reports its id", async () => {
    const onReject = vi.fn();
    await renderComponent(<Harness onChange={vi.fn()} onReject={onReject} />);
    await change(2, "Description").getByRole("button", { name: "Reject" }).click();
    expect(onReject).toHaveBeenCalledExactlyOnceWith([expect.any(String)]);
    await expect.element(change(2, "Description")).toMatchTextContent(/Rejected/);
    await expect.element(status()).toHaveTextContent("0 applied, 1 rejected");
  });

  it("accepts all open changes into the proposed fields", async () => {
    const onChange = vi.fn();
    await renderComponent(<Harness onChange={onChange} onReject={vi.fn()} />);
    await page.getByRole("button", { name: "Accept all" }).click();
    expect(onChange).toHaveBeenLastCalledWith(after);
    await expect.element(status()).toHaveTextContent("3 applied, 0 rejected");
    await expect.element(page.getByRole("button", { name: "Accept all" })).toBeDisabled();
    await expect.element(page.getByRole("button", { name: "Done" })).toHaveFocus();
  });

  it("accepts all changes into the proposal when lines repeat", async () => {
    const input = { title: "Keep", description: "Keep\nOld\nKeep" };
    const proposal = { title: "Keep", description: "Keep\nKeep\nKeep" };
    const onChange = vi.fn();
    await renderComponent(<Harness input={input} proposal={proposal} onChange={onChange} onReject={vi.fn()} />);
    await page.getByRole("button", { name: "Accept all" }).click();
    expect(onChange).toHaveBeenCalledExactlyOnceWith(proposal);
    await expect.element(status()).toHaveTextContent("2 applied, 0 rejected");
    await expect.element(page.getByText(/could not be applied/)).not.toBeInTheDocument();
    for (const at of [1, 2]) {
      await expect.element(page.getByRole("region", { name: `Change ${at} of 2: Description` }).getByRole("button", { name: "Undo" })).toBeVisible();
    }
  });

  it("reports a change Accept all skips because an earlier change overlapped it", async () => {
    // After the user's edit both changes still match once, but the second
    // one's context is the line the first one replaces.
    const input = { title: "T", description: "a\nb\nc\nb\nc\nd" };
    const proposal = { title: "T", description: "a\nB1\nc\nb\nC1\nd" };
    const onChange = vi.fn();
    await renderComponent(<Harness input={input} proposal={proposal} fields={{ title: "T", description: "a\nb\nc\nd" }} onChange={onChange} onReject={vi.fn()} />);
    await page.getByRole("button", { name: "Accept all" }).click();
    await expect.element(page.getByText("1 change could not be applied because an earlier change overlapped it.")).toBeVisible();
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ title: "T", description: "a\nB1\nc\nd" });
  });

  it("rejects all open changes at once", async () => {
    const onReject = vi.fn();
    await renderComponent(<Harness onChange={vi.fn()} onReject={onReject} />);
    await page.getByRole("button", { name: "Reject all" }).click();
    expect(onReject).toHaveBeenCalledOnce();
    expect(new Set(onReject.mock.calls[0][0]).size).toBe(3);
    await expect.element(status()).toHaveTextContent("0 applied, 3 rejected");
  });

  it("marks a change outdated when the ticket changed that part since", async () => {
    const edited = { ...before, description: before.description.replace("Old intro.", "My own intro.") };
    await renderComponent(<Harness fields={edited} onChange={vi.fn()} onReject={vi.fn()} />);
    await expect.element(change(2, "Description")).toMatchTextContent(/You've changed this part since/);
    await expect.element(change(2, "Description").getByRole("button", { name: "Accept" })).not.toBeInTheDocument();
  });

  it("disables accepting while blocked and explains why", async () => {
    await renderComponent(<Harness blockedReason="Wait for the AI request to finish." onChange={vi.fn()} onReject={vi.fn()} />);
    await expect.element(page.getByText("Wait for the AI request to finish.")).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Accept all" })).toBeDisabled();
    await expect.element(change(1, "Title").getByRole("button", { name: "Accept" })).toBeDisabled();
    await expect.element(change(1, "Title").getByRole("button", { name: "Reject" })).toBeEnabled();
  });
});
