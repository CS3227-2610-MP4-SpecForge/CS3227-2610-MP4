import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { expectAccessible, renderComponent } from "@/tests/render";
import { DatePicker } from "./date-picker";

function Harness({ initial, onChange }: { initial: string | null; onChange(value: string | null): void }) {
  const [value, setValue] = useState(initial);
  return (
    <DatePicker
      id="due"
      label="Due date"
      value={value}
      onChange={next => {
        setValue(next);
        onChange(next);
      }}
    />
  );
}

const trigger = () => page.getByRole("button", { name: /^Due date/ });
const calendar = () => page.getByRole("dialog", { name: "Due date calendar" });

async function enterExactDate(text: string) {
  await trigger().click();
  await calendar().getByLabelText("Exact date").fill(text);
  await calendar().getByRole("button", { name: "Apply date" }).click();
}

describe("DatePicker", () => {
  it("shows Unscheduled and applies a typed exact date", async () => {
    const onChange = vi.fn();
    await renderComponent(<Harness initial={null} onChange={onChange} />);
    await expect.element(page.getByRole("button", { name: "Due date Unscheduled" })).toBeVisible();
    await trigger().click();
    await expect.element(calendar()).toBeVisible();
    await expectAccessible();
    await calendar().getByLabelText("Exact date").fill("2026-12-24");
    await calendar().getByRole("button", { name: "Apply date" }).click();
    expect(onChange).toHaveBeenCalledExactlyOnceWith("2026-12-24");
    await expect.element(calendar()).not.toBeInTheDocument();
    await expect.element(page.getByRole("button", { name: "Due date 24 Dec 2026" })).toBeVisible();
    await expect.element(trigger()).toHaveFocus();
  });

  it("rejects an impossible date with an explanation and keeps the value", async () => {
    const onChange = vi.fn();
    await renderComponent(<Harness initial="2026-01-15" onChange={onChange} />);
    await enterExactDate("2026-02-30");
    await expect.element(calendar().getByRole("alert")).toMatchTextContent(/^Enter a valid date as YYYY-MM-DD/);
    await expect.element(calendar().getByLabelText("Exact date")).toHaveAttribute("aria-invalid", "true");
    expect(onChange).not.toHaveBeenCalled();
    await userEvent.keyboard("{Escape}");
    await expect.element(trigger()).toHaveTextContent("15 Jan 2026");
  });

  it("clears a scheduled date", async () => {
    const onChange = vi.fn();
    await renderComponent(<Harness initial="2026-01-15" onChange={onChange} />);
    await trigger().click();
    await calendar().getByRole("button", { name: "Clear date" }).click();
    expect(onChange).toHaveBeenCalledExactlyOnceWith(null);
    await expect.element(trigger()).toHaveTextContent("Unscheduled");
  });

  it("selects a calendar day as the same calendar date", async () => {
    const onChange = vi.fn();
    await renderComponent(<Harness initial="2026-03-28" onChange={onChange} />);
    await trigger().click();
    await calendar().getByRole("button", { name: "Tuesday, 31 March 2026" }).click();
    expect(onChange).toHaveBeenCalledExactlyOnceWith("2026-03-31");
  });

  it("accepts a typed year below 100 without remapping it to the 1900s", async () => {
    const onChange = vi.fn();
    await renderComponent(<Harness initial={null} onChange={onChange} />);
    await enterExactDate("0042-07-04");
    expect(onChange).toHaveBeenCalledExactlyOnceWith("0042-07-04");
  });
});
