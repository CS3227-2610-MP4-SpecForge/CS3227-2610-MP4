# Ticket-first AI writing — approved 2026-11-08

User approved the proposed ticket-first redesign with “I like these ideas. proceed.”
This supersedes the fixed equal-width editor/chat and proposal-in-chat interaction.

## Behaviour

- New private tickets invite a rough idea (“What needs to change?”) and one Draft
  ticket action; Start manually opens the regular title/description editor.
  Rough ideas autosave as the private description, so failed AI calls/reloads do
  not lose them. First generation populates the private editor only if its exact
  snapshot/revision is still current; offer Undo AI draft. Never auto-publish.
- Title and description are the main workspace. Discuss with AI toggles a
  secondary panel; mobile stacks both without hiding the ticket. Keep chat state
  while collapsed. One free-text composer replaces the competing send/proposal
  actions. Discussion can return only a human reply. A Review ticket changes
  action brings conversational proposals into the editor.
- Improve clarity, Add acceptance criteria and Find missing details are targeted
  actions. The last asks only questions and opens discussion. Ask only questions
  that materially affect the ticket, suggest reasonable options in readable chat,
  and offer Leave undecided to request recording an explicit open question rather
  than inventing a requirement. Answers use the same free-text composer.
- Show AI title/description changes in the editor as literal removed/added text,
  with Accept changes and Discard. No automatic edits to an existing ticket.
  Acceptance-criteria action preserves the original title and every other section
  through server-side section merging; missing/ambiguous generated sections fail
  safely. Unfamiliar Markdown is left alone outside the target section.
- Review/accept/undo use exact field and revision freshness with an authorized
  remote recheck. Editing while AI runs is allowed and makes old suggestions
  stale; late autosave, another tab or an unknown response must never overwrite
  manual work. Undo is available while the generated content is still unchanged.
- Draft autosave, explicit published Save, acknowledgment, privacy, access checks,
  strict provider schema and existing output/context/time/storage/rate limits stay.
  Reuse persisted immutable messages to describe actions; no new privilege or DB
  schema is needed. Never log prompt content or make live provider calls for tests.

## Modules and existing approved test seams

Main agent owns implementation. Existing provider/strict authenticated HTTP,
local Supabase RPC/RLS and browser journeys remain the test interfaces. Add
provider/HTTP regression evidence for section-preserving output and question-only
behaviour; browser journeys for rough idea→draft→undo, inline accept/discard,
stale/remote conflicts, targeted actions, private published edits, discussion
recovery and mobile keyboard/layout. Fake only the external AI. Unit tests for
new internal helpers are unnecessary when public behaviour covers them.

Independent security preflight/post-review and one code/architecture review.
Shared tokens/controls and read-only Developer ticket views must stay consistent.
No Jira integration, issue status/assignment, streaming, model discovery, live
quota verification or deployment changes in this slice.
