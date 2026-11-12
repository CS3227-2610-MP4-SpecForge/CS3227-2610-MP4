import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { taskFields, requestRecord, ticketListQuery, ticketReadRecord, date, priority, status } from "./ticket-schemas";
export { taskFields } from "./ticket-schemas";
import { error, json, readBody, serviceUnavailable } from "./http";

const fields = taskFields;
const revision = z.number().int().min(1).max(2147483647);
const delivery = z
  .strictObject({
    revision,
    changes: z.strictObject({
      due_date: date.nullable().optional(),
      priority: priority.optional(),
      status: status.optional(),
      assignee_ids: z
        .array(z.uuid())
        .max(5)
        .refine(ids => new Set(ids).size === ids.length)
        .optional(),
    }),
  })
  .optional();
const mutation = z.discriminatedUnion("action", [
  z.strictObject({ action: z.literal("save_draft"), revision, fields, delivery }),
  z.strictObject({ action: z.literal("submit"), revision, fields, delivery, acknowledged: z.literal(true) }),
  z.strictObject({ action: z.literal("save_published"), revision, fields, delivery, acknowledged: z.literal(true) }),
  z.strictObject({ action: z.literal("delete_draft"), revision }),
]);
export async function handleRequests(request: Request, client: SupabaseClient): Promise<Response | null> {
  const match = new URL(request.url).pathname.match(/^\/api\/organisations\/([^/]+)\/requests(?:\/([^/]+))?$/);
  if (!match) return null;
  const [, org, id] = match;
  if (!z.uuid().safeParse(org).success || (id && !z.uuid().safeParse(id).success))
    return error("Request not found.", 404);
  let rpc: string;
  let args: Record<string, unknown> = { target_org: org };
  let deleted = false;
  if (request.method === "GET") {
    rpc = id ? "read_request" : "list_requests";
    if (id) args.request_id = id;
    else {
      const query = ticketListQuery.safeParse(Object.fromEntries(new URL(request.url).searchParams));
      if (!query.success) return error("Invalid ticket filters.", 400);
      const { offset, ...filters } = query.data;
      rpc = "list_ticket_page";
      args = { target_org: org, filters, page_offset: offset };
    }
  } else if (request.method === "POST") {
    const body = await readBody(request, 196608);
    if (!id) {
      const input = z.strictObject({ creationKey: z.uuid() }).safeParse(body);
      if (!input.success) return error("Invalid draft creation request.", 400);
      rpc = "create_request";
      args.creation_key = input.data.creationKey;
    } else {
      const input = mutation.safeParse(body);
      if (!input.success) return error("Check the ticket fields.", 400);
      const action = input.data;
      args = { ...args, request_id: id, expected_revision: action.revision };
      if (action.action === "delete_draft") {
        rpc = "delete_draft";
        deleted = true;
      } else {
        args.content = action.fields;
        rpc = action.action === "save_draft" ? "save_draft" : "publish_request";
        if (action.action !== "save_draft") {
          args.acknowledged = action.acknowledged;
          args.first_submission = action.action === "submit";
        }
        if (action.delivery) {
          rpc = "save_ticket";
          args.expected_delivery_revision = action.delivery.revision;
          args.delivery_changes = action.delivery.changes;
          args.action = action.action;
          delete args.first_submission;
        }
      }
    }
  } else return error("Not found.", 404);
  const { data, error: failure } = await client.rpc(rpc, args);
  if (failure?.code === "42501") return error("Request unavailable or access has changed.", 403);
  if (failure?.code === "22023")
    return error("Check title, description, due date, assignees and field limits before publishing or updating.", 400);
  if (failure?.code === "P0001")
    return error("The saved request changed. Your text is preserved; reload the saved version before continuing.", 409);
  if (failure)
    return serviceUnavailable(
      request,
      failure,
      "Request service unavailable. Your text is preserved; check the saved version before retrying.",
    );
  if (deleted) return json({ message: "Draft deleted." });
  if (rpc === "list_ticket_page") {
    const page = z
      .object({ items: z.array(ticketReadRecord), next_offset: z.number().int().nonnegative().nullable() })
      .safeParse(data);
    if (!page.success)
      return serviceUnavailable(
        request,
        page.error,
        "Request service unavailable. Check the saved version before retrying.",
      );
    return json({ requests: page.data.items, nextOffset: page.data.next_offset });
  }
  const parsed = (rpc === "read_request" ? ticketReadRecord : requestRecord).safeParse(data);
  if (!parsed.success)
    return serviceUnavailable(
      request,
      parsed.error,
      "Request service unavailable. Check the saved version before retrying.",
    );
  return json({ request: parsed.data }, rpc === "create_request" ? 201 : 200);
}
