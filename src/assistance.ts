// The PM assistant's three intents. The server picks instructions and output
// budgets by intent; these fixed messages label draft, gap-check and
// apply-answers turns in history so retries and dedupe compare the same input.
export const assistantIntents = ["draft", "gaps", "edit"] as const;
export type AssistantIntent = (typeof assistantIntents)[number];
export const assistanceMessages = {
  draft:
    "Draft ticket from the current rough idea. Return a complete title and Markdown description; mark unresolved decisions explicitly.",
  gaps: "Check this ticket for gaps.",
  answers: "Apply my answers to the ticket.",
} as const;
export const usageLimit = 20;
export type AiUsage = {
  remaining: number;
  limit: number;
  resets_at: string | null;
  /** The caller's own Singapore-day allowance, across both AI features. */
  daily?: { remaining: number; limit: number; resets_at: string };
};
export type AiQuestion = { prompt: string; options: string[] };
export type AiAnswer = { question: string; answer: string | null };
export const answerLimit = 500;
