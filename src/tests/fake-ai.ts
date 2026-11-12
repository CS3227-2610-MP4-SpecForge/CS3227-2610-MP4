import type { TestPlanProvider } from "../server/test-plan-ai";
import { aiResponseTimeoutMs } from "../ai-diagnostics";
import { AiFailure, type AiProvider } from "../server/soc";
const fakeProposal = {
  title: "AI task proposal",
  description:
    "## Problem description\n\nPMs need to find saved requests.\n\n## Desired behaviour\n\n- Search request titles.\n\n## Assumptions / unresolved questions\n\nSearch applies to the active organisation.",
};
// Deterministic PM assistant for local browser checks. Phrases in an edit
// instruction select failure paths so they run without SoC quota.
export const localFakeAi: AiProvider = async input => {
  if (input.message.includes("simulate malformed JSON"))
    throw new AiFailure("invalid_output", { source: "invalid_output", reason: "invalid_json" });
  if (input.message.includes("simulate truncated response"))
    throw new AiFailure("invalid_output", { source: "invalid_output", reason: "truncated" });
  if (input.message.includes("simulate unmatched edit"))
    throw new AiFailure("invalid_output", { source: "invalid_output", reason: "unmatched_edit" });
  if (input.message.includes("simulate local timeout"))
    throw new AiFailure("local_timeout", { source: "local_deadline", elapsed_ms: aiResponseTimeoutMs });
  if (input.message.includes("simulate historical timeout"))
    throw new AiFailure("local_timeout", { source: "local_deadline", elapsed_ms: 60_000 });
  if (input.message.includes("simulate upstream 502"))
    throw new AiFailure("upstream_http", { source: "upstream_http", elapsed_ms: 1234, http_status: 502 });
  if (input.message.includes("simulate network failure"))
    throw new AiFailure("network_error", { source: "network", elapsed_ms: 567 });
  if (input.message.toLowerCase().includes("simulate failure")) throw new AiFailure("unavailable");
  if (input.message.toLowerCase().includes("slow proposal")) await new Promise(resolve => setTimeout(resolve, 1500));
  if (input.intent === "gaps")
    return {
      reply: "Two decisions affect scope.",
      proposal: null,
      questions: [
        { prompt: "Which lists should keep filters?", options: ["Requests only", "Every list"] },
        { prompt: "How long should filters persist?", options: ["This session", "Until changed"] },
      ],
    };
  if (input.answers) {
    const lines = input.answers.map(item =>
      item.answer === null ? `- Unresolved: ${item.question}` : `- ${item.question} ${item.answer}`,
    );
    return {
      reply: "Recorded your answers.",
      proposal: {
        title: input.fields.title || fakeProposal.title,
        description: `${input.fields.description || fakeProposal.description}\n\n## Decisions\n\n${lines.join("\n")}`,
      },
    };
  }
  if (input.intent === "draft" || input.message.toLowerCase().includes("proposal"))
    return { reply: "Here is a proposed task. Review it before applying.", proposal: fakeProposal };
  return { reply: "Who is this feature for?", proposal: null };
};

// Deterministic Developer-role provider for local browser checks. The focus note
// selects a behaviour so failure paths can be exercised without SoC quota.
export const localFakeTestPlanAi: TestPlanProvider = async input => {
  const focus = input.focus ?? "";
  if (focus.includes("simulate invalid plan"))
    throw new AiFailure("invalid_output", { source: "invalid_output", reason: "invalid_schema" });
  if (focus.includes("simulate local timeout"))
    throw new AiFailure("local_timeout", { source: "local_deadline", elapsed_ms: aiResponseTimeoutMs });
  if (focus.includes("simulate upstream 502"))
    throw new AiFailure("upstream_http", { source: "upstream_http", elapsed_ms: 1234, http_status: 502 });
  if (focus.toLowerCase().includes("simulate failure")) throw new AiFailure("unavailable");
  if (focus.toLowerCase().includes("slow plan")) await new Promise(resolve => setTimeout(resolve, 1500));
  return {
    reply: "Three cases from the ticket's stated behaviour. Review them before saving.",
    plan: {
      cases: [
        {
          title: `Stated behaviour holds for ${input.fields.title.slice(0, 40) || "the ticket"}`,
          kind: "happy",
          preconditions: "A verified account that is a member of the organisation.",
          steps: ["Open the published ticket", "Follow the ticket's described behaviour once"],
          expected: "The behaviour the ticket describes is observable and nothing else changes.",
        },
        {
          title: "Boundary value is accepted",
          kind: "edge",
          steps: ["Enter the largest value the ticket allows", "Save"],
          expected: "The value is accepted and stored unchanged.",
        },
        {
          title: "Rejected input leaves the record untouched",
          kind: "failure",
          steps: ["Enter a value the ticket forbids", "Save"],
          expected: "An error names the field and the stored record is unchanged.",
        },
      ],
    },
  };
};
