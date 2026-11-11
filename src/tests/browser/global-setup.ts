import { randomUUID } from "node:crypto";
import { chromium, type FullConfig } from "@playwright/test";

// `next dev` compiles each route, including its client chunks, on the first
// visit. Visit every page once before the tests start, so that compile time is
// not charged to whichever test happens to reach a route first. Dynamic
// segments use random IDs: the page compiles even though it renders an error
// or a sign-in redirect.
const routes = [
  "/", "/sign-in", "/sign-up", "/verify-email", "/workspace", "/profile",
  `/organisations/${randomUUID()}/requests`,
  `/organisations/${randomUUID()}/requests/${randomUUID()}`,
];

export default async function warmUp(config: FullConfig) {
  const baseURL = config.projects[0].use.baseURL!;
  const browser = await chromium.launch();
  try {
    const page = await browser.newPage({ baseURL });
    await page.request.get("/api/account", { failOnStatusCode: false });
    for (const route of routes) await page.goto(route, { waitUntil: "load", timeout: 120_000 });
  } finally {
    await browser.close();
  }
}
