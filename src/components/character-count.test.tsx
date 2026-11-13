import { describe, expect, it } from "vitest";
import { page } from "vitest/browser";
import { renderComponent } from "@/tests/render";
import { CharacterCount, Field, TextareaField } from "./ui";

// Ticket field limits shown inside the input (workflow/specs/2026-11-13-ticket-character-count.md).
describe("character count", () => {
  it("shows the count against the limit and describes the input with it", async () => {
    renderComponent(<Field id="title" label="Title" limit={160} value="Hello" onChange={() => {}} />);
    await expect.element(page.getByText(/^5 \/ 160/)).toBeVisible();
    await expect.element(page.getByLabelText("Title")).toHaveAccessibleDescription("5 / 160 characters");
  });

  it("keeps a caller's own description alongside the count", async () => {
    renderComponent(
      <>
        <p id="extra">Extra help</p>
        <Field id="title" label="Title" limit={160} value="Hi" aria-describedby="extra" onChange={() => {}} />
      </>,
    );
    await expect.element(page.getByLabelText("Title")).toHaveAccessibleDescription("2 / 160 characters Extra help");
  });

  it("shows the count inside a text area too", async () => {
    renderComponent(<TextareaField id="ask" label="Ask" limit={4000} value="Shorter" onChange={() => {}} />);
    await expect.element(page.getByText(/^7 \/ 4,000/)).toBeVisible();
    await expect.element(page.getByLabelText("Ask")).toHaveAccessibleDescription("7 / 4,000 characters");
  });

  it("counts an emoji as one character and groups large numbers", async () => {
    renderComponent(<CharacterCount id="count" value={"😀".repeat(3)} limit={24000} />);
    await expect.element(page.getByText(/^3 \/ 24,000/)).toBeVisible();
  });

  it("marks a count over the limit", async () => {
    renderComponent(<CharacterCount id="count" value={"x".repeat(161)} limit={160} />);
    await expect.element(page.getByText(/^161 \/ 160/)).toHaveClass(/over-limit/);
  });
});
