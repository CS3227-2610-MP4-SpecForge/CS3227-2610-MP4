// Requests filters as they appear in the page URL, shared by the Overview links
// and the Requests page. Only known values survive; anything else is dropped.
import { ticketPriorities, ticketStatuses } from "./delivery";

export const derivedStatuses = { open: "Open", overdue: "Overdue", due_soon: "Due in the next 7 days" } as const;
const statusValues = new Set(["draft", ...Object.keys(derivedStatuses), ...Object.keys(ticketStatuses)]);
const priorityValues = new Set(Object.keys(ticketPriorities));
const sortValues = new Set(["updated", "due", "status"]);
export const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type RequestFilters = { search: string; status: string; priority: string; assignee: string; sort: string };
export const defaultFilters: RequestFilters = { search: "", status: "", priority: "", assignee: "", sort: "updated" };
const filterKeys = Object.keys(defaultFilters) as (keyof RequestFilters)[];

function valid(key: keyof RequestFilters, value: string) {
  if (key === "search") return [...value].length <= 160;
  if (key === "status") return statusValues.has(value);
  if (key === "priority") return priorityValues.has(value);
  if (key === "sort") return sortValues.has(value);
  return value === "me" || value === "unassigned" || uuidPattern.test(value);
}

/**
 * Reads filters from URL search parameters. An unknown key, a repeated key or an
 * invalid value marks the whole set invalid, and that value falls back to its
 * default; the caller shows a generic notice and never echoes the input.
 */
export function parseRequestFilters(params: Record<string, string | string[] | undefined>) {
  const filters = { ...defaultFilters };
  let invalid = false;
  for (const [key, raw] of Object.entries(params)) {
    if (raw === undefined) continue;
    if (!filterKeys.includes(key as keyof RequestFilters) || Array.isArray(raw)) {
      invalid = true;
      continue;
    }
    const name = key as keyof RequestFilters;
    if (raw === "" || !valid(name, raw)) {
      if (raw !== "") invalid = true;
      continue;
    }
    filters[name] = raw;
  }
  return { filters, invalid };
}

/** The URL query for these filters, leaving out defaults. */
export function filterQuery(filters: Partial<RequestFilters>) {
  const params = new URLSearchParams();
  for (const key of filterKeys) {
    const value = filters[key];
    if (value && value !== defaultFilters[key]) params.set(key, value);
  }
  const query = params.toString();
  return query ? "?" + query : "";
}

export function requestsHref(organisationId: string, filters: Partial<RequestFilters> = {}) {
  return `/organisations/${organisationId}/requests${filterQuery(filters)}`;
}

/** The viewer's own calendar day as YYYY-MM-DD; due dates are calendar-only. */
export function localDay(now = new Date()) {
  const pad = (value: number, size = 2) => String(value).padStart(size, "0");
  return `${pad(now.getFullYear(), 4)}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

type Load = { open: number; overdue: number; high: number };
/** GET /api/organisations/[org]/overview: totals count each ticket once; workload rows are per member. */
export type OrganisationOverview = {
  totals: {
    to_do: number;
    in_progress: number;
    in_review: number;
    done: number;
    cancelled: number;
    overdue: number;
    due_soon: number;
  };
  /** `drafts` is present only for Product Managers. */
  mine: { open: number; overdue: number; drafts?: number };
  workload: {
    members: (Load & { user_id: string; username: string; app_role: "PM" | "Developer" })[];
    member_total: number;
    unassigned: Load;
  };
};
