import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import type { TicketRead } from "@/requests";
import { expectAccessible, renderComponent } from "@/tests/render";
import { api, failureMessage } from "./http";
import { useNotifications, useNotificationState } from "./notifications";
import { RequestScreen } from "./request-editor";

const ticketPath = "/api/organisations/org-1/requests/ticket-1";
const ticket: TicketRead = {
  id: "ticket-1", organisation_id: "org-1", author_id: "pm-1", revision: 1,
  fields: { title: "Saved title", description: "Saved idea" },
  submitted_at: null, created_at: "2026-11-12T00:00:00Z", updated_at: "2026-11-12T00:00:00Z", last_autosaved_at: null,
  ticket_number: 1, delivery_revision: 1, due_date: null, priority: "medium", status: "to_do", assignee_ids: [],
  author_username: "pm", assignee_usernames: [],
};
const expired = "Your session has ended. Sign in again to continue.";

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Serve the ticket screen's reads; every save answers with `saveStatus`. */
function serveTicket(saveStatus: number, saveError: string) {
  const saves: unknown[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = String(input);
    if (init?.method === "POST" && url === ticketPath) { saves.push(init.body); return reply({ error: saveError }, saveStatus); }
    if (url === ticketPath) return reply({ request: ticket });
    if (url === "/api/account") return reply({ account: { id: "pm-1", role: "PM" } });
    if (url === "/api/organisations/org-1") return reply({ organisation: { name: "Requirements team" } });
    if (url.endsWith("/chat")) return reply({ turns: [], usage: null });
    if (url.includes("/ticket-members")) return reply({ members: [], selected_members: [], next_cursor: null });
    return reply({ error: "Unexpected request in test." }, 500);
  });
  return saves;
}

async function typeUnsavedIdea() {
  const description = page.getByLabelText("Description", { exact: true });
  await expect.element(description).toHaveValue("Saved idea");
  await userEvent.clear(description);
  await userEvent.type(description, "Unsaved idea");
  return description;
}

// The runner's page is "/", a public page; tests run on the ticket's own path.
beforeEach(() => { history.replaceState(null, "", "/organisations/org-1/requests/ticket-1"); });
afterEach(() => { vi.restoreAllMocks(); history.replaceState(null, "", "/"); });

describe("session expiry", () => {
  it("shows one persistent sign-in banner on a 401 and keeps the editor's unsaved text", async () => {
    const saves = serveTicket(401, "Sign in to continue.");
    await renderComponent(<RequestScreen organisationId="org-1" requestId="ticket-1" />);
    const description = await typeUnsavedIdea();

    await expect.element(page.getByText(expired)).toBeVisible();
    const link = page.getByRole("link", { name: "Sign in again" });
    await expect.element(link).toHaveAttribute("href", "/sign-in");
    await expect.element(description).toHaveValue("Unsaved idea");

    // Autosave stops after the 401; an explicit retry that fails again still shows one banner.
    await page.getByRole("button", { name: "Retry draft save" }).click();
    await vi.waitFor(() => expect(saves).toHaveLength(2));
    await new Promise(resolve => setTimeout(resolve, 1000));
    expect(saves).toHaveLength(2);
    expect(page.getByText(expired).elements()).toHaveLength(1);
    expect(document.querySelectorAll(".notification-banner")).toHaveLength(0);
    await expect.element(description).toHaveValue("Unsaved idea");
    await expectAccessible();
  });

  it("keeps a 403 in place without the session banner", async () => {
    serveTicket(403, "You no longer have permission to edit this request.");
    await renderComponent(<RequestScreen organisationId="org-1" requestId="ticket-1" />);
    const description = await typeUnsavedIdea();

    await expect.element(page.getByText("You no longer have permission to edit this request.", { exact: true }).first()).toBeVisible();
    await expect.element(page.getByRole("button", { name: "Reload saved version and discard edits" })).toBeVisible();
    expect(page.getByText(expired).elements()).toHaveLength(0);
    await expect.element(description).toHaveValue("Unsaved idea");
  });

  it("treats rejected sign-in credentials as a form error, not an ended session", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(reply({ error: "Email or password is incorrect, or email is not verified." }, 401));
    await renderComponent(<p>Sign in page</p>);
    await expect(api("/api/auth/signin", { email: "a@example.test", password: "x" })).rejects.toThrow("Email or password is incorrect");
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(page.getByText(expired).elements()).toHaveLength(0);
  });

  it("ignores the signed-out account check on public pages", async () => {
    history.replaceState(null, "", "/sign-in");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(reply({ error: "Sign in to continue." }, 401));
    await renderComponent(<p>Sign in page</p>);
    await expect(api("/api/account")).rejects.toThrow(expired);
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(page.getByText(expired).elements()).toHaveLength(0);
  });

  it("hides the banner after a client redirect to sign-in", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => reply({ error: "Sign in to continue." }, 401));
    await renderComponent(<p>Workspace</p>);
    await expect(api("/api/account")).rejects.toThrow(expired);
    await expect.element(page.getByText(expired)).toBeVisible();
    // The workspace redirects with router.replace; the account menu then checks again.
    history.replaceState(null, "", "/sign-in");
    await expect(api("/api/account")).rejects.toThrow(expired);
    await expect.element(page.getByText(expired)).not.toBeInTheDocument();
  });

  it("leaves an ended session to the banner without a covering toast, while other toasts still show", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(reply({ error: "Sign in to continue." }, 401));
    function Loader() {
      const [error, setError] = useNotificationState(true);
      const { notify } = useNotifications();
      return <>
        <button onClick={() => api("/api/account").catch(failure => setError(failureMessage(failure)))}>Load</button>
        <button onClick={() => notify("2 changes could not be applied.", true)}>Apply</button>
        {error && <p data-testid="inline">{error}</p>}
      </>;
    }
    await renderComponent(<Loader />);
    const toasts = () => [...document.querySelectorAll(".notification-banner")].map(toast => toast.textContent);

    await page.getByRole("button", { name: "Load" }).click();
    await expect.element(page.getByText(expired, { exact: true }).first()).toBeVisible();
    await expect.element(page.getByTestId("inline")).toHaveTextContent(expired);
    await new Promise(resolve => setTimeout(resolve, 100));
    expect(toasts()).toEqual([]);
    expect(page.getByText("Sign in to continue.", { exact: true }).elements()).toHaveLength(0);

    // A warning the banner does not explain still appears while the session has ended.
    await page.getByRole("button", { name: "Apply" }).click();
    await vi.waitFor(() => expect(toasts()).toEqual(["2 changes could not be applied."]));
    await expect.element(page.getByRole("link", { name: "Sign in again" })).toBeVisible();
  });

  it("clears the banner once an API call succeeds again", async () => {
    const transport = vi.spyOn(globalThis, "fetch").mockResolvedValue(reply({ error: "Sign in to continue." }, 401));
    await renderComponent(<p>Workspace</p>);
    await expect(api("/api/account")).rejects.toThrow(expired);
    await expect.element(page.getByText(expired)).toBeVisible();
    transport.mockResolvedValue(reply({ account: { id: "pm-1" } }));
    await api("/api/account");
    await expect.element(page.getByText(expired)).not.toBeInTheDocument();
  });
});
