import { handleChat, type ChatDependencies } from "./chat";
import { handleTestPlans, type TestPlanDependencies } from "./test-plans";
import { handleDelivery } from "./delivery";
import { handleRequests } from "./requests";
import { error, json, InputError, readBody, serviceUnavailable } from "./http";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { legacyUsernamePrefix, reservedUsernameMessage, usernameHint, usernamePattern } from "../usernames";

type Options = { origin: string; client(): SupabaseClient; admitAuth?: () => boolean; chat?: ChatDependencies; testPlans?: TestPlanDependencies };
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
const signupUsername = z.string(usernameHint).regex(new RegExp(`^${usernamePattern}$`), usernameHint).toLowerCase()
  .refine(value => !value.startsWith(legacyUsernamePrefix), reservedUsernameMessage);
const signup = z.strictObject({ email, password, role: z.enum(["PM", "Developer"]), username: signupUsername });
const verification = z.strictObject({ email, token: z.string().regex(/^\d{6,10}$/) });
const credentials = z.strictObject({ email, password: z.string().min(1).max(128) });
const organisationInput = z.strictObject({ name: z.string().trim().min(1).max(80) });
const membership = z.object({ is_admin: z.boolean(), organisation: z.object({ id: z.uuid(), name: z.string() }) });
function organisationView(row: z.infer<typeof membership>) { return { ...row.organisation, isAdmin: row.is_admin }; }
function unavailable(failure: { status?: number } | null) { return Boolean(failure && (!failure.status || failure.status >= 500)); }
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
        if (!input.success) return error(input.error.issues.find(issue => issue.path[0] === "username")?.message ?? "Check the account fields and try again.", 400);
        const { email, password, role, username } = input.data;
        const { error: failure } = await options.client().auth.signUp({ email, password, options: { data: { role, username } } });
        // Auth can mask existing accounts as success and surface username collisions as opaque 500s.
        if (failure && failure.status !== 500 && failure.code !== "user_already_exists" && failure.code !== "email_exists") {
          if (unavailable(failure)) return serviceUnavailable(request, failure, "Service temporarily unavailable. Try again later.");
          return error("Unable to create the account. Try again later.", failure.status === 429 ? 429 : 400);
        }
        return json({ message: "Check your email for a verification code. If no code arrives, try a different username or sign in if you already have an account." }, 202);
      }
      if (path === "/api/auth/verify" && request.method === "POST") {
        const input = verification.safeParse(await readBody(request));
        if (!input.success) return error("Enter a valid email and verification code.", 400);
        const { error: failure } = await options.client().auth.verifyOtp({ ...input.data, type: "signup" });
        if (unavailable(failure)) return serviceUnavailable(request, failure, "Service temporarily unavailable. Try again later.");
        if (failure) return error("Invalid or expired verification code.", failure.status === 429 ? 429 : 400);
        return json({ message: "Email verified." });
      }
      if (path === "/api/auth/signin" && request.method === "POST") {
        const input = credentials.safeParse(await readBody(request));
        if (!input.success) return error("Check the account fields and try again.", 400);
        const { data, error: failure } = await options.client().auth.signInWithPassword(input.data);
        if (unavailable(failure)) return serviceUnavailable(request, failure, "Service temporarily unavailable. Try again later.");
        if (failure || !data.user?.email_confirmed_at) return error("Email or password is incorrect, or email is not verified.", failure?.status === 429 ? 429 : 401);
        return json({ message: "Signed in." });
      }
      if (path === "/api/auth/signout" && request.method === "POST") {
        if (!z.strictObject({}).safeParse(await readBody(request)).success) return error("Invalid request.", 400);
        const { error: failure } = await options.client().auth.signOut({ scope: "local" });
        if (failure) return serviceUnavailable(request, failure, "Unable to sign out. Try again.");
        return json({ message: "Signed out." });
      }
      if (path === "/api/auth/resend" && request.method === "POST") {
        const input = z.strictObject({ email }).safeParse(await readBody(request));
        if (!input.success) return error("Enter a valid email address.", 400);
        const { error: failure } = await options.client().auth.resend({ type: "signup", email: input.data.email });
        if (failure?.status === 429) return error("Too many attempts. Try again later.", 429);
        if (unavailable(failure)) return serviceUnavailable(request, failure, "Service temporarily unavailable. Try again later.");
        return json({ message: "If this account needs verification, a new code has been sent." }, 202);
      }
      if (path === "/api/invitations" || path.startsWith("/api/invitations/") || path === "/api/organisations" || path === "/api/account" || path.startsWith("/api/organisations/")) {
        const client = options.client();
        const { data, error: failure } = await client.auth.getUser();
        if (failure?.status === 429) return error("Too many attempts. Try again later.", 429);
        if (unavailable(failure)) return serviceUnavailable(request, failure, "Service temporarily unavailable. Try again later.");
        if (failure || !data.user) return error("Sign in to continue.", 401);
        if (!data.user.email_confirmed_at) return error("Verify your email to continue.", 403);
        const chatResponse = await handleChat(request, client, data.user.id, options.chat);
        if (chatResponse) return chatResponse;
        const testPlanResponse = await handleTestPlans(request, client, data.user.id, options.testPlans);
        if (testPlanResponse) return testPlanResponse;
        const deliveryResponse = await handleDelivery(request, client);
        if (deliveryResponse) return deliveryResponse;
        const requestResponse = await handleRequests(request, client);
        if (requestResponse) return requestResponse;
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
              if (!input.success) return error("Enter a valid email address.", 400);
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
          if (rpcError) return serviceUnavailable(request, rpcError, "Membership service unavailable. Try again later.");
          if (result?.status === "limited") return error("Invitation limit reached. Try again in an hour.", 429);
          if (result?.status === "member") return error("This account is already a member of the organisation.", 409);
          if (resultKey) {
            if (!Array.isArray(result)) return serviceUnavailable(request, undefined, "Membership service unavailable. Try again later.");
            return json({ [resultKey]: result });
          }
          return json({ message: inviting ? (result?.status === "pending" ? "Invitation already pending." : "Invitation created.") : result?.status === "cancelled" ? "The invitation has been withdrawn" : "Membership updated." }, inviting ? 202 : 200);
        }
        if (path === "/api/account" && ["GET", "POST"].includes(request.method)) {
          if (request.method === "POST") {
            const input = z.strictObject({ username: signupUsername }).safeParse(await readBody(request));
            if (!input.success) return error(input.error.issues.find(issue => issue.path[0] === "username")?.message ?? "Only the username can be changed.", 400);
            const { error: renameError } = await client.rpc("rename_username", { new_username: input.data.username });
            if (renameError?.code === "23505") return error("That username is already taken. Choose another.", 409);
            if (renameError?.code === "22023") return error(usernameHint, 400);
            if (renameError?.code === "42501") return error("Profile unavailable. Sign in again.", 403);
            if (renameError) return serviceUnavailable(request, renameError, "Unable to save your profile. Check the saved username before retrying.");
          }
          const { data: profile, error: profileError } = await client.from("profiles").select("app_role,username").eq("id", data.user.id).single();
          const identity = z.object({ app_role: z.enum(["PM", "Developer"]), username: z.string() }).safeParse(profile);
          if (profileError || !identity.success) return serviceUnavailable(request, profileError ?? identity.error, "Account unavailable. Try again later.");
          return json({ account: { id: data.user.id, email: data.user.email, role: identity.data.app_role, username: identity.data.username, createdAt: data.user.created_at } });
        }
        if (path === "/api/organisations" && request.method === "POST") {
          const input = organisationInput.safeParse(await readBody(request));
          if (!input.success) return error("Enter an organisation name of 1–80 characters.", 400);
          const { data: id, error: creationError } = await client.rpc("create_organisation", { organisation_name: input.data.name });
          if (creationError || !z.uuid().safeParse(id).success) return serviceUnavailable(request, creationError ?? undefined, "Unable to create the organisation. Try again later.");
          return json({ organisation: { id, name: input.data.name, isAdmin: true } }, 201);
        }
        if (request.method === "GET") {
          const query = client.from("organisation_members").select("is_admin,organisation:organisations(id,name)").eq("user_id", data.user.id);
          if (path === "/api/organisations") {
            const { data: rows, error: queryError } = await query.order("joined_at");
            const parsed = z.array(membership).safeParse(rows);
            if (queryError || !parsed.success) return serviceUnavailable(request, queryError ?? parsed.error, "Organisations unavailable. Try again later.");
            return json({ organisations: parsed.data.map(organisationView) });
          }
          const id = path.slice("/api/organisations/".length);
          if (!z.uuid().safeParse(id).success) return error("Organisation not found.", 404);
          const { data: row, error: queryError } = await query.eq("organisation_id", id).maybeSingle();
          if (queryError) return serviceUnavailable(request, queryError, "Organisation unavailable. Try again later.");
          if (!row) return error("Organisation not found.", 404);
          const parsed = membership.safeParse(row);
          if (!parsed.success) return serviceUnavailable(request, parsed.error, "Organisation unavailable. Try again later.");
          return json({ organisation: organisationView(parsed.data) });
        }
      }
      return error("Not found.", 404);
    } catch (failure) {
      if (failure instanceof InputError) return error("Invalid request.", failure.status);
      return serviceUnavailable(request, failure, "Service temporarily unavailable. Try again later.");
    }
  };
}
