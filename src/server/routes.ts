import type { SupabaseClient, User } from "@supabase/supabase-js";

// A small route table: each module lists its routes in the order they must be
// tried, and createApplication dispatches to the first one that applies.

/** What a route behind the identity check receives: a verified, email-confirmed user. */
export type SessionContext = { request: Request; client: SupabaseClient; user: User };

export type Route<Context> = {
  method: "GET" | "POST";
  pattern: RegExp;
  handler(context: Context, match: RegExpMatchArray): Promise<Response>;
};

/** Finds the first route for this method whose pattern matches the whole path. */
export function matchRoute<Context>(
  routes: readonly Route<Context>[],
  method: string,
  path: string,
): { route: Route<Context>; match: RegExpMatchArray } | null {
  // First match wins, so the order of each table is part of its behaviour.
  for (const route of routes) {
    if (route.method !== method) continue;
    const match = path.match(route.pattern);
    if (match) return { route, match };
  }
  return null;
}
