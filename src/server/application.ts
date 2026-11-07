import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

type Options = { origin: string; client(): SupabaseClient; admitAuth?: () => boolean };
export function createAuthAdmission() {
  let window = 0;
  let count = 0;
  return () => {
    const current = Math.floor(Date.now() / 60_000);
    if (current !== window) { window = current; count = 0; }
    return ++count <= 30;
  };
}
const email = z.email().max(254);
const password = z.string().min(12).max(128);
const signup = z.strictObject({ email, password, role: z.enum(["PM", "Developer"]) });
const verification = z.strictObject({ email, token: z.string().regex(/^\d{6,10}$/) });
const credentials = z.strictObject({ email, password: z.string().min(1).max(128) });
const organisationInput = z.strictObject({ name: z.string().trim().min(1).max(80) });
const membership = z.object({ is_admin: z.boolean(), organisation: z.object({ id: z.uuid(), name: z.string() }) });
function organisationView(row: z.infer<typeof membership>) { return { ...row.organisation, isAdmin: row.is_admin }; }
const headers = { "Cache-Control": "private, no-store", "Vary": "Cookie, Origin", "X-Content-Type-Options": "nosniff" };
function json(value: unknown, status = 200) { return Response.json(value, { status, headers }); }
function error(message: string, status: number) { return json({ error: message }, status); }
function unavailable(failure: { status?: number } | null) { return Boolean(failure && (!failure.status || failure.status >= 500)); }
class InputError extends Error {
  constructor(readonly status: number) { super("Invalid request."); }
}
async function readBody(request: Request): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new InputError(415);
  const reader = request.body?.getReader();
  if (!reader) throw new InputError(400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 8192) { await reader.cancel(); throw new InputError(413); }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let position = 0;
    for (const chunk of chunks) { bytes.set(chunk, position); position += chunk.byteLength; }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (failure) {
    if (failure instanceof InputError) throw failure;
    throw new InputError(400);
  } finally { reader.releaseLock(); }
}
export function createApplication(options: Options) {
  const admitAuth = options.admitAuth ?? createAuthAdmission();
  return async function handle(request: Request): Promise<Response> {
    if (request.method !== "GET" && request.headers.get("origin") !== options.origin) {
      return error("This request is not allowed.", 403);
    }
    try {
      const path = new URL(request.url).pathname;
      if (request.method === "POST" && ["signup", "signin", "verify", "resend"].some(action => path === `/api/auth/${action}`) && !admitAuth()) {
        return json({ error: "Too many attempts. Try again in a minute." }, 429);
      }
      if (path === "/api/auth/signup" && request.method === "POST") {
        const input = signup.safeParse(await readBody(request));
        if (!input.success) return error("Check the account fields and try again.", 400);
        const { error: failure } = await options.client().auth.signUp({ email: input.data.email, password: input.data.password, options: { data: { role: input.data.role } } });
        if (unavailable(failure)) return error("Service temporarily unavailable. Try again later.", 503);
        if (failure) return error("Unable to create the account. Try again later.", failure.status === 429 ? 429 : 400);
        return json({ message: "Check your email for a verification code." }, 202);
      }
      if (path === "/api/auth/verify" && request.method === "POST") {
        const input = verification.safeParse(await readBody(request));
        if (!input.success) return error("Enter a valid email and verification code.", 400);
        const { error: failure } = await options.client().auth.verifyOtp({ ...input.data, type: "signup" });
        if (unavailable(failure)) return error("Service temporarily unavailable. Try again later.", 503);
        if (failure) return error("Invalid or expired verification code.", failure.status === 429 ? 429 : 400);
        return json({ message: "Email verified." });
      }
      if (path === "/api/auth/signin" && request.method === "POST") {
        const input = credentials.safeParse(await readBody(request));
        if (!input.success) return error("Check the account fields and try again.", 400);
        const { data, error: failure } = await options.client().auth.signInWithPassword(input.data);
        if (unavailable(failure)) return error("Service temporarily unavailable. Try again later.", 503);
        if (failure || !data.user?.email_confirmed_at) return error("Email or password is incorrect, or email is not verified.", failure?.status === 429 ? 429 : 401);
        return json({ message: "Signed in." });
      }
      if (path === "/api/auth/signout" && request.method === "POST") {
        if (!z.strictObject({}).safeParse(await readBody(request)).success) return error("Invalid request.", 400);
        const { error: failure } = await options.client().auth.signOut({ scope: "local" });
        if (failure) return error("Unable to sign out. Try again.", 503);
        return json({ message: "Signed out." });
      }
      if (path === "/api/auth/resend" && request.method === "POST") {
        const input = z.strictObject({ email }).safeParse(await readBody(request));
        if (!input.success) return error("Enter a valid email address.", 400);
        const { error: failure } = await options.client().auth.resend({ type: "signup", email: input.data.email });
        if (failure?.status === 429) return error("Too many attempts. Try again later.", 429);
        if (unavailable(failure)) return error("Service temporarily unavailable. Try again later.", 503);
        return json({ message: "If this account needs verification, a new code has been sent." }, 202);
      }
      if (path === "/api/invitations" || path.startsWith("/api/invitations/") || path === "/api/organisations" || path === "/api/account" || path.startsWith("/api/organisations/")) {
        const client = options.client();
        const { data, error: failure } = await client.auth.getUser();
        if (failure?.status === 429) return error("Too many attempts. Try again later.", 429);
        if (unavailable(failure)) return error("Service temporarily unavailable. Try again later.", 503);
        if (failure || !data.user) return error("Sign in to continue.", 401);
        if (!data.user.email_confirmed_at) return error("Verify your email to continue.", 403);
        const inbox = path === "/api/invitations";
        const responseMatch = path.match(/^\/api\/invitations\/([^/]+)$/);
        const management = path.match(/^\/api\/organisations\/([^/]+)\/(members|invitations)(?:\/([^/]+))?$/);
        if (inbox || responseMatch || management) {
          if ((responseMatch && !z.uuid().safeParse(responseMatch[1]).success) ||
              (management && (!z.uuid().safeParse(management[1]).success || (management[3] && !z.uuid().safeParse(management[3]).success)))) return error("Not found.", 404);
          let rpc: string;
          let args: Record<string, unknown>;
          let resultKey = "";
          let inviting = false;
          if (request.method === "GET" && (inbox || (management && !management[3]))) {
            rpc = management?.[2] === "members" ? "list_members" : "list_invitations";
            args = management ? { target_org: management[1] } : {};
            resultKey = rpc === "list_members" ? "members" : "invitations";
          } else if (request.method === "POST" && !inbox) {
            const body = await readBody(request);
            if (management?.[2] === "invitations" && !management[3]) {
              const input = z.strictObject({ email: z.string().trim().pipe(email) }).safeParse(body);
              if (!input.success) return error("Enter a valid registered email address.", 400);
              rpc = "invite_member"; args = { target_org: management[1], target_email: input.data.email }; inviting = true;
            } else {
              const actions = responseMatch ? ["accept", "decline"] as const : management?.[2] === "members" ? ["remove", "promote", "demote", "leave"] as const : ["cancel", "resend"] as const;
              const input = z.strictObject({ action: z.enum(actions) }).safeParse(body);
              if (!input.success || (management && !management[3])) return error("Invalid membership action.", 400);
              if (responseMatch) { rpc = "respond_invitation"; args = { invitation_id: responseMatch[1], decision: input.data.action }; }
              else if (management![2] === "members") { rpc = "change_member"; args = { target_org: management![1], target_user: management![3], decision: input.data.action }; }
              else { rpc = "manage_invitation"; args = { target_org: management![1], invitation_id: management![3], decision: input.data.action }; }
            }
          } else return error("Not found.", 404);
          const { data: result, error: rpcError } = await client.rpc(rpc, args);
          if (rpcError?.code === "42501") return error("You no longer have permission for this action.", 403);
          if (rpcError?.code === "22023") return error("Invalid membership action.", 400);
          if (rpcError?.code === "P0001") return error(rpc === "change_member" ? "This change is unavailable. Keep at least one admin; promote another member first if needed." : "Invitation changed or expired. Refresh and try again.", 409);
          if (rpcError) return error("Membership service unavailable. Try again later.", 503);
          if (result === false) return error("Invitation limit reached. Try again in an hour.", 429);
          if (resultKey) {
            if (!Array.isArray(result)) return error("Membership service unavailable. Try again later.", 503);
            return json({ [resultKey]: result });
          }
          return json({ message: inviting ? "If this account can be invited, its invitation is available in their workspace." : "Membership updated." }, inviting ? 202 : 200);
        }
        if (path === "/api/account" && request.method === "GET") {
          const { data: profile, error: profileError } = await client.from("profiles").select("app_role").eq("id", data.user.id).single();
          const role = z.enum(["PM", "Developer"]).safeParse(profile?.app_role);
          if (profileError || !role.success) return error("Account unavailable. Try again later.", 503);
          return json({ account: { id: data.user.id, email: data.user.email, role: role.data } });
        }
        if (path === "/api/organisations" && request.method === "POST") {
          const input = organisationInput.safeParse(await readBody(request));
          if (!input.success) return error("Enter an organisation name of 1–80 characters.", 400);
          const { data: id, error: creationError } = await client.rpc("create_organisation", { organisation_name: input.data.name });
          if (creationError || !z.uuid().safeParse(id).success) return error("Unable to create the organisation. Try again later.", 503);
          return json({ organisation: { id, name: input.data.name, isAdmin: true } }, 201);
        }
        if (request.method === "GET") {
          const query = client.from("organisation_members").select("is_admin,organisation:organisations(id,name)").eq("user_id", data.user.id);
          if (path === "/api/organisations") {
            const { data: rows, error: queryError } = await query.order("joined_at");
            const parsed = z.array(membership).safeParse(rows);
            if (queryError || !parsed.success) return error("Organisations unavailable. Try again later.", 503);
            return json({ organisations: parsed.data.map(organisationView) });
          }
          const id = path.slice("/api/organisations/".length);
          if (!z.uuid().safeParse(id).success) return error("Organisation not found.", 404);
          const { data: row, error: queryError } = await query.eq("organisation_id", id).maybeSingle();
          if (queryError) return error("Organisation unavailable. Try again later.", 503);
          if (!row) return error("Organisation not found.", 404);
          const parsed = membership.safeParse(row);
          if (!parsed.success) return error("Organisation unavailable. Try again later.", 503);
          return json({ organisation: organisationView(parsed.data) });
        }
      }
      return error("Not found.", 404);
    } catch (failure) {
      if (failure instanceof InputError) return error("Invalid request.", failure.status);
      return error("Service temporarily unavailable. Try again later.", 503);
    }
  };
}
