import { json } from "./http";

// Public release check. It reports only fixed words and a commit SHA: never a
// key, URL, model ID or error text, so anyone may read it.
export type HealthDependencies = { revision: string; database(): Promise<boolean>; ai(): boolean };
const commit = /^[0-9a-f]{40}$/;

export async function healthResponse({ revision, database, ai }: HealthDependencies) {
  let reachable = false;
  try { reachable = await database(); } catch { reachable = false; }
  return json({
    status: reachable ? "ok" : "unavailable",
    revision: commit.test(revision) ? revision : "unknown",
    database: reachable ? "ok" : "unavailable",
    ai: ai() ? "configured" : "missing",
  }, reachable ? 200 : 503);
}

/**
 * One cheap read with the publishable key: the anon-callable
 * `public.health_check()` returns true and touches no table.
 */
export function createDatabaseProbe(url: string | undefined, key: string | undefined, transport: typeof fetch = fetch, timeoutMs = 3000) {
  return async () => {
    if (!url || !key) return false;
    try {
      const response = await transport(`${url}/rest/v1/rpc/health_check`, {
        method: "POST", headers: { apikey: key, "Content-Type": "application/json" }, body: "{}",
        signal: AbortSignal.timeout(timeoutMs), cache: "no-store", redirect: "error",
      });
      return response.ok && await response.json() === true;
    } catch { return false; }
  };
}
