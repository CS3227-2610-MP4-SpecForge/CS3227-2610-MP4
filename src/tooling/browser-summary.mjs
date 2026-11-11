// Writes a Markdown summary of a Playwright JSON report: totals, then every
// failed and flaky (passed only on retry) test. Used for the CI job summary.
import { existsSync, readFileSync } from "node:fs";

const file = process.argv[2];
if (!file || !existsSync(file)) {
  console.log("Browser tests produced no JSON report.");
  process.exit(0);
}
const report = JSON.parse(readFileSync(file, "utf8"));
const tests = [];
const walk = suite => {
  for (const child of suite.suites ?? []) walk(child);
  for (const spec of suite.specs ?? []) for (const test of spec.tests) tests.push({ name: `${spec.file}:${spec.line} › ${spec.title}`, status: test.status });
};
for (const suite of report.suites ?? []) walk(suite);
const { expected = 0, unexpected = 0, flaky = 0, skipped = 0, duration = 0 } = report.stats ?? {};
console.log("## Browser tests\n");
console.log(`${expected} passed, ${unexpected} failed, ${flaky} flaky, ${skipped} skipped in ${(duration / 60000).toFixed(1)} min.\n`);
for (const [status, label] of [["unexpected", "Failed"], ["flaky", "Flaky (passed on retry; investigate)"]]) {
  const matching = tests.filter(test => test.status === status);
  if (!matching.length) continue;
  console.log(`### ${label}\n`);
  for (const test of matching) console.log(`- ${test.name}`);
  console.log("");
}
