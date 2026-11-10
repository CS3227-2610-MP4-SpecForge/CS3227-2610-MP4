import { execFileSync, spawnSync } from "node:child_process";
const cli = new URL("../../node_modules/.bin/supabase", import.meta.url).pathname;
const browser = ["browser", "requests-browser", "delivery-browser", "layout-browser"].includes(process.argv[2]);
const profile = process.argv[2] === "profile";
const requests = process.argv[2] === "requests";
const chat = process.argv[2] === "chat";
const ticketMigration = process.argv[2] === "ticket-migration";
const delivery = process.argv[2] === "delivery";
const testPlans = process.argv[2] === "test-plans";
const migration = process.argv[2] === "migration";
const browserFilter = process.argv[3];
if (process.argv.length > 4 || browserFilter && (!browser || browserFilter.length > 160) || (process.argv[2] && !browser && !profile && !requests && !migration && !chat && !delivery && !ticketMigration && !testPlans)) throw new Error("Unsupported test mode.");
let status;
try { status = JSON.parse(execFileSync(cli, ["status", "--workdir", "src", "-o", "json"], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] })); }
catch { console.error("Local Supabase is unavailable. Run npm run db:start first."); process.exit(1); }
if (status.API_URL !== "http://127.0.0.1:55321") throw new Error("Tests only target the disposable SpecForge local stack.");
const result = spawnSync(process.execPath, browser ? ["node_modules/@playwright/test/cli.js", "test", ...(browserFilter ? ["--grep", browserFilter] : []), ...(process.argv[2] === "requests-browser" ? ["src/tests/browser/requests.spec.ts"] : process.argv[2] === "delivery-browser" ? ["src/tests/browser/delivery.spec.ts"] : process.argv[2] === "layout-browser" ? ["src/tests/browser/ticket-layout.spec.ts"] : [])] : ["node_modules/vitest/vitest.mjs", "run", ...(profile ? ["src/tests/profile.database.test.ts"] : ticketMigration ? ["src/tests/ticket-migration.database.test.ts"] : delivery ? ["src/tests/delivery.database.test.ts"] : chat ? ["src/tests/chat.database.test.ts"] : testPlans ? ["src/tests/test-plans.database.test.ts"] : migration ? ["src/tests/migration.database.test.ts"] : requests ? ["src/tests/requests.database.test.ts"] : ["src/tests/profile.database.test.ts", "src/tests/database.test.ts", "src/tests/requests.database.test.ts", "src/tests/chat.database.test.ts", "src/tests/delivery.database.test.ts", "src/tests/test-plans.database.test.ts"])], {
  stdio: "inherit", env: { ...process.env, SPECFORGE_LOCAL_TESTS: "1", SPECFORGE_TICKET_MIGRATION_TEST: ticketMigration ? "1" : "0", SPECFORGE_LOCAL_AI_FAKE: browser ? "1" : "0", SUPABASE_SECRET_KEY: status.SERVICE_ROLE_KEY, SPECFORGE_MIGRATION_TEST: migration ? "1" : "0", APP_ORIGIN: browser ? (process.env.SPECFORGE_BROWSER_ORIGIN ?? "http://localhost:3000") : "http://localhost:3000", NEXT_PUBLIC_SUPABASE_URL: status.API_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: status.PUBLISHABLE_KEY ?? status.ANON_KEY, LOCAL_SUPABASE_URL: status.API_URL, LOCAL_SUPABASE_ANON_KEY: status.ANON_KEY, LOCAL_SUPABASE_SERVICE_KEY: status.SERVICE_ROLE_KEY, LOCAL_SUPABASE_JWT_SECRET: status.JWT_SECRET },
});
process.exit(result.status ?? 1);
