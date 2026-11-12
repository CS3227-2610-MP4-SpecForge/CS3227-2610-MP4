import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { expectAccessible, renderComponent } from "@/tests/render";
import { Dropdown, type DropdownOption } from "./dropdown";

type Status = "draft" | "ready" | "doing" | "done";
const options: DropdownOption<Status>[] = [
  { value: "draft", label: "Draft" },
  { value: "ready", label: "Ready" },
  { value: "doing", label: "Doing" },
  { value: "done", label: "Done", tone: "green" },
];

function Harness({ onChange, disabled = false }: { onChange(value: Status): void; disabled?: boolean }) {
  const [value, setValue] = useState<Status>("ready");
  return (
    <>
      <Dropdown
        id="status"
        label="Status"
        value={value}
        options={options}
        disabled={disabled}
        onChange={next => {
          setValue(next);
          onChange(next);
        }}
      />
      <p style={{ marginTop: 400 }}>Outside</p>
    </>
  );
}

const trigger = () => page.getByRole("combobox", { name: "Status" });
const listbox = () => page.getByRole("listbox", { name: "Status options" });

describe("Dropdown", () => {
  it("shows the current value and selects another option with the mouse", async () => {
    const onChange = vi.fn();
    await renderComponent(<Harness onChange={onChange} />);
    await expect.element(trigger()).toHaveTextContent("Ready");
    await trigger().click();
    await expect.element(listbox()).toBeVisible();
    await expect.element(listbox().getByRole("option", { name: "Ready" })).toHaveAttribute("aria-selected", "true");
    await expectAccessible();
    await listbox().getByRole("option", { name: "Doing" }).click();
    expect(onChange).toHaveBeenCalledExactlyOnceWith("doing");
    await expect.element(listbox()).not.toBeInTheDocument();
    await expect.element(trigger()).toHaveTextContent("Doing");
    await expect.element(trigger()).toHaveFocus();
  });

  it("opens, moves and selects with the keyboard", async () => {
    const onChange = vi.fn();
    await renderComponent(<Harness onChange={onChange} />);
    await trigger().element().focus();
    await userEvent.keyboard("{ArrowDown}");
    await expect.element(trigger()).toHaveAttribute("aria-expanded", "true");
    await expect.element(trigger()).toHaveAttribute("aria-activedescendant", "status-option-1");
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{Enter}");
    expect(onChange).toHaveBeenCalledExactlyOnceWith("done");
    await userEvent.keyboard("{Home}{Enter}");
    expect(onChange).toHaveBeenLastCalledWith("draft");
  });

  it("jumps to an option by typing its first letters", async () => {
    const onChange = vi.fn();
    await renderComponent(<Harness onChange={onChange} />);
    await trigger().element().focus();
    await userEvent.keyboard("do");
    await expect.element(trigger()).toHaveAttribute("aria-activedescendant", "status-option-2");
    await userEvent.keyboard("{Enter}");
    expect(onChange).toHaveBeenCalledExactlyOnceWith("doing");
  });

  it("closes without choosing on Escape and on an outside pointer", async () => {
    const onChange = vi.fn();
    await renderComponent(<Harness onChange={onChange} />);
    await trigger().click();
    await userEvent.keyboard("{Escape}");
    await expect.element(listbox()).not.toBeInTheDocument();
    await expect.element(trigger()).toHaveFocus();
    await trigger().click();
    await page.getByText("Outside").click();
    await expect.element(listbox()).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("does not open or change when disabled", async () => {
    const onChange = vi.fn();
    await renderComponent(<Harness onChange={onChange} disabled />);
    await expect.element(trigger()).toBeDisabled();
    await trigger().click({ force: true });
    await expect.element(listbox()).not.toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });
});
