import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createApplication } from "../server/application";

const origin = "http://localhost:3000";
function fixture(upstream: typeof fetch = async () => Response.json({ error: "Unexpected upstream request" }, { status: 500 })) {
  const requests: string[] = [];
  const client = createClient("http://supabase.invalid", "test-publishable-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (input, init) => {
      requests.push(String(input));
      return upstream(input, init);
    } },
  });
  return { requests, app: createApplication({ origin, client: () => client }) };
}
function post(path: string, data: unknown, requestOrigin = origin) {
  return new Request(origin + path, { method: "POST", headers: { origin: requestOrigin, "content-type": "application/json" }, body: JSON.stringify(data) });
}

describe("account and organisation HTTP interface", () => {
  it("requires a session for the invitation inbox and responses", async () => {
    const { app } = fixture();
    expect((await app(new Request(origin + "/api/invitations"))).status).toBe(401);
    expect((await app(post("/api/invitations/11111111-1111-4111-8111-111111111111", { action: "accept" }))).status).toBe(401);
  });
  it("validates membership input and sanitizes upstream membership failures", async () => {
    const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
    const user = { id: "11111111-1111-4111-8111-111111111111", email: "pm@example.com", email_confirmed_at: "2026-11-07T00:00:00Z", app_metadata: {}, user_metadata: {}, created_at: "2026-11-07T00:00:00Z" };
    const { app, requests } = fixture(async input => String(input).includes("/token")
      ? Response.json({ access_token: `e30.${payload}.fixture`, refresh_token: "local-fixture-refresh", expires_in: 3600, token_type: "bearer", user })
      : String(input).includes("/auth/v1/user") ? Response.json(user)
      : Response.json({ code: "XX000", message: "private provider diagnostic" }, { status: 500 }));
    await app(post("/api/auth/signin", { email: user.email, password: "a-long-test-password" }));
    const path = `/api/organisations/${user.id}/invitations`;
    expect((await app(post(path, { email: "bad", recipient_id: user.id }))).status).toBe(400);
    expect((await app(post("/api/invitations/not-an-id", { action: "accept" }))).status).toBe(404);
    expect(requests.filter(url => url.includes("/rpc/"))).toHaveLength(0);
    const response = await app(post(path, { email: "recipient@example.com" }));
    expect(response.status).toBe(503);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ error: "Membership service unavailable. Try again later." });
    const requestFailure = await app(post(`/api/organisations/${user.id}/requests`, { creationKey: user.id }));
    expect(requestFailure.status).toBe(503);
    expect(await requestFailure.json()).toEqual({ error: "Request service unavailable. Your text is preserved; check the saved version before retrying." });
  });
  it("rejects cross-origin signup before contacting Supabase", async () => {
    const { app, requests } = fixture();
    const response = await app(post("/api/auth/signup", { email: "pm@example.com", password: "a-long-test-password", role: "PM" }, "https://attacker.invalid"));
    expect(response.status).toBe(403);
    expect(requests).toEqual([]);
  });
  it("registers a selected role and asks the user to verify their email", async () => {
    let submitted: unknown;
    const { app } = fixture(async (_input, init) => {
      submitted = JSON.parse(String(init?.body));
      return Response.json({ id: "11111111-1111-4111-8111-111111111111", email: "pm@example.com", identities: [], app_metadata: {}, user_metadata: { role: "PM" }, created_at: "2026-11-07T00:00:00Z" });
    });
    const response = await app(post("/api/auth/signup", { email: "pm@example.com", password: "a-long-test-password", role: "PM" }));
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ message: "Check your email for a verification code." });
    expect(submitted).toMatchObject({ email: "pm@example.com", data: { role: "PM" } });
    expect(submitted).not.toHaveProperty("email_confirm");
  });
  it("rejects malformed verification codes without contacting Supabase", async () => {
    const { app, requests } = fixture();
    const response = await app(post("/api/auth/verify", { email: "pm@example.com", token: "not-a-code" }));
    expect(response.status).toBe(400);
    expect(requests).toEqual([]);
  });
  it("gives the same safe sign-in failure for rejected credentials", async () => {
    const { app } = fixture(async () => Response.json({ code: "invalid_credentials", msg: "sensitive upstream detail" }, { status: 400 }));
    const response = await app(post("/api/auth/signin", { email: "pm@example.com", password: "a-long-test-password" }));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Email or password is incorrect, or email is not verified." });
  });
  it("requires a session for organisation listing and creation", async () => {
    const { app } = fixture();
    expect((await app(new Request(origin + "/api/organisations"))).status).toBe(401);
    expect((await app(post("/api/organisations", { name: "My team" }))).status).toBe(401);
  });
  it("lets an already signed-out browser sign out safely and returns a private response", async () => {
    const { app } = fixture();
    const response = await app(post("/api/auth/signout", {}));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
  });
  it("resends a verification code without revealing whether an account exists", async () => {
    const { app } = fixture(async () => Response.json({}));
    const response = await app(post("/api/auth/resend", { email: "pm@example.com" }));
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ message: "If this account needs verification, a new code has been sent." });
  });
  it.each([
    { email: "pm@example.com", password: "a-long-test-password", role: "Admin" },
    { email: "pm@example.com", password: "a-long-test-password", role: "PM", email_confirm: true },
    { email: "pm@example.com", password: "short", role: "PM" },
  ])("rejects invalid signup fields before contacting Supabase: %j", async body => {
    const { app, requests } = fixture();
    expect((await app(post("/api/auth/signup", body))).status).toBe(400);
    expect(requests).toEqual([]);
  });
  it("bounds request bodies even when Content-Length is absent", async () => {
    const { app, requests } = fixture();
    expect((await app(post("/api/auth/signup", { value: "x".repeat(9000) }))).status).toBe(413);
    expect(requests).toEqual([]);
  });
  it("maps provider throttling to a safe retryable state", async () => {
    const { app } = fixture(async () => Response.json({ code: "over_request_rate_limit", msg: "private detail" }, { status: 429 }));
    expect((await app(post("/api/auth/signin", { email: "pm@example.com", password: "a-long-test-password" }))).status).toBe(429);
  });
  it("bounds repeated authentication attempts before contacting the provider", async () => {
    const { app, requests } = fixture(async () => Response.json({}));
    for (let attempt = 0; attempt < 30; attempt++) await app(post("/api/auth/resend", { email: "pm@example.com" }));
    const response = await app(post("/api/auth/resend", { email: "pm@example.com" }));
    expect(response.status).toBe(429);
    expect(requests).toHaveLength(30);
  });
  it("distinguishes provider outages from invalid credentials without exposing details", async () => {
    const { app } = fixture(async () => Response.json({ msg: "sensitive provider diagnostic" }, { status: 503 }));
    const response = await app(post("/api/auth/signin", { email: "pm@example.com", password: "a-long-test-password" }));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "Service temporarily unavailable. Try again later." });
  });
  it.each([503, 429])("keeps a protected workspace recoverable when session verification returns %s", async status => {
    const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
    const user = { id: "11111111-1111-4111-8111-111111111111", email: "pm@example.com", email_confirmed_at: "2026-11-07T00:00:00Z", app_metadata: {}, user_metadata: {}, created_at: "2026-11-07T00:00:00Z" };
    const { app } = fixture(async input => String(input).includes("/token")
      ? Response.json({ access_token: `e30.${payload}.fixture`, refresh_token: "local-fixture-refresh", expires_in: 3600, token_type: "bearer", user })
      : Response.json({ msg: "private provider detail" }, { status }));
    expect((await app(post("/api/auth/signin", { email: "pm@example.com", password: "a-long-test-password" }))).status).toBe(200);
    const response = await app(new Request(origin + "/api/account"));
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: status === 429 ? "Too many attempts. Try again later." : "Service temporarily unavailable. Try again later." });
  });
});
