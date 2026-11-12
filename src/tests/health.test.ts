import { describe, expect, it, vi } from "vitest";
import { createApplication } from "../server/application";
import { createDatabaseProbe, healthResponse } from "../server/health";
import { socConfigured } from "../server/soc";

const sha = "0123456789abcdef0123456789abcdef01234567";
const secretUrl = "http://127.0.0.1:55321";
const secretKey = "sb_publishable_SENTINEL-KEY-4c1d";
const model = "qwen3.5:9b";

async function read(response: Response) {
  const text = await response.text();
  return { status: response.status, cache: response.headers.get("Cache-Control"), text, body: JSON.parse(text) };
}

describe("health response", () => {
  it("reports a healthy release with its revision", async () => {
    const result = await read(await healthResponse({ revision: sha, database: async () => true, ai: () => true }));
    expect(result.status).toBe(200);
    expect(result.cache).toBe("private, no-store");
    expect(result.body).toEqual({ status: "ok", revision: sha, database: "ok", ai: "configured" });
    for (const value of [secretKey, secretUrl, model]) expect(result.text).not.toContain(value);
  });
  it("returns 503 when the database is unreachable", async () => {
    const result = await read(await healthResponse({ revision: sha, database: async () => false, ai: () => true }));
    expect(result.status).toBe(503);
    expect(result.body).toEqual({ status: "unavailable", revision: sha, database: "unavailable", ai: "configured" });
  });
  it("treats a throwing database probe as unavailable", async () => {
    const result = await read(
      await healthResponse({
        revision: sha,
        database: async () => {
          throw new Error(`down at ${secretUrl}`);
        },
        ai: () => true,
      }),
    );
    expect(result.status).toBe(503);
    expect(result.text).not.toContain(secretUrl);
  });
  it("reports missing AI configuration without failing the check", async () => {
    const result = await read(await healthResponse({ revision: sha, database: async () => true, ai: () => false }));
    expect(result.status).toBe(200);
    expect(result.body.ai).toBe("missing");
  });
  it("reports an absent or malformed revision as unknown rather than echoing it", async () => {
    for (const revision of ["", `${secretKey}`, sha.toUpperCase(), sha + "0"]) {
      const result = await read(await healthResponse({ revision, database: async () => true, ai: () => true }));
      expect(result.body.revision).toBe("unknown");
      expect(result.text).not.toContain(secretKey);
    }
  });
});

describe("AI configuration check", () => {
  const base = "https://soclaas-api.comp.nus.edu.sg/v1";
  it("needs the SoC URL, a key and an enabled model", () => {
    expect(socConfigured({ baseUrl: base, key: "k", model })).toBe(true);
    expect(socConfigured({ baseUrl: base, key: "k", model: "gemma4:26b" })).toBe(true);
    expect(socConfigured({ baseUrl: base, key: "", model })).toBe(false);
    expect(socConfigured({ baseUrl: base, key: "k", model: "gpt-unknown" })).toBe(false);
    expect(socConfigured({ baseUrl: "https://elsewhere.example/v1", key: "k", model })).toBe(false);
  });
});

describe("database probe", () => {
  it("calls the public health function with the publishable key and a deadline", async () => {
    const transport = vi.fn<typeof fetch>(async () => Response.json(true));
    expect(await createDatabaseProbe(secretUrl, secretKey, transport)()).toBe(true);
    const [url, init] = transport.mock.calls[0];
    expect(url).toBe(`${secretUrl}/rest/v1/rpc/health_check`);
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("apikey")).toBe(secretKey);
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });
  it("is unavailable on an error status, a wrong answer, a network failure or missing settings", async () => {
    expect(
      await createDatabaseProbe(secretUrl, secretKey, async () =>
        Response.json({ code: "PGRST002" }, { status: 503 }),
      )(),
    ).toBe(false);
    expect(await createDatabaseProbe(secretUrl, secretKey, async () => Response.json(null))()).toBe(false);
    expect(
      await createDatabaseProbe(secretUrl, secretKey, async () => {
        throw new TypeError("fetch failed");
      })(),
    ).toBe(false);
    expect(await createDatabaseProbe(undefined, secretKey, async () => Response.json(true))()).toBe(false);
    expect(await createDatabaseProbe(secretUrl, undefined, async () => Response.json(true))()).toBe(false);
  });
  it("gives up after its deadline", async () => {
    const hang: typeof fetch = (_input, init) =>
      new Promise((_resolve, reject) => init?.signal?.addEventListener("abort", () => reject(init.signal?.reason)));
    expect(await createDatabaseProbe(secretUrl, secretKey, hang, 50)()).toBe(false);
  });
});

describe("health route", () => {
  const origin = "http://localhost:3000";
  const noClient = () => {
    throw new Error("The health check must not use the session client.");
  };
  it("serves GET /api/health without a session or origin header", async () => {
    const health = vi.fn(async () => healthResponse({ revision: sha, database: async () => true, ai: () => true }));
    const app = createApplication({ origin, client: noClient, health });
    const result = await read(await app(new Request(origin + "/api/health")));
    expect(result.status).toBe(200);
    expect(result.body).toEqual({ status: "ok", revision: sha, database: "ok", ai: "configured" });
    expect(health).toHaveBeenCalledTimes(1);
  });
  it("keeps the origin check for other methods", async () => {
    const health = vi.fn(async () => healthResponse({ revision: sha, database: async () => true, ai: () => true }));
    const app = createApplication({ origin, client: noClient, health });
    expect((await app(new Request(origin + "/api/health", { method: "POST" }))).status).toBe(403);
    expect(health).not.toHaveBeenCalled();
  });
  it("is not found when no health check is configured", async () => {
    const app = createApplication({ origin, client: noClient });
    expect((await app(new Request(origin + "/api/health"))).status).toBe(404);
  });
});
