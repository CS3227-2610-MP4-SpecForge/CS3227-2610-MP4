import { defineConfig, devices } from "@playwright/test";
const origin = process.env.SPECFORGE_BROWSER_ORIGIN ?? "http://localhost:3000";
const port = new URL(origin).port;
if (!["http://localhost:3000", "http://localhost:3001"].includes(origin)) throw new Error("Browser tests require the disposable local app.");
export default defineConfig({
  testDir: "./src/tests/browser", fullyParallel: false, workers: 1,
  timeout: 60_000, expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["list"], ["html", { open: "never" }]] : "list",
  use: { baseURL: origin, trace: "off" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `npm run dev -- --hostname 127.0.0.1 --port ${port}`,
    url: origin, reuseExistingServer: false, timeout: 60_000,
  },
});
