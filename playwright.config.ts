import { defineConfig, devices } from "@playwright/test";
const origin = process.env.SPECFORGE_BROWSER_ORIGIN ?? "http://localhost:3000";
const port = new URL(origin).port;
if (!["http://localhost:3000", "http://localhost:3001"].includes(origin)) throw new Error("Browser tests require the disposable local app.");
// SPECFORGE_TIMING_FILE adds a JSON report used to compare suite timings.
const timing = process.env.SPECFORGE_TIMING_FILE;
// SPECFORGE_BROWSER_WORKERS is a measurement knob for trying parallel runs.
const workers = Number(process.env.SPECFORGE_BROWSER_WORKERS ?? 1);
export default defineConfig({
  testDir: "./src/tests/browser", fullyParallel: workers > 1, workers,
  globalSetup: "./src/tests/browser/global-setup.ts",
  timeout: 60_000, expect: { timeout: 10_000 },
  // CI retries once to capture a trace; a test that needs the retry is reported
  // as flaky in the job summary, not hidden. Local runs never retry.
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ["list"],
    ...(process.env.CI ? [["html", { open: "never" }] as const, ["json", { outputFile: "playwright-report/results.json" }] as const] : []),
    ...(timing ? [["json", { outputFile: timing }] as const] : []),
  ],
  use: { baseURL: origin, trace: process.env.CI ? "on-first-retry" : "off" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    url: origin, reuseExistingServer: false, timeout: 60_000,
  },
});
