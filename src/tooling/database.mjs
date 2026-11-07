import { execFileSync, spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
const action = process.argv[2];
const cli = new URL("../../node_modules/.bin/supabase", import.meta.url).pathname;
if (process.argv.length !== 3 || !["start", "stop", "reset", "env"].includes(action)) {
  console.error("Use db:start, db:stop, db:reset or db:env without additional arguments. These target only local SpecForge."); process.exit(1);
}
if (action === "env") {
  try {
    const status = JSON.parse(execFileSync(cli, ["status", "--workdir", "src", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
    if (status.API_URL !== "http://127.0.0.1:55321") throw new Error("Unexpected local target.");
    writeFileSync(".env.local", `# Generated disposable local Supabase configuration. Never commit.\nAPP_ORIGIN=http://localhost:3000\nNEXT_PUBLIC_SUPABASE_URL=${status.API_URL}\nNEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=${status.PUBLISHABLE_KEY ?? status.ANON_KEY}\n`, { mode: 0o600 });
    console.log("Wrote ignored .env.local for disposable local Supabase. .env was not modified.");
  } catch { console.error("Local Supabase configuration unavailable; no credentials printed."); process.exit(1); }
} else {
  const args = action === "reset" ? ["db", "reset", "--local", "--workdir", "src"] : [action, "--workdir", "src"];
  const result = spawnSync(cli, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 300_000, maxBuffer: 16 * 1024 * 1024 });
  // CLI success and error output can contain generated credentials. Never relay it.
  if (result.status !== 0) { console.error(`Local Supabase ${action} failed. Check Docker and src/supabase/config.toml; provider output suppressed.`); process.exit(1); }
  console.log(`Local Supabase ${action} succeeded. Credentials suppressed.`);
}
