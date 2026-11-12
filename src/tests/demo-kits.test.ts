import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { createApplication } from "../server/application";
import { createDemoKitAdmission, demoKitCaps, type DemoKitAdmin, type Reservation } from "../server/demo-kits";

const origin = "http://localhost:3000";
const path = "/api/demo-kits";
const unusedClient = () =>
  createClient("http://supabase.invalid", "test-publishable-key", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async () => Response.json({ error: "Unexpected upstream request" }, { status: 500 }) },
  });

let logged: MockInstance<typeof console.error>;
let warned: MockInstance<typeof console.warn>;
let info: MockInstance<typeof console.log>;
beforeEach(() => {
  logged = vi.spyOn(console, "error").mockImplementation(() => {});
  warned = vi.spyOn(console, "warn").mockImplementation(() => {});
  info = vi.spyOn(console, "log").mockImplementation(() => {});
});
afterEach(() => {
  logged.mockRestore();
  warned.mockRestore();
  info.mockRestore();
});
const consoleText = () =>
  [...logged.mock.calls, ...warned.mock.calls, ...info.mock.calls].map(call => call.map(String).join(" ")).join("\n");

type Created = {
  email: string;
  password: string;
  user_metadata: { role: string; username: string };
  app_metadata: { demo_kit: string };
};
function fakeAdmin(failOn?: "PM" | "Developer", failDelete = 0) {
  const created: (Created & { id: string })[] = [];
  const deleted: { id: string; soft: boolean | undefined }[] = [];
  let deleteFailures = failDelete;
  const admin = {
    async createUser(attributes: Created & { email_confirm: boolean }) {
      expect(attributes.email_confirm).toBe(true);
      if (attributes.user_metadata.role === failOn) {
        // GoTrue errors echo the address; it must never reach the log.
        const failure = Object.assign(new Error(`Database error creating ${attributes.email}`), {
          __isAuthError: true,
          status: 500,
          code: "unexpected_failure",
        });
        return { data: { user: null }, error: failure };
      }
      const id = `0000000${created.length}-0000-4000-8000-000000000000`;
      created.push({ ...attributes, id });
      return { data: { user: { id } }, error: null };
    },
    async deleteUser(id: string, soft?: boolean) {
      if (deleteFailures-- > 0) return { data: { user: null }, error: new Error("transient") };
      deleted.push({ id, soft });
      return { data: { user: null }, error: null };
    },
  } as unknown as DemoKitAdmin;
  return { admin, created, deleted };
}

function app(
  options: {
    reserve?: () => Promise<Reservation>;
    admin?: () => DemoKitAdmin;
    admitLocal?: () => { admitted: true } | { admitted: false; retryAfter: number };
  } = {},
) {
  return createApplication({
    origin,
    client: unusedClient,
    demoKits: {
      reserve: options.reserve ?? (async () => ({ admitted: true })),
      admin: options.admin ?? (() => fakeAdmin().admin),
      admitLocal: options.admitLocal ?? (() => ({ admitted: true })),
    },
  });
}
function request(method = "POST", body: string | undefined = "{}", headers: Record<string, string> = {}) {
  return new Request(origin + path, {
    method,
    headers: { origin, "content-type": "application/json", ...headers },
    body: method === "GET" || method === "HEAD" ? undefined : body,
  });
}

describe("demo kit endpoint", () => {
  it("creates a verified PM and Developer with random credentials and returns them once", async () => {
    const fake = fakeAdmin();
    const response = await app({ admin: () => fake.admin })(request());
    expect(response.status).toBe(201);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const { kit } = await response.json();
    expect(kit.accounts.map((account: { role: string }) => account.role)).toEqual(["PM", "Developer"]);
    const code = fake.created[0].app_metadata.demo_kit;
    expect(code).toMatch(/^[0-9a-f]{32}$/);
    expect(fake.created[1].app_metadata.demo_kit).toBe(code);
    expect(kit.accounts[0]).toEqual({
      role: "PM",
      email: `demo-pm-${code}@example.com`,
      username: `demo_pm_${code.slice(0, 8)}`,
      password: fake.created[0].password,
    });
    expect(kit.accounts[1]).toEqual({
      role: "Developer",
      email: `demo-dev-${code}@example.com`,
      username: `demo_dev_${code.slice(0, 8)}`,
      password: fake.created[1].password,
    });
    for (const account of kit.accounts) expect(account.password).toMatch(/^[A-Za-z0-9_-]{32}$/);
    expect(kit.accounts[0].password).not.toBe(kit.accounts[1].password);
    const second = fakeAdmin();
    await app({ admin: () => second.admin })(request());
    expect(second.created[0].app_metadata.demo_kit).not.toBe(code);
  });

  it("refuses other methods, foreign origins and non-empty bodies before any reservation", async () => {
    const reserve = vi.fn(async (): Promise<Reservation> => ({ admitted: true }));
    const handle = app({ reserve });
    expect((await handle(request("GET"))).status).toBe(405);
    expect((await handle(request("PUT"))).status).toBe(405);
    expect((await handle(request("POST", "{}", { origin: "https://evil.example" }))).status).toBe(403);
    expect((await handle(new Request(origin + path, { method: "POST", body: "{}" }))).status).toBe(403);
    expect((await handle(request("POST", "{}", { "content-type": "text/plain" }))).status).toBe(415);
    expect((await handle(request("POST", '{"x":1}'))).status).toBe(400);
    expect((await handle(request("POST", "not json"))).status).toBe(400);
    expect(reserve).not.toHaveBeenCalled();
  });

  it("names the full window with Retry-After and creates no account", async () => {
    for (const limit of ["burst", "daily"] as const) {
      const fake = fakeAdmin();
      const admin = vi.fn(() => fake.admin);
      const response = await app({
        reserve: async () => ({ admitted: false, limit, retryAfter: 125 }),
        admin,
      })(request());
      expect(response.status).toBe(429);
      expect(response.headers.get("retry-after")).toBe("125");
      expect(await response.json()).toEqual({ error: "Demo kit limit reached.", limit, retryAfter: 125 });
      expect(admin).not.toHaveBeenCalled();
    }
  });

  it("sheds load per process before the database, as a burst limit", async () => {
    const reserve = vi.fn(async (): Promise<Reservation> => ({ admitted: true }));
    const response = await app({ reserve, admitLocal: () => ({ admitted: false, retryAfter: 40 }) })(request());
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("40");
    expect(await response.json()).toMatchObject({ limit: "burst", retryAfter: 40 });
    expect(reserve).not.toHaveBeenCalled();
  });

  it("answers 503 without touching accounts when the reservation or configuration fails", async () => {
    for (const reserve of [
      async (): Promise<Reservation> => {
        throw new Error("Demo kits not configured.");
      },
      async (): Promise<Reservation> => {
        throw Object.assign(new Error("connection refused"), { code: "ECONNREFUSED" });
      },
    ]) {
      const admin = vi.fn(() => fakeAdmin().admin);
      const response = await app({ reserve, admin })(request());
      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({ error: "Demo kit service is temporarily unavailable. Try again." });
      expect(admin).not.toHaveBeenCalled();
    }
  });

  it("removes the PM account when the Developer account fails, and returns no credentials", async () => {
    const fake = fakeAdmin("Developer", 1);
    const response = await app({ admin: () => fake.admin })(request());
    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body).toEqual({ error: "Demo kit service is temporarily unavailable. Try again." });
    expect(fake.deleted).toEqual([{ id: fake.created[0].id, soft: false }]);
    const code = fake.created[0].app_metadata.demo_kit;
    const log = consoleText();
    expect(log).toContain('"route":"/api/demo-kits"');
    for (const secret of [code, fake.created[0].email, fake.created[0].password, "@example.com"])
      expect(log).not.toContain(secret);
  });

  it("deletes nothing when the PM account itself fails", async () => {
    const fake = fakeAdmin("PM");
    const response = await app({ admin: () => fake.admin })(request());
    expect(response.status).toBe(503);
    expect(fake.created).toEqual([]);
    expect(fake.deleted).toEqual([]);
    expect(consoleText()).not.toContain("@example.com");
  });
});

describe("demo kit limits", () => {
  it("reads the caps, defaulting to 5 and 30 and refusing anything else", () => {
    expect(demoKitCaps({})).toEqual({ burst: 5, daily: 30 });
    expect(demoKitCaps({ DEMO_KITS_PER_10_MINUTES: "2", DEMO_KITS_PER_DAY: "10" })).toEqual({ burst: 2, daily: 10 });
    for (const env of [
      { DEMO_KITS_PER_10_MINUTES: "6" },
      { DEMO_KITS_PER_DAY: "31" },
      { DEMO_KITS_PER_DAY: "1.5" },
      { DEMO_KITS_PER_DAY: "-1" },
      { DEMO_KITS_PER_10_MINUTES: "" },
      { DEMO_KITS_PER_10_MINUTES: "0" },
      { DEMO_KITS_PER_DAY: "0" },
    ])
      expect(demoKitCaps(env)).toBeNull();
  });

  it("admits ten kit requests per process per minute", () => {
    let now = Date.UTC(2026, 10, 12, 0, 0, 20);
    const admit = createDemoKitAdmission(() => now);
    for (let i = 0; i < 10; i++) expect(admit()).toEqual({ admitted: true });
    expect(admit()).toEqual({ admitted: false, retryAfter: 40 });
    now += 40_000;
    expect(admit()).toEqual({ admitted: true });
  });
});

describe("reserved demo usernames", () => {
  it("refuses a demo_ name at public signup before contacting Auth", async () => {
    const upstream = vi.fn(async () => Response.json({}, { status: 200 }));
    const client = createClient("http://supabase.invalid", "test-publishable-key", {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { fetch: upstream },
    });
    const handle = createApplication({ origin, client: () => client });
    const response = await handle(
      new Request(origin + "/api/auth/signup", {
        method: "POST",
        headers: { origin, "content-type": "application/json" },
        body: JSON.stringify({
          email: "a@example.com",
          password: "a-long-test-password",
          role: "PM",
          username: "Demo_pm_1",
        }),
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "Choose a different username." });
    expect(upstream).not.toHaveBeenCalled();
  });
});
