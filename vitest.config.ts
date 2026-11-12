import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";
import { playwright } from "@vitest/browser-playwright";

const src = fileURLToPath(new URL("./src", import.meta.url));

export default defineConfig({
  resolve: { alias: { "@": src }, dedupe: ["react", "react-dom"] },
  // Pre-bundle React once so component libraries share a single React copy.
  optimizeDeps: {
    include: [
      "react",
      "react-dom",
      "react-dom/client",
      "react/jsx-runtime",
      "react/jsx-dev-runtime",
      "@daypicker/react",
      "lucide-react",
      "vitest-browser-react",
      "axe-core",
    ],
  },
  test: {
    projects: [
      { extends: true, test: { name: "unit", include: ["src/tests/**/*.test.ts"], testTimeout: 20_000 } },
      {
        extends: true,
        test: {
          name: "component",
          include: ["src/components/**/*.test.tsx"],
          setupFiles: ["src/tests/component-setup.ts"],
          browser: {
            enabled: true,
            headless: true,
            screenshotFailures: false,
            // A UTC+ zone so calendar-date tests catch UTC conversion bugs on any machine.
            provider: playwright({ contextOptions: { timezoneId: "Asia/Singapore" } }),
            viewport: { width: 1280, height: 800 },
            instances: [{ browser: "chromium" }],
          },
        },
      },
    ],
  },
});
