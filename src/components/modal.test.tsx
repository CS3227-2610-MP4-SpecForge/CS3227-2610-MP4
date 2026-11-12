import { describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { expectAccessible, renderComponent } from "@/tests/render";
import { Modal } from "./modal";

function renderModal(onClose = vi.fn()) {
  return renderComponent(
    <Modal label="Edit ticket" closeLabel="Close editor" onClose={onClose} footer={<button>Save</button>}>
      <p>Ticket body</p>
    </Modal>,
  );
}

describe("Modal", () => {
  it("opens as a labelled modal dialog with its content focused", async () => {
    await renderModal();
    const dialog = page.getByRole("dialog", { name: "Edit ticket" });
    await expect.element(dialog).toBeVisible();
    expect((dialog.element() as HTMLDialogElement).matches(":modal")).toBe(true);
    await expect.element(page.getByRole("region", { name: "Edit ticket content" })).toHaveFocus();
    await expectAccessible();
  });

  it("closes the dialog and reports it when Escape is pressed", async () => {
    const onClose = vi.fn();
    await renderModal(onClose);
    await userEvent.keyboard("{Escape}");
    await expect.element(page.getByRole("dialog", { name: "Edit ticket" })).not.toBeInTheDocument();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("asks the caller to close from the labelled close button", async () => {
    const onClose = vi.fn();
    await renderModal(onClose);
    await page.getByRole("button", { name: "Close editor" }).click();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("locks page scrolling while open and restores it on unmount", async () => {
    document.body.style.overflow = "auto";
    const view = await renderModal();
    expect(document.body.style.overflow).toBe("hidden");
    await view.unmount();
    expect(document.body.style.overflow).toBe("auto");
  });
});
