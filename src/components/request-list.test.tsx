import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { expectAccessible, renderComponent } from "@/tests/render";
import { localDay } from "@/overview";
import { RequestList } from "./request-list";

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** An organisation with no visible tickets, seen by an account with `role`. */
function serveEmptyOrganisation(role: "PM" | "Developer") {
  vi.spyOn(globalThis, "fetch").mockImplementation(async input => {
    const url = String(input);
    if (url.startsWith("/api/organisations/org-1/requests")) return reply({ requests: [], nextOffset: null });
    if (url === "/api/account") return reply({ account: { id: "user-1", role } });
    if (url === "/api/organisations/org-1") return reply({ organisation: { name: "Acme Product" } });
    if (url.includes("/ticket-members")) return reply({ members: [], selected_members: [], next_cursor: null });
    return reply({ error: "Unexpected request in test." }, 500);
  });
}

describe("RequestList empty state", () => {
  afterEach(() => vi.restoreAllMocks());

  it("tells a PM how to start a ticket and that it stays private", async () => {
    serveEmptyOrganisation("PM");
    renderComponent(<RequestList organisationId="org-1" />);
    await expect
      .element(page.getByText("to draft one; it stays private until you publish.", { exact: false }))
      .toBeVisible();
    await expect.element(page.getByText("No tickets yet.", { exact: false })).toBeVisible();
    await expect.element(page.getByText("No published tickets yet.", { exact: false })).not.toBeInTheDocument();
    await expectAccessible();
  });

  it("tells a Developer that tickets appear once a PM publishes them", async () => {
    serveEmptyOrganisation("Developer");
    renderComponent(<RequestList organisationId="org-1" />);
    await expect
      .element(page.getByText("Tickets appear here when a Product Manager publishes them.", { exact: false }))
      .toBeVisible();
    await expect.element(page.getByText("No published tickets yet.", { exact: false })).toBeVisible();
    await expect.element(page.getByText("Select New task", { exact: false })).not.toBeInTheDocument();
    await expectAccessible();
  });
});

// URL filters (workflow/specs/2026-11-13-organisation-overview.md, criteria 5 and 6).
describe("RequestList URL filters", () => {
  const unrecognised = "Some filters in this link were not recognised, so defaults are shown instead.";
  const dev = "33333333-3333-4333-8333-333333333333";
  afterEach(() => vi.restoreAllMocks());

  function serve(selected: { user_id: string; username: string; app_role: string; email: string }[]) {
    const lists: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async input => {
      const url = String(input);
      if (url.startsWith("/api/organisations/org-1/requests")) {
        lists.push(url);
        return reply({ requests: [], nextOffset: null });
      }
      if (url === "/api/account") return reply({ account: { id: "user-1", role: "Developer" } });
      if (url === "/api/organisations/org-1") return reply({ organisation: { name: "Acme Product" } });
      if (url.includes("/ticket-members?selected="))
        return reply({ members: [], selected_members: selected, next_cursor: null });
      if (url.includes("/ticket-members")) return reply({ members: [], selected_members: [], next_cursor: null });
      return reply({ error: "Unexpected request in test." }, 500);
    });
    return lists;
  }

  it("starts from the link's filters, adds the viewer's day, and names a linked assignee", async () => {
    const lists = serve([{ user_id: dev, username: "dev_one", app_role: "Developer", email: "d@example.com" }]);
    renderComponent(<RequestList organisationId="org-1" initialSearch={{ status: "overdue", assignee: dev }} />);
    await expect.element(page.getByText("No tickets match these filters.")).toBeVisible();
    const first = new URL(lists[0], "http://x").searchParams;
    expect(first.get("status")).toBe("overdue");
    expect(first.get("assignee")).toBe(dev);
    expect(first.get("today")).toBe(localDay());
    await expect
      .element(page.getByRole("combobox", { name: "Status filter", exact: true }))
      .toHaveTextContent("Overdue");
    await expect
      .element(page.getByRole("combobox", { name: "Assignee filter", exact: true }))
      .toHaveTextContent("dev_one (Developer)");
    await expect
      .element(page.getByRole("link", { name: "Requests", exact: true }))
      .toHaveAttribute("aria-current", "page");
    await expectAccessible();
  });

  it("writes applied filters back to the address without the day", async () => {
    serve([]);
    const replace = vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
    renderComponent(<RequestList organisationId="org-1" initialSearch={{}} />);
    await expect.element(page.getByText("No published tickets yet.", { exact: false })).toBeVisible();
    await userEvent.click(page.getByRole("combobox", { name: "Status filter", exact: true }));
    await userEvent.click(page.getByRole("option", { name: "Due in the next 7 days" }));
    await userEvent.click(page.getByRole("button", { name: "Apply filters" }));
    await expect.poll(() => replace.mock.calls.at(-1)?.[2]).toBe("/organisations/org-1/requests?status=due_soon");
  });

  it("drops a non-member assignee without undoing filters applied in the meantime", async () => {
    let answer: (response: Response) => void = () => {};
    const lists: string[] = [];
    vi.spyOn(globalThis, "fetch").mockImplementation(async input => {
      const url = String(input);
      if (url.startsWith("/api/organisations/org-1/requests")) {
        lists.push(url);
        return reply({ requests: [], nextOffset: null });
      }
      if (url === "/api/account") return reply({ account: { id: "user-1", role: "Developer" } });
      if (url === "/api/organisations/org-1") return reply({ organisation: { name: "Acme Product" } });
      if (url.includes("/ticket-members?selected=")) return new Promise<Response>(resolve => (answer = resolve));
      return reply({ members: [], selected_members: [], next_cursor: null });
    });
    const replace = vi.spyOn(window.history, "replaceState").mockImplementation(() => {});
    renderComponent(<RequestList organisationId="org-1" initialSearch={{ assignee: dev }} />);
    await expect.element(page.getByText("No tickets match these filters.")).toBeVisible();
    await userEvent.click(page.getByRole("combobox", { name: "Status filter", exact: true }));
    await userEvent.click(page.getByRole("option", { name: "Open", exact: true }));
    await userEvent.click(page.getByRole("button", { name: "Apply filters" }));
    await expect.poll(() => lists.at(-1)).toContain("status=open");
    answer(reply({ members: [], selected_members: [], next_cursor: null }));
    await expect.poll(() => new URL(lists.at(-1)!, "http://x").search).toBe("?status=open");
    expect(replace.mock.calls.at(-1)?.[2]).toBe("/organisations/org-1/requests?status=open");
    await expect.element(page.getByText(unrecognised)).toBeVisible();
  });

  it("keeps a linked assignee usable, without inventing a role, when the lookup fails", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async input => {
      const url = String(input);
      if (url.startsWith("/api/organisations/org-1/requests")) return reply({ requests: [], nextOffset: null });
      if (url === "/api/account") return reply({ account: { id: "user-1", role: "Developer" } });
      if (url === "/api/organisations/org-1") return reply({ organisation: { name: "Acme Product" } });
      if (url.includes("/ticket-members?selected=")) return reply({ error: "Unavailable" }, 503);
      return reply({ members: [], selected_members: [], next_cursor: null });
    });
    renderComponent(<RequestList organisationId="org-1" initialSearch={{ assignee: dev }} />);
    await expect
      .element(page.getByRole("combobox", { name: "Assignee filter", exact: true }))
      .toHaveTextContent("Linked member");
  });

  it("falls back to defaults with a generic notice for unrecognised or foreign values", async () => {
    const lists = serve([]);
    renderComponent(
      <RequestList
        organisationId="org-1"
        initialSearch={{ status: "<script>late</script>", sort: "due", assignee: dev, extra: "x" }}
      />,
    );
    await expect.element(page.getByText(unrecognised)).toBeVisible();
    await expect.element(page.getByText("<script>", { exact: false })).not.toBeInTheDocument();
    // The sort survives; the unknown member is dropped once the lookup finds no such member.
    await expect
      .element(page.getByRole("combobox", { name: "Assignee filter", exact: true }))
      .toHaveTextContent("Anyone");
    await expect.poll(() => new URL(lists.at(-1)!, "http://x").search).toBe("?sort=due");
  });
});
