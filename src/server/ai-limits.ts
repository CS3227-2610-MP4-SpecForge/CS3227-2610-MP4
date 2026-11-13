import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { error, json, serviceUnavailable } from "./http";

/**
 * Shared AI limits for one environment (workflow/specs/2026-11-13-site-wide-ai-limit.md).
 * The database owns every count; the server only supplies these caps and turns
 * a block into a response.
 */
export type AiLimits = {
  concurrent: number;
  per_minute: number;
  site_per_day: number;
  org_per_day: number;
  user_per_day: number;
};

const settings = [
  ["concurrent", "AI_SITE_CONCURRENT", 4, 8],
  ["per_minute", "AI_SITE_PER_MINUTE", 20, 60],
  ["site_per_day", "AI_SITE_PER_DAY", 200, 1000],
  ["org_per_day", "AI_ORG_PER_DAY", 80, 500],
  ["user_per_day", "AI_USER_PER_DAY", 40, 200],
] as const;

/**
 * Caps from server configuration. A missing setting takes its default; an empty,
 * non-integer or oversized value, a zero (the kill switch) or a broken
 * user <= organisation <= site order returns null, which turns AI off.
 */
export function aiLimits(env: Record<string, string | undefined>): AiLimits | null {
  const limits = {} as AiLimits;
  for (const [key, name, fallback, max] of settings) {
    const value = env[name];
    const parsed = value === undefined ? fallback : /^[0-9]{1,4}$/.test(value) ? Number(value) : NaN;
    if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > max) return null;
    limits[key] = parsed;
  }
  return limits.user_per_day <= limits.org_per_day && limits.org_per_day <= limits.site_per_day ? limits : null;
}

/**
 * Seconds to pause all dispatches after SoC answers 429 or 503: its
 * Retry-After when that is plain whole seconds, bounded to 5–600, otherwise 60.
 */
export function socPauseSeconds(retryAfter: string | null): number {
  if (retryAfter === null || !/^[0-9]{1,6}$/.test(retryAfter.trim())) return 60;
  return Math.min(600, Math.max(5, Number(retryAfter.trim())));
}

export type AiLimitKind = "site" | "site_daily" | "organisation" | "user_daily";
// Fixed database messages; anything else is not a shared-limit block.
const kinds: Record<string, AiLimitKind> = {
  "AI site limit reached": "site",
  "AI site daily limit reached": "site_daily",
  "AI organisation limit reached": "organisation",
  "AI user daily limit reached": "user_daily",
};

/** The shared limit a database failure names, with its whole-second wait, or null. */
export function limitBlock(
  failure: { code?: string; message?: string; details?: string } | null,
): { limit: AiLimitKind; retryAfter: number } | null {
  if (failure?.code !== "PT429") return null;
  const limit = kinds[failure.message ?? ""];
  if (!limit || !/^[0-9]{1,6}$/.test(failure.details ?? "")) return null;
  return { limit, retryAfter: Math.max(1, Number(failure.details)) };
}

const minutes = (seconds: number) => Math.max(1, Math.ceil(seconds / 60));
const hours = (seconds: number) => Math.max(1, Math.ceil(seconds / 3600));
const plural = (count: number, unit: string) => `${count} ${unit}${count === 1 ? "" : "s"}`;

/** The fixed notice for a block. `fallback` is the feature's manual route. */
export function limitMessage(kind: AiLimitKind, retryAfter: number, fallback: string, userCap: number) {
  const midnight = `midnight Singapore time (in about ${plural(hours(retryAfter), "hour")})`;
  switch (kind) {
    case "site":
      return `SpecForge's AI is at capacity right now. Try again in about ${plural(minutes(retryAfter), "minute")}, ${fallback}`;
    case "site_daily":
      return `SpecForge's AI has reached today's limit. It resets at ${midnight}, ${fallback}`;
    case "organisation":
      return `Your organisation has used today's AI allowance. It resets at ${midnight}, ${fallback}`;
    case "user_daily":
      return `You have used today's ${userCap} AI requests. They reset at ${midnight}, ${fallback}`;
  }
}

/** 429 for a shared-limit block. Expected limits are never logged. */
export function limitResponse(
  block: { limit: AiLimitKind; retryAfter: number },
  fallback: string,
  limits: AiLimits,
  extra: Record<string, unknown> = {},
) {
  const response = json(
    {
      error: limitMessage(block.limit, block.retryAfter, fallback, limits.user_per_day),
      limit: block.limit,
      retryAfter: block.retryAfter,
      ...extra,
    },
    429,
  );
  response.headers.set("Retry-After", String(block.retryAfter));
  return response;
}

const organisationUsage = z.object({ used: z.number().int().min(0), resets_at: z.string() });

/** GET /api/organisations/[org]/ai-usage: the organisation's daily total, for its admins only. */
export async function handleOrganisationAiUsage(
  request: Request,
  client: SupabaseClient,
  limits: AiLimits | null | undefined,
): Promise<Response | null> {
  const match = new URL(request.url).pathname.match(/^\/api\/organisations\/([^/]+)\/ai-usage$/);
  if (!match) return null;
  if (request.method !== "GET" || !z.uuid().safeParse(match[1]).success) return error("Not found.", 404);
  const { data, error: failure } = await client.rpc("read_organisation_ai_usage", { target_org: match[1] });
  if (failure?.code === "42501") return error("You no longer have permission for this action.", 403);
  const parsed = organisationUsage.safeParse(data);
  if (failure || !parsed.success) return serviceUnavailable(request, failure ?? parsed.error, "AI usage unavailable.");
  // The kill switch is deliberate, so it is not logged on every admin page load.
  if (!limits) return error("AI is not configured.", 503);
  return json({
    remaining: Math.max(0, limits.org_per_day - parsed.data.used),
    limit: limits.org_per_day,
    resets_at: parsed.data.resets_at,
  });
}
