// Regenerates the User Guide screenshots in docs/images/ against the local
// stack and the fake AI. Needs `npm run db:start` first; pass
// SPECFORGE_BROWSER_ORIGIN=http://localhost:3001 if your own dev server holds
// port 3000. Environment setup and the local-only guard live in test-local.mjs.
import { spawnSync } from "node:child_process";

const runner = new URL("./test-local.mjs", import.meta.url).pathname;
const result = spawnSync(process.execPath, [runner, "screenshots"], { stdio: "inherit" });
process.exit(result.status ?? 1);
