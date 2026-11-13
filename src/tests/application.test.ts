import { describe, expect, it } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createApplication } from "../server/application";

const origin = "http://localhost:3000";
function fixture(
  upstream: typeof fetch = async () => Response.json({ error: "Unexpected upstream request" }, { status: 500 }),
) {
  const requests: string[] = [];
  const client = createClient("http://supabase.invalid", "test-publishable-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: async (input, init) => {
        requests.push(String(input));
        return upstream(input, init);
      },
    },
  });
  return { requests, app: createApplication({ origin, client: () => client }) };
}
function post(path: string, data: unknown, requestOrigin = origin) {
  return new Request(origin + path, {
    method: "POST",
    headers: { origin: requestOrigin, "content-type": "application/json" },
    body: JSON.stringify(data),
  });
}

describe("account and organisation HTTP interface", () => {
  it("requires a session for the invitation inbox and responses", async () => {
    const { app } = fixture();
    expect((await app(new Request(origin + "/api/invitations"))).status).toBe(401);
    expect(
      (await app(post("/api/invitations/11111111-1111-4111-8111-111111111111", { action: "accept" }))).status,
    ).toBe(401);
  });
  it("validates membership input and sanitizes upstream membership failures", async () => {
    const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
    const user = {
      id: "11111111-1111-4111-8111-111111111111",
      email: "pm@example.com",
      email_confirmed_at: "2026-11-07T00:00:00Z",
      app_metadata: {},
      user_metadata: {},
      created_at: "2026-11-07T00:00:00Z",
    };
    const { app, requests } = fixture(async input =>
      String(input).includes("/token")
        ? Response.json({
            access_token: `e30.${payload}.fixture`,
            refresh_token: "local-fixture-refresh",
            expires_in: 3600,
            token_type: "bearer",
            user,
          })
        : String(input).includes("/auth/v1/user")
          ? Response.json(user)
          : Response.json({ code: "XX000", message: "private provider diagnostic" }, { status: 500 }),
    );
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
    expect(await requestFailure.json()).toEqual({
      error: "Request service unavailable. Your text is preserved; check the saved version before retrying.",
    });
  });
  it("looks up an organisation only by its own path, not through invitation paths", async () => {
    const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
    const user = {
      id: "11111111-1111-4111-8111-111111111111",
      email: "pm@example.com",
      email_confirmed_at: "2026-11-07T00:00:00Z",
      app_metadata: {},
      user_metadata: {},
      created_at: "2026-11-07T00:00:00Z",
    };
    const organisation = { id: "22222222-2222-4222-8222-222222222222", name: "Acme" };
    const { app, requests } = fixture(async input =>
      String(input).includes("/token")
        ? Response.json({
            access_token: `e30.${payload}.fixture`,
            refresh_token: "local-fixture-refresh",
            expires_in: 3600,
            token_type: "bearer",
            user,
          })
        : String(input).includes("/auth/v1/user")
          ? Response.json(user)
          : Response.json({ is_admin: true, organisation }),
    );
    await app(post("/api/auth/signin", { email: user.email, password: "a-long-test-password" }));
    const lookups = () => requests.filter(url => url.includes("/organisation_members")).length;
    // The organisation's own path finds it.
    const own = await app(new Request(`${origin}/api/organisations/${organisation.id}`));
    expect(own.status).toBe(200);
    expect(await own.json()).toEqual({ organisation: { ...organisation, isAdmin: true } });
    expect(lookups()).toBe(1);
    // An invitation path that ends in the same id must not reach that lookup.
    for (const path of [`/api/invitations/a/${organisation.id}`, `/api/invitations//x${organisation.id}`]) {
      const response = await app(new Request(origin + path));
      expect(response.status).toBe(404);
      expect(await response.json()).toEqual({ error: "Organisation not found." });
    }
    expect(lookups()).toBe(1);
  });
  it("rejects cross-origin signup before contacting Supabase", async () => {
    const { app, requests } = fixture();
    const response = await app(
      post(
        "/api/auth/signup",
        { email: "pm@example.com", password: "a-long-test-password", role: "PM" },
        "https://attacker.invalid",
      ),
    );
    expect(response.status).toBe(403);
    expect(requests).toEqual([]);
  });
  it.each(["PM", "Developer"])(
    "registers a %s with a lowercase username and asks for email verification",
    async role => {
      let submitted: unknown;
      const { app } = fixture(async (_input, init) => {
        submitted = JSON.parse(String(init?.body));
        return Response.json({
          id: "11111111-1111-4111-8111-111111111111",
          email: "pm@example.com",
          identities: [],
          app_metadata: {},
          user_metadata: { role: "PM" },
          created_at: "2026-11-07T00:00:00Z",
        });
      });
      const response = await app(
        post("/api/auth/signup", {
          email: "pm@example.com",
          password: "a-long-test-password",
          role,
          username: "Atlas_PM",
        }),
      );
      expect(response.status).toBe(202);
      expect(await response.json()).toEqual({
        message:
          "Check your email for a verification link. If no email arrives, try a different username or sign in if you already have an account.",
      });
      expect(submitted).toMatchObject({ email: "pm@example.com", data: { role, username: "atlas_pm" } });
      expect(submitted).not.toHaveProperty("email_confirm");
    },
  );
  it.each([
    [undefined],
    ["a b"],
    ["ab"],
    ["atlas\n"],
    ["équipe"],
    [123],
    ["Legacy_name", "Choose a different username."],
  ])(
    "requires a valid username before contacting Supabase: %j",
    async (username, message = "Choose a username with 3–24 letters, digits or underscores.") => {
      const { app, requests } = fixture();
      const response = await app(
        post("/api/auth/signup", { email: "pm@example.com", password: "a-long-test-password", role: "PM", username }),
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({ error: message });
      expect(requests).toEqual([]);
    },
  );
  it.each([
    [500, "unexpected_failure"],
    [422, "user_already_exists"],
    [422, "email_exists"],
  ])("keeps ambiguous signup responses neutral (%s %s)", async (status, code) => {
    const { app } = fixture(async () =>
      Response.json(
        { code, msg: "private provider diagnostic" },
        { status, headers: { "x-supabase-api-version": "2024-01-01" } },
      ),
    );
    const response = await app(
      post("/api/auth/signup", {
        email: "pm@example.com",
        password: "a-long-test-password",
        role: "PM",
        username: "atlas_pm",
      }),
    );
    expect(response.status).toBe(202);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      message:
        "Check your email for a verification link. If no email arrives, try a different username or sign in if you already have an account.",
    });
  });
  it("rejects malformed verification codes without contacting Supabase", async () => {
    const { app, requests } = fixture();
    const response = await app(post("/api/auth/verify", { email: "pm@example.com", token: "not-a-code" }));
    expect(response.status).toBe(400);
    expect(requests).toEqual([]);
  });
  it("gives the same safe sign-in failure for rejected credentials", async () => {
    const { app } = fixture(async () =>
      Response.json({ code: "invalid_credentials", msg: "sensitive upstream detail" }, { status: 400 }),
    );
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
    { email: "pm@example.com", password: "a-long-test-password", role: "Admin", username: "atlas_pm" },
    {
      email: "pm@example.com",
      password: "a-long-test-password",
      role: "PM",
      username: "atlas_pm",
      email_confirm: true,
    },
    { email: "pm@example.com", password: "short", role: "PM", username: "atlas_pm" },
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
    const { app } = fixture(async () =>
      Response.json({ code: "over_request_rate_limit", msg: "private detail" }, { status: 429 }),
    );
    expect(
      (await app(post("/api/auth/signin", { email: "pm@example.com", password: "a-long-test-password" }))).status,
    ).toBe(429);
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
    const user = {
      id: "11111111-1111-4111-8111-111111111111",
      email: "pm@example.com",
      email_confirmed_at: "2026-11-07T00:00:00Z",
      app_metadata: {},
      user_metadata: {},
      created_at: "2026-11-07T00:00:00Z",
    };
    const { app } = fixture(async input =>
      String(input).includes("/token")
        ? Response.json({
            access_token: `e30.${payload}.fixture`,
            refresh_token: "local-fixture-refresh",
            expires_in: 3600,
            token_type: "bearer",
            user,
          })
        : Response.json({ msg: "private provider detail" }, { status }),
    );
    expect(
      (await app(post("/api/auth/signin", { email: "pm@example.com", password: "a-long-test-password" }))).status,
    ).toBe(200);
    const response = await app(new Request(origin + "/api/account"));
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({
      error:
        status === 429 ? "Too many attempts. Try again later." : "Service temporarily unavailable. Try again later.",
    });
  });
});

describe("organisation overview HTTP interface", () => {
  const org = "22222222-2222-4222-8222-222222222222";
  const member = "33333333-3333-4333-8333-333333333333";
  const overview = {
    totals: { to_do: 2, in_progress: 1, in_review: 1, done: 1, cancelled: 1, overdue: 1, due_soon: 2 },
    mine: { open: 2, overdue: 1 },
    workload: {
      members: [{ user_id: member, username: "dev_one", app_role: "Developer", open: 2, overdue: 1, high: 1 }],
      member_total: 1,
      unassigned: { open: 2, overdue: 0, high: 0 },
    },
  };
  async function signedIn(rpc: (name: string, body: unknown) => Response) {
    const payload = Buffer.from(JSON.stringify({ exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url");
    const user = {
      id: "11111111-1111-4111-8111-111111111111",
      email: "dev@example.com",
      email_confirmed_at: "2026-11-07T00:00:00Z",
      app_metadata: {},
      user_metadata: {},
      created_at: "2026-11-07T00:00:00Z",
    };
    const calls: { name: string; body: unknown }[] = [];
    const { app } = fixture(async (input, init) => {
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
      const name = url.split("/rpc/")[1] ?? "";
      const body = init?.body ? JSON.parse(String(init.body)) : null;
      calls.push({ name, body });
      return rpc(name, body);
    });
    await app(post("/api/auth/signin", { email: user.email, password: "a-long-test-password" }));
    return { app, calls };
  }
  const read = (app: (request: Request) => Promise<Response>, query = "?day=2026-11-13", id = org) =>
    app(new Request(`${origin}/api/organisations/${id}/overview${query}`));

  it("requires a session", async () => {
    const { app } = fixture();
    expect((await read(app)).status).toBe(401);
  });
  it("passes the organisation and viewer's day and returns only the aggregate fields", async () => {
    const leaky = structuredClone(overview) as typeof overview & { extra?: string };
    leaky.extra = "private";
    (leaky.workload.members[0] as Record<string, unknown>).email = "dev@example.com";
    const { app, calls } = await signedIn(() => Response.json(leaky));
    const response = await read(app);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ overview });
    expect(calls).toEqual([{ name: "organisation_overview", body: { target_org: org, viewer_day: "2026-11-13" } }]);
  });
  it("rejects malformed days, ids and methods before calling the database", async () => {
    const { app, calls } = await signedIn(() => Response.json(overview));
    for (const query of ["", "?day=13-11-2026", "?day=2026-11-13&day=2026-11-14", "?day=" + "9".repeat(200)])
      expect((await read(app, query)).status).toBe(400);
    expect((await read(app, "?day=2026-11-13", "not-a-uuid")).status).toBe(404);
    expect((await app(post(`/api/organisations/${org}/overview?day=2026-11-13`, {}))).status).toBe(404);
    expect(calls).toEqual([]);
  });
  it("maps database refusals to safe answers", async () => {
    const answers: Record<string, [number, number]> = { "42501": [403, 403], "22023": [400, 400], XX000: [500, 503] };
    for (const [code, [upstream, expected]] of Object.entries(answers)) {
      const { app } = await signedIn(() =>
        Response.json({ code, message: "private diagnostic" }, { status: upstream }),
      );
      const response = await read(app);
      expect(response.status).toBe(expected);
      expect(JSON.stringify(await response.json())).not.toContain("private diagnostic");
    }
    const { app } = await signedIn(() => Response.json({ totals: "garbled" }));
    expect((await read(app)).status).toBe(503);
  });
});
