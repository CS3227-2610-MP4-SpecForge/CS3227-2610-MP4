import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createApplication, createAuthAdmission } from "./application";
const admitAuth = createAuthAdmission();

// Each external HTTP request has one deadline and no automatic transport retries.
const boundedFetch: typeof fetch = (input, init) => fetch(input, {
  ...init, cache: "no-store",
  signal: init?.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000),
});

export async function handleRequest(request: Request) {
  const origin = process.env.APP_ORIGIN ?? (process.env.NODE_ENV !== "production" ? "http://localhost:3000" : "");
  const configurationUnavailable = () => Response.json({ error: "Service temporarily unavailable. Try again later." }, { status: 503, headers: { "Cache-Control": "private, no-store" } });
  try {
    const parsed = new URL(origin);
    if (parsed.origin !== origin || !["http:", "https:"].includes(parsed.protocol) || (process.env.NODE_ENV === "production" && parsed.protocol !== "https:")) return configurationUnavailable();
  } catch { return configurationUnavailable(); }
  const jar = await cookies();
  const staged = new Map<string, { name: string; value: string; options: import("@supabase/ssr").CookieOptions }>();
  let client: ReturnType<typeof createServerClient> | undefined;
  const response = await createApplication({ origin, admitAuth, client() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error("Account service not configured.");
    return client ??= createServerClient(url, key, {
      cookieOptions: { httpOnly: true, secure: origin.startsWith("https://"), sameSite: "lax", path: "/" },
      global: { fetch: boundedFetch },
      db: { retry: false },
      cookies: {
        getAll: () => [...new Map([...jar.getAll(), ...staged.values()].map(cookie => [cookie.name, cookie])).values()].map(({ name, value }) => ({ name, value })),
        setAll: values => { for (const cookie of values) staged.set(cookie.name, cookie); },
      },
    });
  } })(request);
  const result = new NextResponse(response.body, { status: response.status, headers: response.headers });
  for (const cookie of staged.values()) result.cookies.set(cookie.name, cookie.value, cookie.options);
  return result;
}
