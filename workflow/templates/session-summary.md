# <date>: <topic>

- Changes: <outcome and consequential decisions; link the spec/guide for detail>.
- Validation: <final commands/results and material coverage gaps>.
- Review: <material findings and fixes; verdict or outstanding review>.
- Open: <unresolved issue or blocker; one concrete next action for unfinished work>.

The main agent writes this log. Aim for 100–200 words for a routine session;
use more only for material evidence or unresolved risk. Omit inapplicable bullets.

Summarize the final state, not the conversation. Consolidate follow-ups about the
same feature instead of appending another request/approval/implementation history.
Keep a failed or superseded result only when it explains an unresolved problem,
an important regression fix or a coverage limitation. Never turn a failed full
suite plus a passing focused rerun into a full-suite pass.

Omit routine approval and commit/push requests, branch/fetch narration, tool or
skill inventories, reviewer dispatch details, incidental setup retries, repeated
RED/GREEN stories, exhaustive file/function lists, and “not captured” metrics.
Record a revision, deployment or setup detail only if needed to identify the
validated artifact, reproduce a problem or continue unfinished work. Mention
human verification only when it is a concrete outstanding acceptance check.
Use plain bullets; avoid tables, empty sections and repeated “no commit/deploy”
statements. Resource measurements belong only in requested usage reporting or a
relevant performance/cost investigation, and must be measured.

Do not include secrets, private prompt content or hidden reasoning. Distinguish
observed results from simulations or reconstruction. Preserve material security
findings and validation limits even when shortening the log.

For an unfinished task crossing a pause or chat boundary, follow the handoff
format in `workflow/README.md`. Keep that temporary note in ignored
`local/notes/active/`; this summary remains the durable outcome record. Do not
copy the handoff here or link to a note that will be removed on completion.
