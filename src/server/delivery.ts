import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { assigneeUsernames, requestRecord, date, priority, status } from "./ticket-schemas";
import { error, json, readBody, serviceUnavailable } from "./http";

const revision = z.number().int().positive().max(2147483647);
const changes = z
  .strictObject({
    due_date: date.nullable().optional(),
    priority: priority.optional(),
    status: status.optional(),
    assignee_ids: z
      .array(z.uuid())
      .max(5)
      .refine(ids => new Set(ids).size === ids.length)
      .optional(),
  })
  .refine(value => Object.keys(value).length > 0);
const cursor = z
  .string()
  .regex(/^[1-9]\d{0,18}$/)
  .refine(value => BigInt(value) <= 9223372036854775807n);
const activity = z.object({
  id: cursor,
  request_id: z.uuid(),
  actor_id: z.uuid().nullable(),
  kind: z.enum(["published", "delivery_updated", "requirements_updated", "comment"]),
  body: z.string().nullable(),
  changes: z.record(z.string(), z.object({ from: z.unknown(), to: z.unknown() })),
  created_at: z.string(),
});
const activityRead = activity.extend({
  actor_username: z.string().nullable(),
  assignment_usernames: z.object({ from: assigneeUsernames, to: assigneeUsernames }).nullable(),
});
export async function handleDelivery(request: Request, client: SupabaseClient): Promise<Response | null> {
  const url = new URL(request.url);
  const members = url.pathname.match(/^\/api\/organisations\/([^/]+)\/ticket-members$/);
  const match = url.pathname.match(/^\/api\/organisations\/([^/]+)\/requests\/([^/]+)\/(delivery|activity)$/);
  if (!members && !match) return null;
  const org = (members ?? match)![1];
  if (!z.uuid().safeParse(org).success || (match && !z.uuid().safeParse(match[2]).success))
    return error("Ticket not found.", 404);
  let rpc: string;
  let args: Record<string, unknown> = { target_org: org };
  let schema: z.ZodType;
  if (members && request.method === "GET") {
    const input = z
      .strictObject({
        after: z.uuid().optional(),
        search: z.string().max(160).default(""),
        selected: z
          .string()
          .max(184)
          .transform(value => value.split(","))
          .pipe(z.array(z.uuid()).max(5))
          .optional(),
      })
      .safeParse(Object.fromEntries(url.searchParams));
    if (!input.success) return error("Invalid member page.", 400);
    rpc = "ticket_members";
    args.after_user = input.data.after ?? null;
    args.member_search = input.data.search;
    args.selected_users = input.data.selected ?? [];
    const member = z.object({
      user_id: z.uuid(),
      email: z.string().min(1).max(320),
      app_role: z.enum(["PM", "Developer"]),
      username: z.string(),
    });
    schema = z.object({
      members: z.array(member).max(50),
      selected_members: z.array(member).max(5),
      next_cursor: z.uuid().nullable(),
    });
  } else if (match) {
    args.request_id = match[2];
    if (match[3] === "delivery" && request.method === "POST") {
      const input = z.strictObject({ revision, changes }).safeParse(await readBody(request, 32768));
      if (!input.success) return error("Check the date, priority, status and assignees (maximum five).", 400);
      rpc = "update_delivery";
      args = { ...args, expected_revision: input.data.revision, changes: input.data.changes };
      schema = requestRecord;
    } else if (match[3] === "activity" && request.method === "POST") {
      const input = z
        .strictObject({
          creationKey: z.uuid(),
          body: z.string().refine(value => value.trim().length > 0 && [...value].length <= 4000),
        })
        .safeParse(await readBody(request, 32768));
      if (!input.success) return error("Enter a comment of 1–4,000 characters.", 400);
      rpc = "comment_ticket";
      args = { ...args, creation_key: input.data.creationKey, body: input.data.body };
      schema = activity;
    } else if (match[3] === "activity" && request.method === "GET") {
      const input = z.strictObject({ before: cursor.optional() }).safeParse(Object.fromEntries(url.searchParams));
      if (!input.success) return error("Invalid activity page.", 400);
      rpc = "read_ticket_activity";
      args.before_id = input.data.before ?? null;
      schema = z.object({ entries: z.array(activityRead), next_cursor: cursor.nullable() });
    } else return error("Not found.", 404);
  } else return error("Not found.", 404);
  const { data, error: failure } = await client.rpc(rpc, args);
  if (failure?.code === "42501") return error("Ticket unavailable or your permissions have changed.", 403);
  if (failure?.code === "22023") return error("Check the deadline, current members and field limits.", 400);
  if (failure?.code === "P0001")
    return error(
      "The saved ticket changed or this comment key was already used. Your input is preserved; reload before continuing.",
      409,
    );
  if (failure?.code === "P0002") return error("Comment limit reached. Wait a minute before retrying.", 429);
  if (failure)
    return serviceUnavailable(
      request,
      failure,
      "Ticket service unavailable. Your input is preserved; check the saved version before retrying.",
    );
  const parsed = schema.safeParse(data);
  if (!parsed.success)
    return serviceUnavailable(request, parsed.error, "Ticket service unavailable. Refresh before continuing.");
  return json(
    rpc === "update_delivery"
      ? { request: parsed.data }
      : rpc === "comment_ticket"
        ? { entry: parsed.data }
        : parsed.data,
  );
}
