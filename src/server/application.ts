import type { SupabaseClient } from "@supabase/supabase-js";
import { accountRoutes } from "./account";
import { admittedAuthPaths, authRoutes, createAuthAdmission, unavailable } from "./auth";
import { handleChat, type ChatDependencies } from "./chat";
import { handleDelivery } from "./delivery";
import { error, InputError, json, serviceUnavailable } from "./http";
import { organisationRoutes } from "./organisations";
import { handleRequests } from "./requests";
import { matchRoute, type Route, type SessionContext } from "./routes";
import { handleTestPlans, type TestPlanDependencies } from "./test-plans";

export { createAuthAdmission } from "./auth";

type Options = {
  origin: string;
  client(): SupabaseClient;
  admitAuth?: () => boolean;
  chat?: ChatDependencies;
  testPlans?: TestPlanDependencies;
  health?: () => Promise<Response>;
};

/** Paths that need a signed-in, email-verified user, even when no route then matches. */
function needsSession(path: string) {
  return (
    path === "/api/invitations" ||
    path.startsWith("/api/invitations/") ||
    path === "/api/organisations" ||
    path === "/api/account" ||
    path.startsWith("/api/organisations/")
  );
}
const sessionRoutes: Route<SessionContext>[] = [...organisationRoutes, ...accountRoutes];

/**
 * The single entry point for /api. Order matters: origin check, then the public
 * health check, then auth admission and auth routes, then the identity check
 * before any organisation, ticket or account route.
 */
export function createApplication(options: Options) {
  const admitAuth = options.admitAuth ?? createAuthAdmission();
  return async function handle(request: Request): Promise<Response> {
    if (request.method !== "GET" && request.headers.get("origin") !== options.origin) {
      return error("This request is not allowed.", 403);
    }
    try {
      const path = new URL(request.url).pathname;
      // Public and sessionless; a GET, so it already skips the origin check.
      if (path === "/api/health" && request.method === "GET" && options.health) return await options.health();
      if (request.method === "POST" && admittedAuthPaths.includes(path) && !admitAuth()) {
        return json({ error: "Too many attempts. Try again in a minute." }, 429);
      }
      const auth = matchRoute(authRoutes, request.method, path);
      if (auth) return await auth.route.handler({ request, client: options.client }, auth.match);
      if (needsSession(path)) {
        const client = options.client();
        const { data, error: failure } = await client.auth.getUser();
        if (failure?.status === 429) return error("Too many attempts. Try again later.", 429);
        if (unavailable(failure))
          return serviceUnavailable(request, failure, "Service temporarily unavailable. Try again later.");
        if (failure || !data.user) return error("Sign in to continue.", 401);
        if (!data.user.email_confirmed_at) return error("Verify your email to continue.", 403);
        const user = data.user;
        const handled =
          (await handleChat(request, client, user.id, options.chat)) ??
          (await handleTestPlans(request, client, user.id, options.testPlans)) ??
          (await handleDelivery(request, client)) ??
          (await handleRequests(request, client));
        if (handled) return handled;
        const session = matchRoute(sessionRoutes, request.method, path);
        if (session) return await session.route.handler({ request, client, user }, session.match);
      }
      return error("Not found.", 404);
    } catch (failure) {
      if (failure instanceof InputError) return error("Invalid request.", failure.status);
      return serviceUnavailable(request, failure, "Service temporarily unavailable. Try again later.");
    }
  };
}
