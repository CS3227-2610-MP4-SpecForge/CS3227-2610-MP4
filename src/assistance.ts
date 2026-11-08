// User-visible instructions are stored with the turn, so retries retain the
// original action and snapshot without introducing a second command protocol.
export const assistanceMessages = {
  draft: "Draft ticket from the current rough idea. Return a complete title and Markdown description; mark unresolved decisions explicitly.",
  undecided: "Leave the last unanswered question undecided. Suggest ticket changes recording it explicitly as an unresolved question, without assuming an answer.",
} as const;
