import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import type { OrganisationOverview } from "../overview";
import { error, json, serviceUnavailable } from "./http";

const count = z.number().int().min(0);
const load = z.object({ open: count, overdue: count, high: count });
// Plain objects strip unknown keys, so only these aggregates ever leave the server.
const overviewRecord: z.ZodType<OrganisationOverview> = z.object({
  totals: z.object({
    to_do: count,
    in_progress: count,
    in_review: count,
    done: count,
    cancelled: count,
    overdue: count,
    due_soon: count,
  }),
  mine: z.object({ open: count, overdue: count, drafts: count.optional() }),
  workload: z.object({
    members: z.array(load.extend({ user_id: z.uuid(), username: z.string(), app_role: z.enum(["PM", "Developer"]) })),
    member_total: count,
    unassigned: load,
  }),
});
const viewerDay = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/** GET /api/organisations/[org]/overview?day=YYYY-MM-DD: read-only counts for any member. */
export async function handleOverview(request: Request, client: SupabaseClient): Promise<Response | null> {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/api\/organisations\/([^/]+)\/overview$/);
  if (!match) return null;
  if (request.method !== "GET" || !z.uuid().safeParse(match[1]).success) return error("Not found.", 404);
  const days = url.searchParams.getAll("day");
  const day = viewerDay.safeParse(days[0]);
  if (days.length !== 1 || !day.success) return error("Send the viewer's day as YYYY-MM-DD.", 400);
  const { data, error: failure } = await client.rpc("organisation_overview", {
    target_org: match[1],
    viewer_day: day.data,
  });
  if (failure?.code === "42501") return error("You no longer have permission to view this organisation.", 403);
  if (failure?.code === "22023") return error("Send the viewer's day as YYYY-MM-DD.", 400);
  const parsed = overviewRecord.safeParse(data);
  if (failure || !parsed.success)
    return serviceUnavailable(request, failure ?? parsed.error, "Overview unavailable. Try again.");
  return json({ overview: parsed.data });
}
