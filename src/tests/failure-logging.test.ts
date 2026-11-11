import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { createApplication } from "../server/application";
import { AiFailure } from "../server/soc";
import { logFailure } from "../server/http";

const origin = "http://localhost:3000";
const org = "22222222-2222-4222-8222-222222222222";
const sentinelEmail = "sentinel.person@example.com";
const sentinelText = "SENTINEL-TICKET-TEXT-7f3a";

let logged: MockInstance<typeof console.error>;
beforeEach(() => { logged = vi.spyOn(console, "error").mockImplementation(() => {}); });
afterEach(() => { logged.mockRestore(); });
const lines = () => logged.mock.calls.map(call => call.map(String).join(" "));

function post(path: string, data: unknown) {
  return new Request(origin + path, { method: "POST", headers: { origin, "content-type": "application/json", cookie: `sb=${sentinelEmail}` }, body: JSON.stringify(data) });
}

const user = { id: "11111111-1111-4111-8111-111111111111", email: sentinelEmail, email_confirmed_at: "2026-11-07T00:00:00Z", app_metadata: {}, user_metadata: {}, created_at: "2026-11-07T00:00:00Z" };
// A signed-in session whose database answers every RPC with `rpc`.
async function signedIn(rpc: () => Response, extra: Partial<Parameters<typeof createApplication>[0]> = {}) {
  const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
  const client = createClient("http://supabase.invalid", "test-publishable-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async input => String(input).includes("/token")
      ? Response.json({ access_token: `e30.${payload}.fixture`, refresh_token: "local-fixture-refresh", expires_in: 3600, token_type: "bearer", user })
      : String(input).includes("/auth/v1/user") ? Response.json(user) : rpc() },
  });
  const app = createApplication({ origin, client: () => client, ...extra });
  await app(post("/api/auth/signin", { email: sentinelEmail, password: "a-long-test-password" }));
  logged.mockClear();
  return app;
}
const leak = () => Response.json({ code: "XX000", message: `duplicate ${sentinelEmail}`, details: sentinelText, hint: sentinelText }, { status: 500 });
function expectNoSentinel() {
  for (const line of lines()) for (const value of [sentinelEmail, sentinelText, org, user.id]) expect(line).not.toContain(value);
}

describe("server failure logging", () => {
  it("logs one allowlisted line when an unexpected exception reaches the catch-all", async () => {
    class ConfigurationBroken extends Error {}
    const app = createApplication({ origin, client: () => { throw new ConfigurationBroken(`no client for ${sentinelEmail}: ${sentinelText}`); } });
    const response = await app(post(`/api/organisations/${org}/requests`, { creationKey: org, title: sentinelText, email: sentinelEmail }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Service temporarily unavailable. Try again later." });
    expect(logged).toHaveBeenCalledTimes(1);
    expect(JSON.parse(lines()[0])).toEqual({
      event: "server_failure", method: "POST", route: "/api/organisations/:id/requests", status: 503, error: "ConfigurationBroken",
    });
    for (const line of lines()) {
      expect(line).not.toContain(sentinelEmail);
      expect(line).not.toContain(sentinelText);
      expect(line).not.toContain(org);
    }
  });
  it("logs the database code, not its message, when a request RPC fails", async () => {
    const app = await signedIn(leak);
    const response = await app(post(`/api/organisations/${org}/requests`, { creationKey: org }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Request service unavailable. Your text is preserved; check the saved version before retrying." });
    expect(logged).toHaveBeenCalledTimes(1);
    expect(JSON.parse(lines()[0])).toMatchObject({ event: "server_failure", method: "POST", route: "/api/organisations/:id/requests", status: 503, code: "XX000" });
    expectNoSentinel();
  });
  it("logs an AI provider failure with its code and allowlisted diagnostic only", async () => {
    const turn = {
      id: org, request_id: org, organisation_id: org, developer_id: user.id, turn_key: org, base_revision: 1,
      input_fields: { title: sentinelText, description: sentinelText }, focus: sentinelText, status: "running", generation: 1,
      lease_until: "2099-01-01T00:00:00Z", reply: null, plan: null, error_code: null, diagnostic: null, created_at: "2026-11-12T00:00:00Z",
    };
    const worker = { rpc: async (name: string) => name === "begin_test_plan_turn"
      ? { data: { turn, dispatch: true }, error: null }
      : { data: { ...turn, status: "failed", error_code: "upstream_http", diagnostic: { source: "upstream_http", elapsed_ms: 1200, http_status: 502 } }, error: null } } as unknown as SupabaseClient;
    const provider = async () => { throw new AiFailure("upstream_http", { source: "upstream_http", elapsed_ms: 1200, http_status: 502 }); };
    const app = await signedIn(() => Response.json({ saved: null, turns: [] }), { testPlans: { worker: () => worker, provider } });
    const response = await app(post(`/api/organisations/${org}/requests/${org}/test-plan`, { key: org, revision: 1, fields: { title: sentinelText, description: sentinelText }, focus: sentinelText }));
    expect(response.status).toBe(200);
    expect(logged).toHaveBeenCalledTimes(1);
    expect(JSON.parse(lines()[0])).toEqual({
      event: "server_failure", method: "POST", route: "/api/organisations/:id/requests/:id/test-plan", error: "AiFailure", code: "upstream_http",
      diagnostic: { source: "upstream_http", elapsed_ms: 1200, http_status: 502 },
    });
    expectNoSentinel();
  });
  it("logs an unexpected chat provider exception by class name only", async () => {
    const turn = {
      id: org, request_id: org, organisation_id: org, author_id: user.id, turn_key: org, base_revision: 1,
      input_fields: { title: sentinelText, description: sentinelText }, message: sentinelText, status: "running", generation: 1,
      lease_until: "2099-01-01T00:00:00Z", reply: null, proposal: null, error_code: null, created_at: "2026-11-12T00:00:00Z", intent: "edit",
    };
    const worker = { rpc: async (name: string) => name === "begin_chat_turn"
      ? { data: { turn, dispatch: true, history: [] }, error: null }
      : { data: { ...turn, status: "failed", error_code: "unavailable" }, error: null } } as unknown as SupabaseClient;
    const provider = async () => { throw new TypeError(`${sentinelEmail} ${sentinelText}`); };
    const app = await signedIn(() => Response.json([]), { chat: { worker: () => worker, provider } });
    const response = await app(post(`/api/organisations/${org}/requests/${org}/chat`, { key: org, revision: 1, fields: { title: sentinelText, description: sentinelText }, intent: "edit", message: sentinelText }));
    expect(response.status).toBe(200);
    expect(lines().map(line => JSON.parse(line))).toEqual([
      { event: "server_failure", method: "POST", route: "/api/organisations/:id/requests/:id/chat", error: "TypeError" },
    ]);
    expectNoSentinel();
  });
  it("logs nothing for expected 4xx outcomes", async () => {
    const anonymous = createApplication({ origin, client: () => createClient("http://supabase.invalid", "k", { auth: { persistSession: false }, global: { fetch: async () => Response.json({ msg: "no session" }, { status: 401 }) } }) });
    expect((await anonymous(new Request(origin + "/api/organisations"))).status).toBe(401);
    expect((await anonymous(new Request(origin + `/api/zzz/${sentinelEmail}`))).status).toBe(404);
    expect((await anonymous(post("/api/auth/signup", { email: sentinelEmail }))).status).toBe(400);
    expect((await anonymous(post("/api/auth/signup", { value: "x".repeat(9000) }))).status).toBe(413);
    expect((await anonymous(new Request(origin + "/api/auth/signup", { method: "POST", headers: { origin: "https://attacker.invalid" } }))).status).toBe(403);
    const denied = await signedIn(() => Response.json({ code: "42501", message: sentinelText }, { status: 403 }));
    expect((await denied(post(`/api/organisations/${org}/requests`, { creationKey: org }))).status).toBe(403);
    const changed = await signedIn(() => Response.json({ code: "P0001", message: sentinelText }, { status: 400 }));
    expect((await changed(post(`/api/organisations/${org}/requests`, { creationKey: org }))).status).toBe(409);
    expect((await changed(new Request(origin + "/api/organisations/not-an-id/requests"))).status).toBe(404);
    const throttled = createApplication({ origin, client: () => createClient("http://supabase.invalid", "k", { auth: { persistSession: false }, global: { fetch: async () => Response.json({ code: "over_request_rate_limit", msg: sentinelText }, { status: 429 }) } }) });
    expect((await throttled(post("/api/auth/signin", { email: sentinelEmail, password: "a-long-test-password" }))).status).toBe(429);
    expect(logged).not.toHaveBeenCalled();
  });
  it.each([
    [`/api/organisations/${sentinelEmail}/members`, "/api/organisations/:id/members"],
    [`/api/organisations/${org}/requests/${org}/chat?q=${sentinelText}`, "/api/organisations/:id/requests/:id/chat"],
    [`/api/organisations/a%0a${sentinelText}%2fb/requests`, "/api/organisations/:id/requests"],
    [`/api/${sentinelText}/x`, "/:unknown"],
    [`/${sentinelText}`, "/:unknown"],
    [`/api/organisations/${"a/".repeat(20)}`, "/:unknown"],
    ["/API/ORGANISATIONS", "/:unknown"],
  ])("reduces %s to a fixed route pattern", (path, route) => {
    logFailure(new Request(origin + path, { method: "BREW" }), new Error(sentinelText), { status: 503 });
    expect(JSON.parse(lines()[0])).toEqual({ event: "server_failure", method: "OTHER", route, status: 503, error: "Error" });
    expectNoSentinel();
  });
  it("never lets a hostile failure object leak text, split the line or throw", () => {
    const request = new Request(origin + "/api/account");
    const hostile = [
      Object.assign(new Error(sentinelText), { code: `bad\n${sentinelText} code`, status: 500, details: sentinelEmail, hint: sentinelEmail, cause: sentinelEmail }),
      { constructor: { name: `Evil\n${sentinelText}` }, code: "PGRST301", status: 418 },
      new Proxy({}, { get() { throw new Error(sentinelText); } }),
      sentinelText, null, 42,
    ];
    for (const failure of hostile) logFailure(request, failure, { status: 503, diagnostic: { source: "network", elapsed_ms: 5, extra: sentinelText } });
    expect(lines().map(line => JSON.parse(line))).toEqual([
      { event: "server_failure", method: "GET", route: "/api/account", status: 503, error: "Error" },
      { event: "server_failure", method: "GET", route: "/api/account", status: 503, error: "Unknown", code: "PGRST301" },
      { event: "server_failure", method: "GET", route: "/api/account", status: 503, error: "Unknown" },
      { event: "server_failure", method: "GET", route: "/api/account", status: 503, error: "Unknown" },
      { event: "server_failure", method: "GET", route: "/api/account", status: 503, error: "Unknown" },
      { event: "server_failure", method: "GET", route: "/api/account", status: 503, error: "Unknown" },
    ]);
    for (const line of lines()) expect(line).not.toMatch(/[\n\r\u2028]/);
    expectNoSentinel();
  });
});
