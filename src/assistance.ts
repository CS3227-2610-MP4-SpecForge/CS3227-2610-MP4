// User-visible instructions are stored with the turn, so retries retain the
// original action and snapshot without introducing a second command protocol.
export const assistanceMessages = {
  draft: "Draft ticket from the current rough idea. Return a complete title and Markdown description; mark unresolved decisions explicitly.",
  clarity: "Improve the clarity of this ticket without changing its scope. Return suggested ticket changes.",
  acceptance: "Add acceptance criteria to this ticket. Only change the Acceptance criteria section; preserve its title and all other content.",
  gaps: "Find missing details that materially affect this ticket. Ask focused questions with useful answer options; do not suggest ticket changes yet.",
  undecided: "Leave the last unanswered question undecided. Suggest ticket changes recording it explicitly as an unresolved question, without assuming an answer.",
} as const;
