import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { expectAccessible, renderComponent } from "@/tests/render";
import { DemoKit } from "./demo-kit";

function reply(body: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json", ...headers } });
}
const kit = {
  kit: {
    accounts: [
      {
        role: "PM",
        email: "demo-pm-x@example.com",
        username: "demo_pm_x",
        password: "pm-password-0123456789abcdefghij",
      },
      {
        role: "Developer",
        email: "demo-dev-x@example.com",
        username: "demo_dev_x",
        password: "dev-password-0123456789abcdefghi",
      },
    ],
  },
};
const limited = (limit: "burst" | "daily", retryAfter: number) =>
  reply({ error: "Demo kit limit reached.", limit, retryAfter }, 429, { "Retry-After": String(retryAfter) });
const create = () => userEvent.click(page.getByRole("button", { name: "Create demo kit", exact: true }));

describe("DemoKit", () => {
  afterEach(() => vi.restoreAllMocks());

  it("shows both logins once, with copy buttons, and clears them when the page is left", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => reply(kit, 201));
    const writeText = vi.spyOn(navigator.clipboard, "writeText").mockResolvedValue();
    renderComponent(<DemoKit />);
    await create();
    await expect.element(page.getByText("demo-pm-x@example.com")).toBeVisible();
    await expect.element(page.getByText("dev-password-0123456789abcdefghi")).toBeVisible();
    await expect.element(page.getByText(/shown only once/)).toBeVisible();
    await expectAccessible();
    await userEvent.click(page.getByRole("button", { name: "Copy Product Manager password" }));
    expect(writeText).toHaveBeenCalledWith("pm-password-0123456789abcdefghij");
    window.dispatchEvent(new PageTransitionEvent("pagehide"));
    await expect.element(page.getByText("demo-pm-x@example.com")).not.toBeInTheDocument();
  });

  it("explains the 10-minute limit as deliberate, rounding up to whole minutes", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => limited("burst", 61));
    renderComponent(<DemoKit />);
    await create();
    const notice = page.getByRole("status").filter({ hasText: "5 every 10 minutes" });
    await expect
      .element(notice)
      .toHaveTextContent(
        "Demo kits are limited to 5 every 10 minutes to protect the service. Try again in 2 minutes, or create an account with your own email.",
      );
    await expect.element(page.getByRole("link", { name: "create an account" })).toHaveAttribute("href", "/sign-up");
    await expect.element(page.getByRole("alert")).not.toBeInTheDocument();
    await expectAccessible();
  });

  it("explains the daily limit with whole hours, never zero", async () => {
    const fetch = vi.spyOn(globalThis, "fetch").mockImplementation(async () => limited("daily", 3 * 3600 + 5));
    renderComponent(<DemoKit />);
    await create();
    await expect
      .element(page.getByRole("status").filter({ hasText: "Today's 30 demo kits" }))
      .toHaveTextContent(
        "Today's 30 demo kits have all been used. New kits are available from midnight Singapore time (in about 4 hours). You can still create an account with your own email.",
      );
    const notice = () => document.querySelector(".demo-kit .notice")?.textContent;
    fetch.mockImplementation(async () => limited("daily", 1));
    await create();
    await expect.poll(notice).toMatch(/\(in about 1 hour\)\./);
    fetch.mockImplementation(async () => limited("burst", 1));
    await create();
    await expect.poll(notice).toMatch(/Try again in 1 minute, or/);
  });

  it("shows a disabled pending button while the kit is created", async () => {
    let finish: (response: Response) => void = () => {};
    vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise(resolve => (finish = resolve)));
    renderComponent(<DemoKit />);
    await create();
    await expect.element(page.getByRole("button", { name: "Creating demo kit…" })).toBeDisabled();
    finish(reply(kit, 201));
    await expect.element(page.getByRole("button", { name: "Create demo kit", exact: true })).toBeEnabled();
    await expect.element(page.getByText("demo-pm-x@example.com")).toBeVisible();
  });

  it("ignores a reply that arrives after the page was left", async () => {
    let finish: (response: Response) => void = () => {};
    vi.spyOn(globalThis, "fetch").mockImplementation(() => new Promise(resolve => (finish = resolve)));
    renderComponent(<DemoKit />);
    await create();
    window.dispatchEvent(new PageTransitionEvent("pagehide"));
    finish(reply(kit, 201));
    await expect.element(page.getByRole("button", { name: "Create demo kit", exact: true })).toBeEnabled();
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(document.body.textContent).not.toContain("demo-pm-x@example.com");
  });

  it("keeps an outage separate from a limit", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () =>
      reply({ error: "Demo kit service is temporarily unavailable. Try again." }, 503),
    );
    renderComponent(<DemoKit />);
    await create();
    await expect
      .element(page.getByRole("alert").filter({ hasText: "temporarily unavailable" }))
      .toHaveTextContent("Demo kit service is temporarily unavailable. Try again.");
    await expect.element(page.getByText(/limited to 5/)).not.toBeInTheDocument();
    await expect.element(page.getByRole("button", { name: "Create demo kit" })).toBeEnabled();
  });
});
