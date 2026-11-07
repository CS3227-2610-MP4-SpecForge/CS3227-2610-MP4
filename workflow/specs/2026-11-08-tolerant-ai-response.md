# Tolerant AI response contract — approved 2026-11-08

User approved the proposed narrow change with “proceed”. Preserve existing
uncommitted stabilization work. No further live calls are authorized in this task.

Accept JSON objects with a complete proposal containing nonblank string title and
description within existing Unicode limits. Strip unknown top-level/proposal keys;
never execute or persist them. If such a proposal has no reply (absent/null/blank),
supply the neutral “Review these suggested ticket changes.” reply. Wrong-type
known fields remain invalid. Human-only clarification still requires a nonblank
string reply and absent/null proposal. Reject incomplete/malformed proposals even
when a valid reply accompanies them; never silently downgrade to clarification.

Keep the canonical internal reply/proposal interface and strict storage/request
schemas. JSON mode, strict JSON parsing, envelope/tool/truncation/size/time/context
checks, no retries, authenticated access, stale-edit protection and explicit
publication remain. Acceptance criteria still use server-side section merging.
No arbitrary prose extraction, schema repair or new output shapes.

Main-agent TDD/codebase-design at previously approved provider and authenticated
HTTP/local database seams: accepted variations normalize to exactly canonical
fields; invalid known fields/partial proposals remain safe failures; normalized
proposals persist privately and preserve unrelated acceptance sections and saved
work. Existing browser journeys cover unchanged review/publication controls.
Security preflight, independent code and security post-review. Update guides and
one session log; no commit/push, deployment or Developer AI work.
