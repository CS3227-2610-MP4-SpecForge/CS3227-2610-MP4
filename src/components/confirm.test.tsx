import { describe, expect, it } from "vitest";
import { page, userEvent } from "vitest/browser";
import { expectAccessible, renderComponent } from "@/tests/render";
import { useConfirm, type ConfirmOptions } from "./confirm";

const results: boolean[] = [];

function Asker({ options }: { options: ConfirmOptions[] }) {
  const confirm = useConfirm();
  return (
    <button
      onClick={() => {
        for (const option of options) void confirm(option).then(result => results.push(result));
      }}
    >
      Ask
    </button>
  );
}

const cancelInvitation: ConfirmOptions = {
  title: "Cancel invitation?",
  message: "someone@example.com will no longer be able to join.",
  confirmLabel: "Cancel invitation",
  cancelLabel: "Keep invitation",
  danger: true,
};

async function ask(...options: ConfirmOptions[]) {
  results.length = 0;
  await renderComponent(<Asker options={options} />);
  await page.getByRole("button", { name: "Ask" }).click();
}

describe("useConfirm", () => {
  it("shows a labelled dialog with the message, named buttons and the cancel button focused", async () => {
    await ask(cancelInvitation);
    const dialog = page.getByRole("dialog", { name: "Cancel invitation?" });
    await expect.element(dialog).toBeVisible();
    await expect.element(dialog.getByRole("heading", { name: "Cancel invitation?" })).toBeVisible();
    await expect.element(dialog.getByText("someone@example.com will no longer be able to join.")).toBeVisible();
    await expect.element(dialog.getByRole("button", { name: "Keep invitation" })).toHaveFocus();
    await expect.element(dialog.getByRole("button", { name: "Cancel invitation" })).toHaveClass(/danger/);
    await expectAccessible();
  });

  it("sizes the dialog to its content instead of the viewport height", async () => {
    await ask(cancelInvitation);
    const dialog = page.getByRole("dialog", { name: "Cancel invitation?" });
    await expect.element(dialog).toBeVisible();
    expect(dialog.element().getBoundingClientRect().height).toBeLessThan(window.innerHeight / 2);
  });

  it("resolves true when confirmed and closes", async () => {
    await ask(cancelInvitation);
    await page.getByRole("button", { name: "Cancel invitation" }).click();
    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
    expect(results).toEqual([true]);
  });

  it("resolves false from the cancel button, the close button and Escape", async () => {
    await ask({ title: "Discard edits?", confirmLabel: "Discard" });
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();

    await page.getByRole("button", { name: "Ask" }).click();
    await page.getByRole("button", { name: "Close confirmation" }).click();
    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();

    await page.getByRole("button", { name: "Ask" }).click();
    await expect.element(page.getByRole("dialog")).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
    await expect.poll(() => results).toEqual([false, false, false]);
  });

  it("returns focus to the control that asked once the dialog closes", async () => {
    await ask(cancelInvitation);
    await page.getByRole("button", { name: "Keep invitation" }).click();
    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
    await expect.element(page.getByRole("button", { name: "Ask" })).toHaveFocus();
  });

  it("uses the brand button when the action is not destructive", async () => {
    await ask({ title: "Start again?", confirmLabel: "Start again" });
    await expect.element(page.getByRole("button", { name: "Start again" })).not.toHaveClass(/danger/);
  });

  it("asks queued confirmations one at a time in order", async () => {
    await ask({ title: "First?", confirmLabel: "Yes first" }, { title: "Second?", confirmLabel: "Yes second" });
    await expect.element(page.getByRole("dialog", { name: "First?" })).toBeVisible();
    await page.getByRole("button", { name: "Yes first" }).click();
    await expect.element(page.getByRole("dialog", { name: "Second?" })).toBeVisible();
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await expect.element(page.getByRole("dialog")).not.toBeInTheDocument();
    expect(results).toEqual([true, false]);
  });
});
