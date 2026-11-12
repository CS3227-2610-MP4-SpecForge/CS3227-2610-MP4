import { z } from "zod";
import { email } from "./auth";
import { error, json, readBody, serviceUnavailable } from "./http";
import type { Route, SessionContext } from "./routes";

const organisationInput = z.strictObject({ name: z.string().trim().min(1).max(80) });
const membership = z.object({ is_admin: z.boolean(), organisation: z.object({ id: z.uuid(), name: z.string() }) });
function organisationView(row: z.infer<typeof membership>) {
  return { ...row.organisation, isAdmin: row.is_admin };
}
/** The caller's own memberships; every organisation read is limited to these rows. */
function memberships(client: SessionContext["client"], userId: string) {
  return client
    .from("organisation_members")
    .select("is_admin,organisation:organisations(id,name)")
    .eq("user_id", userId);
}
const isId = (value: string) => z.uuid().safeParse(value).success;
const notFound = async () => error("Not found.", 404);

// Membership paths. Every id in them must be a UUID, or the path is not found.
const inbox = /^\/api\/invitations$/;
const reply = /^\/api\/invitations\/([^/]+)$/;
const roster = /^\/api\/organisations\/([^/]+)\/(members|invitations)$/;
const entry = /^\/api\/organisations\/([^/]+)\/(members|invitations)\/([^/]+)$/;

type Outcome = { resultKey?: string; inviting?: boolean };
/** Calls one membership RPC and maps its errors and result to the HTTP answer. */
async function runMembership(
  { request, client }: SessionContext,
  rpc: string,
  args: Record<string, unknown>,
  { resultKey, inviting = false }: Outcome = {},
) {
  const { data: result, error: rpcError } = await client.rpc(rpc, args);
  if (rpcError?.code === "42501") return error("You no longer have permission for this action.", 403);
  if (rpcError?.code === "22023") return error("Invalid membership action.", 400);
  if (rpcError?.code === "P0001")
    return error(
      rpc === "change_member"
        ? "This change is unavailable. Keep at least one admin; promote another member first if needed."
        : "Invitation changed or expired. Refresh and try again.",
      409,
    );
  if (rpcError) return serviceUnavailable(request, rpcError, "Membership service unavailable. Try again later.");
  if (result?.status === "limited") return error("Invitation limit reached. Try again in an hour.", 429);
  if (result?.status === "member") return error("This account is already a member of the organisation.", 409);
  if (resultKey) {
    if (!Array.isArray(result))
      return serviceUnavailable(request, undefined, "Membership service unavailable. Try again later.");
    return json({ [resultKey]: result });
  }
  return json(
    {
      message: inviting
        ? result?.status === "pending"
          ? "Invitation already pending."
          : "Invitation created."
        : result?.status === "cancelled"
          ? "The invitation has been withdrawn"
          : "Membership updated.",
    },
    inviting ? 202 : 200,
  );
}
/** Reads a `{ action }` body limited to the given actions; null when it is invalid. */
async function readAction<const Actions extends readonly [string, ...string[]]>(request: Request, actions: Actions) {
  const input = z.strictObject({ action: z.enum(actions) }).safeParse(await readBody(request));
  return input.success ? input.data.action : null;
}

export const organisationRoutes: Route<SessionContext>[] = [
  {
    method: "GET",
    pattern: inbox,
    handler: context => runMembership(context, "list_invitations", {}, { resultKey: "invitations" }),
  },
  {
    method: "POST",
    pattern: reply,
    async handler(context, [, invitation]) {
      if (!isId(invitation)) return error("Not found.", 404);
      const action = await readAction(context.request, ["accept", "decline"]);
      if (!action) return error("Invalid membership action.", 400);
      return runMembership(context, "respond_invitation", { invitation_id: invitation, decision: action });
    },
  },
  {
    method: "GET",
    pattern: roster,
    async handler(context, [, organisation, kind]) {
      if (!isId(organisation)) return error("Not found.", 404);
      const rpc = kind === "members" ? "list_members" : "list_invitations";
      return runMembership(context, rpc, { target_org: organisation }, { resultKey: kind });
    },
  },
  {
    method: "POST",
    pattern: roster,
    async handler(context, [, organisation, kind]) {
      if (!isId(organisation)) return error("Not found.", 404);
      const body = await readBody(context.request);
      // Members are changed one at a time through their own path.
      if (kind === "members") return error("Invalid membership action.", 400);
      const input = z.strictObject({ email: z.string().trim().pipe(email) }).safeParse(body);
      if (!input.success) return error("Enter a valid email address.", 400);
      const args = { target_org: organisation, target_email: input.data.email };
      return runMembership(context, "invite_member", args, { inviting: true });
    },
  },
  {
    method: "POST",
    pattern: entry,
    async handler(context, [, organisation, kind, target]) {
      if (!isId(organisation) || !isId(target)) return error("Not found.", 404);
      if (kind === "members") {
        const action = await readAction(context.request, ["remove", "promote", "demote", "leave"]);
        if (!action) return error("Invalid membership action.", 400);
        return runMembership(context, "change_member", {
          target_org: organisation,
          target_user: target,
          decision: action,
        });
      }
      const action = await readAction(context.request, ["cancel", "resend"]);
      if (!action) return error("Invalid membership action.", 400);
      return runMembership(context, "manage_invitation", {
        target_org: organisation,
        invitation_id: target,
        decision: action,
      });
    },
  },
  // These membership paths have no GET; claim them before the organisation lookup below.
  { method: "GET", pattern: reply, handler: notFound },
  { method: "GET", pattern: entry, handler: notFound },
  {
    method: "POST",
    pattern: /^\/api\/organisations$/,
    async handler({ request, client }) {
      const input = organisationInput.safeParse(await readBody(request));
      if (!input.success) return error("Enter an organisation name of 1–80 characters.", 400);
      const { data: id, error: creationError } = await client.rpc("create_organisation", {
        organisation_name: input.data.name,
      });
      if (creationError || !isId(id))
        return serviceUnavailable(
          request,
          creationError ?? undefined,
          "Unable to create the organisation. Try again later.",
        );
      return json({ organisation: { id, name: input.data.name, isAdmin: true } }, 201);
    },
  },
  {
    method: "GET",
    pattern: /^\/api\/organisations$/,
    async handler({ request, client, user }) {
      const { data: rows, error: queryError } = await memberships(client, user.id).order("joined_at");
      const parsed = z.array(membership).safeParse(rows);
      if (queryError || !parsed.success)
        return serviceUnavailable(request, queryError ?? parsed.error, "Organisations unavailable. Try again later.");
      return json({ organisations: parsed.data.map(organisationView) });
    },
  },
  // Any other GET under a membership prefix is an organisation lookup; a path
  // with further segments is never a UUID, so it is not found. (Before the
  // split, a fixed-length slice let GET /api/invitations/a/<id> reach the
  // lookup; it now answers 404, the one intended HTTP change.)
  {
    method: "GET",
    pattern: /^\/api\/(?:organisations|invitations)\/(.*)$/,
    async handler({ request, client, user }, [, id]) {
      if (!isId(id)) return error("Organisation not found.", 404);
      const { data: row, error: queryError } = await memberships(client, user.id)
        .eq("organisation_id", id)
        .maybeSingle();
      if (queryError) return serviceUnavailable(request, queryError, "Organisation unavailable. Try again later.");
      if (!row) return error("Organisation not found.", 404);
      const parsed = membership.safeParse(row);
      if (!parsed.success)
        return serviceUnavailable(request, parsed.error, "Organisation unavailable. Try again later.");
      return json({ organisation: organisationView(parsed.data) });
    },
  },
];
