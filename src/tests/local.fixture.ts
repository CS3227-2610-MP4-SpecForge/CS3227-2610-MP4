import { execFileSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

export const localEnabled = process.env.SPECFORGE_LOCAL_TESTS === "1";

/** Empties the demo-kit creation windows on the disposable local stack only; no API can do this. */
export function resetLocalDemoKitWindows() {
  if (process.env.LOCAL_SUPABASE_URL !== "http://127.0.0.1:55321")
    throw new Error("Only disposable local Supabase is allowed.");
  execFileSync(
    "docker",
    ["exec", "supabase_db_specforge", "psql", "-U", "postgres", "-qtAc", "truncate private.demo_kit_windows"],
    { stdio: ["ignore", "ignore", "pipe"] },
  );
}
export function localFixture() {
  const url = process.env.LOCAL_SUPABASE_URL;
  if (url !== "http://127.0.0.1:55321") throw new Error("Only disposable local Supabase is allowed.");
  const options = { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } };
  const admin = createClient(url, process.env.LOCAL_SUPABASE_SERVICE_KEY!, options);
  const ids = new Set<string>();
  const client = () => createClient(url, process.env.LOCAL_SUPABASE_ANON_KEY!, options);
  async function deleteActor(id: string) {
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) throw new Error("Local fixture cleanup failed.");
    ids.delete(id);
  }
  return {
    admin,
    client,
    deleteActor,
    unverifiedSession(id: string) {
      const encoded = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
      const now = Math.floor(Date.now() / 1000);
      const body = `${encoded({ alg: "HS256", typ: "JWT" })}.${encoded({ sub: id, role: "authenticated", aud: "authenticated", iat: now, exp: now + 300 })}`;
      const token = `${body}.${createHmac("sha256", process.env.LOCAL_SUPABASE_JWT_SECRET!).update(body).digest("base64url")}`;
      return createClient(url, process.env.LOCAL_SUPABASE_ANON_KEY!, { ...options, accessToken: async () => token });
    },
    async actor(role: "PM" | "Developer", confirmed = true, email = `test-${randomUUID()}@example.com`) {
      const username = `member_${randomUUID().replaceAll("-", "").slice(0, 16)}`;
      const password = "Disposable-test-password-2026";
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: confirmed,
        user_metadata: { role, username },
      });
      if (error || !data.user) throw new Error("Local fixture identity creation failed.");
      ids.add(data.user.id);
      const session = client();
      if (confirmed) {
        const { error: failure } = await session.auth.signInWithPassword({ email, password });
        if (failure) throw new Error("Local fixture login failed.");
      }
      return { client: session, id: data.user.id, email, password, username };
    },
    async cleanup() {
      for (const id of ids) await deleteActor(id);
    },
  };
}
