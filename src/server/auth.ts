import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { legacyUsernamePrefix, reservedUsernameMessage, usernameHint, usernamePattern } from "../usernames";
import { error, json, readBody, serviceUnavailable } from "./http";
import type { Route } from "./routes";

export type AuthContext = { request: Request; client(): SupabaseClient };

/** Coarse in-memory cap of 30 auth attempts per clock minute; it counts per server instance. */
export function createAuthAdmission() {
  let window = 0;
  let count = 0;
  return () => {
    const current = Math.floor(Date.now() / 60_000);
    if (current !== window) {
      window = current;
      count = 0;
    }
    return ++count <= 30;
  };
}
/** POST paths that pass through auth admission before any route runs. */
export const admittedAuthPaths = ["signup", "signin", "verify", "resend"].map(action => `/api/auth/${action}`);

export const email = z.email().max(254);
const password = z.string().min(12).max(128);
export const signupUsername = z
  .string(usernameHint)
  .regex(new RegExp(`^${usernamePattern}$`), usernameHint)
  .toLowerCase()
  .refine(value => !value.startsWith(legacyUsernamePrefix), reservedUsernameMessage);
const signup = z.strictObject({ email, password, role: z.enum(["PM", "Developer"]), username: signupUsername });
const verification = z.strictObject({ email, token: z.string().regex(/^\d{6,10}$/) });
const credentials = z.strictObject({ email, password: z.string().min(1).max(128) });

/** True for a provider failure that means the service, not the caller, is at fault. */
export function unavailable(failure: { status?: number } | null) {
  return Boolean(failure && (!failure.status || failure.status >= 500));
}

export const authRoutes: Route<AuthContext>[] = [
  {
    method: "POST",
    pattern: /^\/api\/auth\/signup$/,
    async handler({ request, client }) {
      const input = signup.safeParse(await readBody(request));
      if (!input.success)
        return error(
          input.error.issues.find(issue => issue.path[0] === "username")?.message ??
            "Check the account fields and try again.",
          400,
        );
      const { email, password, role, username } = input.data;
      const { error: failure } = await client().auth.signUp({ email, password, options: { data: { role, username } } });
      // Auth can mask existing accounts as success and surface username collisions as opaque 500s.
      if (
        failure &&
        failure.status !== 500 &&
        failure.code !== "user_already_exists" &&
        failure.code !== "email_exists"
      ) {
        if (unavailable(failure))
          return serviceUnavailable(request, failure, "Service temporarily unavailable. Try again later.");
        return error("Unable to create the account. Try again later.", failure.status === 429 ? 429 : 400);
      }
      return json(
        {
          message:
            "Check your email for a verification code. If no code arrives, try a different username or sign in if you already have an account.",
        },
        202,
      );
    },
  },
  {
    method: "POST",
    pattern: /^\/api\/auth\/verify$/,
    async handler({ request, client }) {
      const input = verification.safeParse(await readBody(request));
      if (!input.success) return error("Enter a valid email and verification code.", 400);
      const { error: failure } = await client().auth.verifyOtp({ ...input.data, type: "signup" });
      if (unavailable(failure))
        return serviceUnavailable(request, failure, "Service temporarily unavailable. Try again later.");
      if (failure) return error("Invalid or expired verification code.", failure.status === 429 ? 429 : 400);
      return json({ message: "Email verified." });
    },
  },
  {
    method: "POST",
    pattern: /^\/api\/auth\/signin$/,
    async handler({ request, client }) {
      const input = credentials.safeParse(await readBody(request));
      if (!input.success) return error("Check the account fields and try again.", 400);
      const { data, error: failure } = await client().auth.signInWithPassword(input.data);
      if (unavailable(failure))
        return serviceUnavailable(request, failure, "Service temporarily unavailable. Try again later.");
      if (failure || !data.user?.email_confirmed_at)
        return error("Email or password is incorrect, or email is not verified.", failure?.status === 429 ? 429 : 401);
      return json({ message: "Signed in." });
    },
  },
  {
    method: "POST",
    pattern: /^\/api\/auth\/signout$/,
    async handler({ request, client }) {
      if (!z.strictObject({}).safeParse(await readBody(request)).success) return error("Invalid request.", 400);
      const { error: failure } = await client().auth.signOut({ scope: "local" });
      if (failure) return serviceUnavailable(request, failure, "Unable to sign out. Try again.");
      return json({ message: "Signed out." });
    },
  },
  {
    method: "POST",
    pattern: /^\/api\/auth\/resend$/,
    async handler({ request, client }) {
      const input = z.strictObject({ email }).safeParse(await readBody(request));
      if (!input.success) return error("Enter a valid email address.", 400);
      const { error: failure } = await client().auth.resend({ type: "signup", email: input.data.email });
      if (failure?.status === 429) return error("Too many attempts. Try again later.", 429);
      if (unavailable(failure))
        return serviceUnavailable(request, failure, "Service temporarily unavailable. Try again later.");
      return json({ message: "If this account needs verification, a new code has been sent." }, 202);
    },
  },
];
