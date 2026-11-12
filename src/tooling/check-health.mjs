// Post-deploy release check: polls <site>/api/health until it reports the
// expected commit with a reachable database and configured AI, or fails after
// the deadline. Used by .github/workflows/deploy.yml and runnable locally:
//   node src/tooling/check-health.mjs https://specforge-dev.vercel.app <sha> [seconds]
const [site, expected, seconds = "180"] = process.argv.slice(2);
if (
  !site ||
  !/^https?:\/\/[^/?#]+$/.test(site) ||
  !/^[0-9a-f]{40}$/.test(expected ?? "") ||
  !/^\d{1,4}$/.test(seconds)
) {
  console.error("Usage: check-health.mjs <site origin> <40-character commit SHA> [seconds]");
  process.exit(2);
}
const deadline = Date.now() + Number(seconds) * 1000;
const url = `${site}/api/health`;
let last = "no answer yet";
for (let attempt = 1; ; attempt++) {
  try {
    const response = await fetch(url, { cache: "no-store", redirect: "error", signal: AbortSignal.timeout(10_000) });
    const body = await response.json().catch(() => null);
    // Only the endpoint's fixed fields are echoed; nothing else from the response.
    const field = name => (typeof body?.[name] === "string" && /^[\w.-]{1,40}$/.test(body[name]) ? body[name] : "?");
    last = `HTTP ${response.status}, revision ${field("revision")}, database ${field("database")}, ai ${field("ai")}`;
    if (
      response.status === 200 &&
      body?.revision === expected &&
      body?.database === "ok" &&
      body?.ai === "configured"
    ) {
      console.log(`Release check passed on attempt ${attempt}: ${last}.`);
      process.exit(0);
    }
  } catch (failure) {
    last = failure?.name === "TimeoutError" ? "request timed out" : "request failed";
  }
  console.log(`Attempt ${attempt}: ${last}.`);
  if (Date.now() + 5000 > deadline) break;
  await new Promise(resolve => setTimeout(resolve, 5000));
}
const why = last.includes(`revision ${expected}`)
  ? "the release is answering but is not healthy"
  : /revision [0-9a-f]{40}|revision unknown/.test(last)
    ? "a different build is still answering"
    : "the health check did not answer";
console.error(`::error::Release check failed for ${site}: ${why} (expected revision ${expected}; last: ${last}).`);
process.exit(1);
