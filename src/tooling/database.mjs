import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
const action = process.argv[2];
const cli = new URL("../../node_modules/.bin/supabase", import.meta.url).pathname;
if (process.argv.length !== 3 || !["start", "stop", "reset", "env"].includes(action)) {
  console.error("Use db:start, db:stop, db:reset or db:env without additional arguments. These target only local SpecForge."); process.exit(1);
}
if (action === "env") {
  try {
    const status = JSON.parse(execFileSync(cli, ["status", "--workdir", "src", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }));
    if (status.API_URL !== "http://127.0.0.1:55321") throw new Error("Unexpected local target.");
    if (!status.SERVICE_ROLE_KEY) throw new Error("Local worker configuration unavailable.");
    const managed = new Map(Object.entries({ APP_ORIGIN: "http://localhost:3000", NEXT_PUBLIC_SUPABASE_URL: status.API_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY ?? status.ANON_KEY, SUPABASE_SECRET_KEY: status.SERVICE_ROLE_KEY }));
    const seen = new Set();
    const previous = existsSync(".env.local") ? readFileSync(".env.local", "utf8") : "# Generated disposable local Supabase configuration. Never commit.\n";
    const lines = previous.trimEnd().split("\n").map(line => {
      const name = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=/)?.[1];
      if (!name || !managed.has(name)) return line;
      seen.add(name); return `${name}=${managed.get(name)}`;
    });
    for (const [name, value] of managed) if (!seen.has(name)) lines.push(`${name}=${value}`);
    const temporary = `.env.local.${process.pid}.tmp`;
    writeFileSync(temporary, lines.join("\n") + "\n", { mode: 0o600, flag: "wx" });
    renameSync(temporary, ".env.local");
    console.log("Updated ignored local Supabase configuration and server-only AI worker key. Other settings and .env were preserved.");
  } catch { console.error("Local Supabase configuration unavailable; no credentials printed."); process.exit(1); }
} else {
  const args = action === "reset" ? ["db", "reset", "--local", "--workdir", "src"] : [action, "--workdir", "src"];
  const result = spawnSync(cli, args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], timeout: 300_000, maxBuffer: 16 * 1024 * 1024 });
  // CLI output can contain generated credentials, so nothing is relayed verbatim.
  // On failure the reason still has to reach the operator: a fully suppressed
  // error leaves CI unable to tell a transient image pull from a real fault, so
  // the tail of the output is relayed with credential-shaped values redacted.
  if (result.status !== 0) {
    console.error(`Local Supabase ${action} failed. Check Docker and src/supabase/config.toml.`);
    if (result.error) console.error(`Reason: ${result.error.code === "ETIMEDOUT" ? "the command exceeded its 300s limit" : result.error.code}.`);
    const redact = line => line
      .replace(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/g, "[redacted-token]")
      .replace(/\b(?:sbp|sb_publishable|sb_secret|sb)_[A-Za-z0-9_-]{8,}/g, "[redacted-key]")
      .replace(/(:\/\/[^:\s]+:)[^@\s]+@/g, "$1[redacted]@")
      .replace(/\b[A-Za-z0-9_-]{40,}\b/g, "[redacted-value]");
    const tail = [result.stdout ?? "", result.stderr ?? ""].join("\n").split(/\r?\n/).map(line => line.trimEnd()).filter(Boolean).slice(-20);
    if (tail.length > 0) console.error(["Provider output (credential-shaped values redacted):", ...tail.map(redact)].join("\n"));
    process.exit(1);
  }
  console.log(`Local Supabase ${action} succeeded. Credentials suppressed.`);
}
