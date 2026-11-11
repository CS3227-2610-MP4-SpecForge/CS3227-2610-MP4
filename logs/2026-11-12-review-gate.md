# 2026-11-12: Enforced independent code review

- Changes: Test runs showed the independent reviewer was skipped in 4 of 5 runs.
  Likely causes: the reviewer was only a Markdown brief, not a registered agent,
  so the harness's "do not spawn agents unless asked" default worked against it;
  the "feature boundaries" trigger let changes be classed as routine; and nothing
  checked that a review happened. Registered `code-reviewer` as a read-only Claude
  Code subagent with a required final verdict line. Added a review gate hook:
  `git commit` is denied until the exact `src/` diff is approved; a turn ending
  with unreviewed `src/` changes is prompted once, then blocked once a session log
  has changed. `AGENTS.md`, the workflow README and the Developer Guide now make
  review a standing request that also covers routine fixes.
- Validation: The gate script was exercised in a scratch Git repository: clean
  tree, the one-time stop prompt, the hard stop with a changed log, commit denial
  and allowance, ignoring non-reviewer agents, a needs-fixes verdict, re-review
  after a further edit, and the off switch. Live hook execution inside a fresh
  Claude Code session has not yet been observed. No application tests are needed:
  only tooling and documentation changed.
- Open: Rerun the five-run reviewer test in a fresh session to measure the effect.
  Codex and other clients do not run these hooks.
