import { afterEach, describe, expect, it, vi } from "vitest";
import { page, userEvent } from "vitest/browser";
import { expectAccessible, renderComponent } from "@/tests/render";
import { localDay } from "@/overview";
import { OrganisationOverviewPage } from "./organisation-overview";

// Organisation overview (workflow/specs/2026-11-13-organisation-overview.md, criteria 1, 5 and 7).
const org = "22222222-2222-4222-8222-222222222222";
const dev = "33333333-3333-4333-8333-333333333333";
const requests = `/organisations/${org}/requests`;
const overview = {
  totals: { to_do: 2, in_progress: 1, in_review: 0, done: 1, cancelled: 0, overdue: 1, due_soon: 2 },
  mine: { open: 2, overdue: 0, drafts: 3 },
  workload: {
    members: [{ user_id: dev, username: "dev_one", app_role: "Developer", open: 2, overdue: 1, high: 0 }],
    member_total: 1,
    unassigned: { open: 1, overdue: 0, high: 1 },
  },
};

function reply(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}
function serve(read: () => Response) {
  const urls: string[] = [];
  vi.spyOn(globalThis, "fetch").mockImplementation(async input => {
    const url = String(input);
    urls.push(url);
    if (url.endsWith(`/api/organisations/${org}`)) return reply({ organisation: { id: org, name: "Acme" } });
    return read();
  });
  return urls;
}
const link = (name: string) => page.getByRole("link", { name, exact: true });

describe("organisation overview", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    history.replaceState(null, "", "/");
  });

  it("links every nonzero count to the matching Requests filters", async () => {
    const urls = serve(() => reply({ overview }));
    renderComponent(<OrganisationOverviewPage organisationId={org} />);
    await expect.element(page.getByRole("heading", { name: "Overview", level: 1 })).toBeVisible();
    expect(urls).toContain(`/api/organisations/${org}/overview?day=${localDay()}`);

    await expect.element(link("2 open")).toHaveAttribute("href", `${requests}?status=open&assignee=me`);
    await expect.element(page.getByText("0 overdue", { exact: true })).toBeVisible();
    await expect.element(link("0 overdue")).not.toBeInTheDocument();
    await expect.element(link("3 private drafts")).toHaveAttribute("href", `${requests}?status=draft`);

    await expect.element(link("2 To do")).toHaveAttribute("href", `${requests}?status=to_do`);
    await expect.element(link("1 Overdue")).toHaveAttribute("href", `${requests}?status=overdue`);
    await expect.element(link("2 Due in the next 7 days")).toHaveAttribute("href", `${requests}?status=due_soon`);
    await expect.element(link("0 In review")).not.toBeInTheDocument();

    await expect.element(link("dev_one: 2 open")).toHaveAttribute("href", `${requests}?status=open&assignee=${dev}`);
    await expect
      .element(link("dev_one: 1 overdue"))
      .toHaveAttribute("href", `${requests}?status=overdue&assignee=${dev}`);
    await expect
      .element(link("Unassigned: 1 high priority"))
      .toHaveAttribute("href", `${requests}?status=open&priority=high&assignee=unassigned`);
    await expect.element(page.getByRole("link", { name: "Requests", exact: true })).toHaveAttribute("href", requests);
    await expect
      .element(page.getByRole("link", { name: "Overview", exact: true }))
      .toHaveAttribute("aria-current", "page");
    await expectAccessible();
  });

  it("omits the draft line for Developers and notes a capped workload table", async () => {
    const mine = { open: overview.mine.open, overdue: overview.mine.overdue };
    serve(() => reply({ overview: { ...overview, mine, workload: { ...overview.workload, member_total: 120 } } }));
    renderComponent(<OrganisationOverviewPage organisationId={org} />);
    await expect.element(page.getByText("Showing 1 of 120 members.")).toBeVisible();
    await expect.element(page.getByText("private drafts", { exact: false })).not.toBeInTheDocument();
  });

  it("explains an organisation with no published tickets, pointing PMs to New task", async () => {
    const zero = { open: 0, overdue: 0, high: 0 };
    const empty = (mine: Record<string, number>) => () =>
      reply({
        overview: {
          totals: { to_do: 0, in_progress: 0, in_review: 0, done: 0, cancelled: 0, overdue: 0, due_soon: 0 },
          mine,
          workload: { members: [], member_total: 0, unassigned: zero },
        },
      });
    serve(empty({ open: 0, overdue: 0 }));
    const developer = await renderComponent(<OrganisationOverviewPage organisationId={org} />);
    await expect.element(page.getByText("No published tickets yet.", { exact: false })).toBeVisible();
    await expect.element(page.getByText("New task", { exact: false })).not.toBeInTheDocument();
    await developer.unmount();

    vi.restoreAllMocks();
    serve(empty({ open: 0, overdue: 0, drafts: 0 }));
    renderComponent(<OrganisationOverviewPage organisationId={org} />);
    await expect.element(page.getByText("Select New task on Requests to draft one", { exact: false })).toBeVisible();
    await expect
      .element(page.getByRole("link", { name: "Requests", exact: true }).last())
      .toHaveAttribute("href", requests);
  });

  it("reports a lost membership even when the organisation name answers first", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(async input => {
      if (String(input).endsWith(`/api/organisations/${org}`)) return reply({ error: "Not found." }, 404);
      await new Promise(resolve => setTimeout(resolve, 50));
      return reply({ error: "You no longer have permission to view this organisation." }, 403);
    });
    renderComponent(<OrganisationOverviewPage organisationId={org} />);
    await expect
      .element(page.getByText("You no longer have permission to view this organisation.").first())
      .toBeVisible();
    await expect.element(page.getByText("Not found.")).not.toBeInTheDocument();
  });

  it("leaves an ended session to the session banner", async () => {
    // The banner stays hidden on public pages such as the runner's "/".
    history.replaceState(null, "", `/organisations/${org}/overview`);
    vi.spyOn(globalThis, "fetch").mockImplementation(async () => reply({ error: "Sign in to continue." }, 401));
    renderComponent(<OrganisationOverviewPage organisationId={org} />);
    const ended = "Your session has ended. Sign in again to continue.";
    await expect.element(page.getByText(ended)).toBeVisible();
    expect(page.getByText(ended).elements()).toHaveLength(1);
    await expect.element(page.getByRole("button", { name: "Try again" })).not.toBeInTheDocument();
    await expect.element(page.getByText("Loading overview…")).not.toBeInTheDocument();
  });

  it("offers Try again after a failed read and shows a permission change plainly", async () => {
    let fail = true;
    serve(() => (fail ? reply({ error: "Overview unavailable. Try again." }, 503) : reply({ overview })));
    renderComponent(<OrganisationOverviewPage organisationId={org} />);
    await expect.element(page.getByText("Overview unavailable. Try again.").first()).toBeVisible();
    fail = false;
    await userEvent.click(page.getByRole("button", { name: "Try again" }));
    await expect.element(link("1 Overdue")).toBeVisible();

    vi.restoreAllMocks();
    serve(() => reply({ error: "You no longer have permission to view this organisation." }, 403));
    renderComponent(<OrganisationOverviewPage organisationId={org} />);
    await expect
      .element(page.getByText("You no longer have permission to view this organisation.").first())
      .toBeVisible();
  });
});
