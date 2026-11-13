// The PM assistant's two intents. The server picks instructions and output
// budgets by intent; the fixed draft message labels a draft turn sent without
// the PM's own words so retries and dedupe compare the same input.
export const assistantIntents = ["draft", "edit"] as const;
export type AssistantIntent = (typeof assistantIntents)[number];
export const assistanceMessages = {
  draft:
    "Draft ticket from the current rough idea. Return a complete title and Markdown description; mark unresolved decisions explicitly.",
} as const;
export const usageLimit = 20;
export type AiUsage = {
  remaining: number;
  limit: number;
  resets_at: string | null;
  /** The caller's own Singapore-day allowance, across both AI features. */
  daily?: { remaining: number; limit: number; resets_at: string };
};
/** Characters in one PM assistant message, counted per character. */
export const messageLimit = 4000;
