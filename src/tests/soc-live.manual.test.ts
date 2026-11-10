import { describe, expect, it } from "vitest";
import { createSocProvider } from "../server/soc";
import { createTestPlanProvider } from "../server/test-plan-ai";
import { testCaseKinds, testPlanLimits } from "../test-plans";

// Opt-in only. This is the one suite that spends real SoC LLM quota, so it is
// gated on an explicit flag as well as a key and never runs in CI:
//   SPECFORGE_LIVE_AI=1 npx vitest run src/tests/soc-live.manual.test.ts
// Two calls per run, one per role feature. See the developer guide.
const configuration = {
  baseUrl: process.env.SOCLAAS_BASE_URL ?? "",
  key: process.env.SOCLAAS_API_KEY ?? "",
  model: process.env.SOCLAAS_CHAT_MODEL ?? "",
};
const enabled = process.env.SPECFORGE_LIVE_AI === "1" && configuration.key !== "" && configuration.model !== "";

const fields = {
  title: "Persist the ticket list filters across reloads",
  description: "Members filter the ticket list by priority and assignee. Today the filters reset on reload. Acceptance criteria: the selected priority and assignee filters survive a page reload; clearing a filter removes it; filters are per member, not shared.",
};

describe.skipIf(!enabled)("live SoC LLM", () => {
  it("answers a PM chat turn with a usable proposal", async () => {
    const provider = createSocProvider(configuration);
    const result = await provider({ fields, message: "Tighten the description and state the default view explicitly.", history: [] });
    expect(result.reply).not.toBe("");
    expect(result.proposal?.title.trim()).not.toBe("");
    expect(result.proposal?.description.trim()).not.toBe("");
    console.log(`[chat] model=${configuration.model} proposal title=${JSON.stringify(result.proposal?.title)}`);
  }, 120000);

  it("generates a test plan within the stored limits", async () => {
    const provider = createTestPlanProvider(configuration);
    const result = await provider({ fields, focus: "Cover the per-member scoping." });
    expect(result.plan.cases.length).toBeGreaterThan(0);
    expect(result.plan.cases.length).toBeLessThanOrEqual(testPlanLimits.cases);
    for (const item of result.plan.cases) {
      expect(testCaseKinds).toContain(item.kind);
      expect([...item.expected].length).toBeLessThanOrEqual(testPlanLimits.expected);
      expect(item.steps.length).toBeGreaterThan(0);
      // Plain text only: the panel renders these verbatim, never as Markdown.
      expect(item.title).not.toMatch(/[#*`]|\]\(/);
    }
    console.log(`[plan] model=${configuration.model} cases=${result.plan.cases.length} kinds=${result.plan.cases.map(item => item.kind).join(",")}`);
    console.log(`[plan] reply=${JSON.stringify(result.reply)}`);
  }, 120000);
});
