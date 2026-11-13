import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createApplication } from "../server/application";
import { aiLimits, limitMessage, socPauseSeconds } from "../server/ai-limits";
import { AiFailure, createSocProvider } from "../server/soc";
import { testAiLimits } from "./local.fixture";

// Server half of the shared AI limits: configuration, SoC pause seconds and
// the 429 responses (workflow/specs/2026-11-13-site-wide-ai-limit.md).
const origin = "http://localhost:3000";
const org = "22222222-2222-4222-8222-222222222222";
const user = {
  id: "11111111-1111-4111-8111-111111111111",
  email: "limits@example.com",
  email_confirmed_at: "2026-11-07T00:00:00Z",
  app_metadata: {},
  user_metadata: {},
  created_at: "2026-11-07T00:00:00Z",
};

let logged: MockInstance<typeof console.error>;
beforeEach(() => {
  logged = vi.spyOn(console, "error").mockImplementation(() => {});
});
afterEach(() => logged.mockRestore());

function request(path: string, data?: unknown) {
  return new Request(origin + path, {
    method: data === undefined ? "GET" : "POST",
    headers: { origin, "content-type": "application/json" },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
}
// A signed-in session whose RPCs answer from `rpc(name)`.
async function signedIn(rpc: (name: string) => Response, extra: Partial<Parameters<typeof createApplication>[0]>) {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
  const client = createClient("http://supabase.invalid", "test-publishable-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: async input => {
        const url = String(input);
        if (url.includes("/token"))
          return Response.json({
            access_token: `e30.${payload}.fixture`,
            refresh_token: "fixture",
            expires_in: 3600,
            token_type: "bearer",
            user,
          });
        if (url.includes("/auth/v1/user")) return Response.json(user);
        return rpc(url.split("/rpc/")[1] ?? "");
      },
    },
  });
  const app = createApplication({ origin, client: () => client, ...extra });
  await app(request("/api/auth/signin", { email: user.email, password: "a-long-test-password" }));
  return app;
}
const chatBody = { key: org, revision: 1, fields: { title: "", description: "" }, intent: "edit", message: "Help" };
const planBody = { key: org, revision: 1, fields: { title: "T", description: "D" } };
const turn = {
  id: org,
  request_id: org,
  organisation_id: org,
  author_id: user.id,
  turn_key: org,
  base_revision: 1,
  input_fields: { title: "", description: "" },
  message: "Help",
  status: "running",
  generation: 1,
  lease_until: "2099-01-01T00:00:00Z",
  reply: null,
  proposal: null,
  error_code: null,
  created_at: "2026-11-13T00:00:00Z",
  intent: "edit",
};
const usage = {
  remaining: 19,
  limit: 20,
  resets_at: "2026-11-13T01:00:00Z",
  daily_used: 3,
  daily_resets_at: "2026-11-13T16:00:00Z",
};
const sessionRpc = (name: string) =>
  name === "read_ai_usage"
    ? Response.json(usage)
    : name === "read_test_plan"
      ? Response.json({ saved: null, turns: [] })
      : Response.json([]);
const blockedWorker = (message: string, details: string) =>
  ({ rpc: async () => ({ data: null, error: { code: "PT429", message, details } }) }) as unknown as SupabaseClient;

describe("AI limit configuration", () => {
  it("uses the defaults when nothing is set", () => {
    expect(aiLimits({})).toEqual({
      concurrent: 4,
      per_minute: 20,
      site_per_day: 200,
      org_per_day: 80,
      user_per_day: 40,
    });
  });
  it("accepts whole numbers up to each maximum", () => {
    expect(
      aiLimits({
        AI_SITE_CONCURRENT: "8",
        AI_SITE_PER_MINUTE: "60",
        AI_SITE_PER_DAY: "1000",
        AI_ORG_PER_DAY: "500",
        AI_USER_PER_DAY: "200",
      }),
    ).toEqual(testAiLimits);
  });
  it.each([
    ["AI_SITE_CONCURRENT", "0"],
    ["AI_SITE_CONCURRENT", "9"],
    ["AI_SITE_PER_MINUTE", "61"],
    ["AI_SITE_PER_DAY", "1001"],
    ["AI_ORG_PER_DAY", "201"],
    ["AI_USER_PER_DAY", "81"],
    ["AI_SITE_PER_MINUTE", ""],
    ["AI_SITE_PER_MINUTE", " 5"],
    ["AI_SITE_PER_MINUTE", "1e1"],
    ["AI_SITE_PER_MINUTE", "0x10"],
    ["AI_SITE_PER_MINUTE", "-1"],
    ["AI_SITE_PER_MINUTE", "2.5"],
  ])("turns AI off for %s=%j", (name, value) => {
    expect(aiLimits({ [name]: value })).toBeNull();
  });
});

describe("SoC pause seconds", () => {
  it.each([
    [null, 60],
    ["120", 120],
    ["1", 5],
    ["9999", 600],
    ["Wed, 21 Oct 2026 07:28:00 GMT", 60],
    ["-5", 60],
    ["1.5", 60],
    ["0x20", 60],
  ])("reads Retry-After %j as %i seconds", (header, seconds) => {
    expect(socPauseSeconds(header)).toBe(seconds);
  });
  it("is carried by a 429 or 503 SoC failure only", async () => {
    const provider = (status: number, headers: Record<string, string> = {}) =>
      createSocProvider(
        { baseUrl: "https://soclaas-api.comp.nus.edu.sg/v1", key: "test-key", model: "qwen3.5:9b" },
        async () => new Response("{}", { status, headers }),
      )({ intent: "edit", fields: { title: "", description: "" }, message: "Hi", recent: [] });
    await expect(provider(429, { "retry-after": "90" })).rejects.toMatchObject({ pauseSeconds: 90 });
    await expect(provider(503)).rejects.toMatchObject({ pauseSeconds: 60 });
    await expect(provider(502, { "retry-after": "90" })).rejects.toMatchObject({ pauseSeconds: undefined });
  });
});

describe("limit messages", () => {
  it("rounds waits up and never shows zero", () => {
    expect(limitMessage("site", 15, "or plan manually.", 40)).toBe(
      "SpecForge's AI is at capacity right now. Try again in about 1 minute, or plan manually.",
    );
    expect(limitMessage("site", 121, "or plan manually.", 40)).toContain("about 3 minutes");
    expect(limitMessage("user_daily", 3601, "or keep editing manually.", 40)).toBe(
      "You have used today's 40 AI requests. They reset at midnight Singapore time (in about 2 hours), or keep editing manually.",
    );
    expect(limitMessage("organisation", 10, "x", 40)).toContain("in about 1 hour)");
    expect(limitMessage("site_daily", 7200, "x", 40)).toContain("SpecForge's AI has reached today's limit");
  });
});

describe("limit responses", () => {
  it.each([
    ["AI site limit reached", "site", "15"],
    ["AI site daily limit reached", "site_daily", "3600"],
    ["AI organisation limit reached", "organisation", "3600"],
    ["AI user daily limit reached", "user_daily", "3600"],
  ])("answers a chat %s with 429, Retry-After and usage, and logs nothing", async (message, limit, details) => {
    const provider = vi.fn();
    const app = await signedIn(sessionRpc, {
      chat: { worker: () => blockedWorker(message, details), provider },
      aiLimits: testAiLimits,
    });
    logged.mockClear();
    const response = await app(request(`/api/organisations/${org}/requests/${org}/chat`, chatBody));
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe(details);
    const body = await response.json();
    expect(body).toMatchObject({ limit, retryAfter: Number(details) });
    expect(body.error).toMatch(/or keep editing manually\.$/);
    expect(body.usage.daily).toEqual({ remaining: 197, limit: 200, resets_at: usage.daily_resets_at });
    expect(provider).not.toHaveBeenCalled();
    expect(logged).not.toHaveBeenCalled();
  });

  it("answers a test-plan block with the planning fallback", async () => {
    const app = await signedIn(sessionRpc, {
      testPlans: { worker: () => blockedWorker("AI site limit reached", "40"), provider: vi.fn() },
      aiLimits: testAiLimits,
    });
    const response = await app(request(`/api/organisations/${org}/requests/${org}/test-plan`, planBody));
    expect(response.status).toBe(429);
    expect(await response.json()).toMatchObject({
      limit: "site",
      retryAfter: 40,
      error: expect.stringMatching(/or plan manually\.$/),
    });
  });

  it("keeps other database 429s as before, and treats a malformed wait as no shared-limit block", async () => {
    const app = await signedIn(sessionRpc, {
      chat: { worker: () => blockedWorker("AI site limit reached", "soon"), provider: vi.fn() },
      aiLimits: testAiLimits,
    });
    const body = await (await app(request(`/api/organisations/${org}/requests/${org}/chat`, chatBody))).json();
    expect(body.limit).toBeUndefined();
  });

  it("refuses every AI request when configuration turns AI off", async () => {
    const provider = vi.fn();
    const worker = vi.fn();
    const app = await signedIn(sessionRpc, {
      chat: { worker, provider },
      testPlans: { worker, provider },
      aiLimits: null,
    });
    expect((await app(request(`/api/organisations/${org}/requests/${org}/chat`, chatBody))).status).toBe(503);
    expect((await app(request(`/api/organisations/${org}/requests/${org}/test-plan`, planBody))).status).toBe(503);
    expect(worker).not.toHaveBeenCalled();
    expect(provider).not.toHaveBeenCalled();
  });

  it("records a SoC pause only for a 429/503 failure", async () => {
    const finishes: Record<string, unknown>[] = [];
    const worker = {
      rpc: async (name: string, args: Record<string, unknown>) => {
        if (name === "begin_chat_turn") return { data: { turn, dispatch: true, history: [] }, error: null };
        finishes.push(args);
        return {
          data: { ...turn, status: "failed", error_code: "upstream_http", diagnostic: args.failure_diagnostic },
          error: null,
        };
      },
    } as unknown as SupabaseClient;
    for (const status of [429, 502]) {
      const provider = async () => {
        throw new AiFailure("upstream_http", { source: "upstream_http", elapsed_ms: 5, http_status: status }, 90);
      };
      const app = await signedIn(sessionRpc, { chat: { worker: () => worker, provider }, aiLimits: testAiLimits });
      expect((await app(request(`/api/organisations/${org}/requests/${org}/chat`, chatBody))).status).toBe(200);
    }
    expect(finishes.map(args => args.pause_seconds)).toEqual([90, null]);
  });
});

describe("organisation AI usage", () => {
  const read = async (rpc: (name: string) => Response, limits = testAiLimits as typeof testAiLimits | null) =>
    (await signedIn(rpc, { aiLimits: limits }))(request(`/api/organisations/${org}/ai-usage`));
  it("adds the configured cap to the organisation's own count", async () => {
    const response = await read(() => Response.json({ used: 52, resets_at: "2026-11-13T16:00:00Z" }));
    expect(await response.json()).toEqual({ remaining: 448, limit: 500, resets_at: "2026-11-13T16:00:00Z" });
  });
  it("refuses non-admins and unknown paths without a count", async () => {
    const refused = await read(() => Response.json({ code: "42501", message: "Not allowed" }, { status: 403 }));
    expect(refused.status).toBe(403);
    expect(await refused.json()).not.toHaveProperty("remaining");
    const app = await signedIn(sessionRpc, { aiLimits: testAiLimits });
    expect((await app(request("/api/organisations/not-a-uuid/ai-usage"))).status).toBe(404);
  });
  it("is unavailable when configuration turns AI off", async () => {
    expect((await read(() => Response.json({ used: 1, resets_at: "2026-11-13T16:00:00Z" }), null)).status).toBe(503);
  });
});

describe("SoC busy text", () => {
  it("is calm for a SoC 429 or 503 and keeps other upstream details", async () => {
    const { describeAiFailure } = await import("../ai-diagnostics");
    for (const status of [429, 503])
      expect(describeAiFailure("upstream_http", { source: "upstream_http", elapsed_ms: 5, http_status: status })).toBe(
        "SoC is busy right now. Your message is saved; try again in a minute or two.",
      );
    expect(describeAiFailure("upstream_http", { source: "upstream_http", elapsed_ms: 5, http_status: 502 })).toContain(
      "SoC returned HTTP 502",
    );
  });
});
