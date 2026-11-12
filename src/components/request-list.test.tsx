import { afterEach, describe, expect, it, vi } from "vitest";
import { page } from "vitest/browser";
import { expectAccessible, renderComponent } from "@/tests/render";
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
