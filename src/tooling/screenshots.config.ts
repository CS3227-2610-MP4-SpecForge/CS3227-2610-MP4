import { defineConfig, devices } from "@playwright/test";
import base from "../../playwright.config";

// Regenerates the User Guide screenshots in docs/images/. It reuses the browser
// suite's local server and fake AI but runs only screenshots.spec.ts, so the
// screenshots never join `npm run test:e2e`. Run it through `npm run screenshots`.
const viewport = { width: 1280, height: 800 };
export default defineConfig({
  ...base,
  testDir: ".",
  testMatch: "screenshots.spec.ts",
  globalSetup: "../tests/browser/global-setup.ts",
  outputDir: "../../test-results/screenshots",
  retries: 0,
  reporter: [["list"]],
  // A project's device settings override top-level `use`, so the viewport is set here.
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"], viewport } }],
  webServer: { ...base.webServer!, cwd: "../.." },
});
