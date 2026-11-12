// Triggers a Render deploy of one exact commit and waits until it is live.
// Used by .github/workflows/deploy.yml; RENDER_API_KEY and RENDER_SERVICE_ID
// come from the environment so neither appears on a command line or in a log:
//   RENDER_API_KEY=… RENDER_SERVICE_ID=srv-… node src/tooling/render-deploy.mjs <sha> [seconds]
// Only Render's fixed status words and the deploy ID are printed, never a
// response body, which could echo configuration.
const [commit, seconds = "900"] = process.argv.slice(2);
const key = process.env.RENDER_API_KEY ?? "";
const service = process.env.RENDER_SERVICE_ID ?? "";
if (!/^[0-9a-f]{40}$/.test(commit ?? "") || !/^\d{1,4}$/.test(seconds)) {
  console.error("Usage: render-deploy.mjs <40-character commit SHA> [seconds]");
  process.exit(2);
}
if (!key || !/^srv-[a-z0-9]+$/.test(service)) {
  console.error("::error::RENDER_API_KEY and a RENDER_SERVICE_ID of the form srv-… must be set.");
  process.exit(2);
}

const api = `https://api.render.com/v1/services/${service}/deploys`;
const headers = { Authorization: `Bearer ${key}`, Accept: "application/json" };
const word = value => (typeof value === "string" && /^[\w-]{1,40}$/.test(value) ? value : "?");
const LIVE = "live";
const FAILED = new Set(["build_failed", "update_failed", "pre_deploy_failed", "canceled", "deactivated"]);

const call = async (url, init = {}) => {
  const response = await fetch(url, {
    ...init,
    headers: { ...headers, ...init.headers },
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json().catch(() => null);
  return { status: response.status, body };
};

// Render answers 201 with the deploy, or 202 with no body when it queues the
// deploy behind one already running. Either way the deploy is found by commit.
const requestedAt = Date.now();
const started = await call(api, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ commitId: commit, clearCache: "do_not_clear" }),
}).catch(failure => {
  // A timed-out request may still have created a deploy; the dashboard shows it.
  const why = failure?.name === "TimeoutError" ? "timed out" : "failed";
  console.error(`::error::The Render deploy request ${why}; check the Render dashboard before re-running.`);
  process.exit(1);
});
if (started.status !== 201 && started.status !== 202) {
  const hint =
    started.status === 401 || started.status === 403
      ? "check RENDER_API_KEY"
      : started.status === 404
        ? "check RENDER_SERVICE_ID"
        : "see the Render dashboard";
  console.error(`::error::Render refused the deploy (HTTP ${started.status}); ${hint}.`);
  process.exit(1);
}
let id = word(started.body?.id) === "?" ? "" : started.body.id;

const find = async () => {
  const { status, body } = await call(`${api}?limit=10`);
  if (status !== 200 || !Array.isArray(body)) return "";
  // A re-run of the same commit must not settle on an earlier deploy of it, so
  // only deploys created after this request count (with a minute for clock skew).
  const match = body
    .map(item => item?.deploy ?? item)
    .find(deploy => deploy?.commit?.id === commit && Date.parse(deploy?.createdAt) >= requestedAt - 60_000);
  return word(match?.id) === "?" ? "" : match.id;
};

const deadline = Date.now() + Number(seconds) * 1000;
let last = "not found yet";
for (let attempt = 1; ; attempt++) {
  try {
    if (!id) id = await find();
    if (id) {
      const { status, body } = await call(`${api}/${id}`);
      last = status === 200 ? word(body?.status) : `HTTP ${status}`;
      if (last === LIVE) {
        console.log(`Render deploy ${id} of ${commit} is live.`);
        process.exit(0);
      }
      if (FAILED.has(last)) {
        console.error(
          `::error::Render deploy ${id} ended as ${last}; open it in the Render dashboard for the build log.`,
        );
        process.exit(1);
      }
    }
  } catch (failure) {
    last = failure?.name === "TimeoutError" ? "request timed out" : "request failed";
  }
  if (attempt % 4 === 1) console.log(`Waiting for Render deploy ${id || "(not listed yet)"}: ${last}.`);
  if (Date.now() + 15_000 > deadline) break;
  await new Promise(resolve => setTimeout(resolve, 15_000));
}
console.error(`::error::Render deploy of ${commit} was not live within ${seconds} seconds (last status: ${last}).`);
process.exit(1);
