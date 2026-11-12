import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

// runtime.ts is a Next.js server module; replace the framework-only imports.
vi.mock("server-only", () => ({}));
const cookies = vi.hoisted(() => vi.fn());
vi.mock("next/headers", () => ({ cookies }));

import { handleRequest } from "../server/runtime";

const org = "22222222-2222-4222-8222-222222222222";
const sentinelEmail = "sentinel.person@example.com";

let logged: MockInstance<typeof console.error>;
beforeEach(() => { logged = vi.spyOn(console, "error").mockImplementation(() => {}); cookies.mockClear(); });
afterEach(() => { logged.mockRestore(); vi.unstubAllEnvs(); });

describe("runtime configuration failure logging", () => {
  it.each([
    ["is not a URL", "not a url"],
    ["is not a bare origin", "https://specforge.example/path"],
    ["uses a non-HTTP scheme", "ftp://specforge.example"],
  ])("logs one allowlisted line when APP_ORIGIN %s", async (_case, value) => {
    vi.stubEnv("APP_ORIGIN", value);
    const request = new Request(`https://specforge.example/api/organisations/${org}/requests?email=${sentinelEmail}`, {
      method: "POST", headers: { cookie: `sb=${sentinelEmail}`, "content-type": "application/json" }, body: JSON.stringify({ email: sentinelEmail }),
    });
    const response = await handleRequest(request);
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await response.json()).toEqual({ error: "Service temporarily unavailable. Try again later." });
    expect(cookies).not.toHaveBeenCalled();
    expect(logged).toHaveBeenCalledTimes(1);
    const line = logged.mock.calls[0].map(String).join(" ");
    expect(JSON.parse(line)).toEqual({ event: "server_failure", method: "POST", route: "/api/organisations/:id/requests", status: 503, error: "None" });
    for (const secret of [sentinelEmail, org, value]) expect(line).not.toContain(secret);
  });
});
