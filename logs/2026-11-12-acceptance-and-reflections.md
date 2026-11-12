# 2026-11-12: Acceptance index, Reflections draft and commit practice

- Changes: workstream G of
  [the MP3 feedback spec](../workflow/specs/2026-11-12-mp3-feedback-improvements.md).
  - [docs/AcceptanceIndex.md](../docs/AcceptanceIndex.md) maps each feature to
    its spec, main tests, session logs and hosted check, linked from the README
    and the site. Every spec appears: as a feature, a process change, an SoC
    experiment, or historical/superseded. Every hosted check reads pending,
    apart from the development sign-up page rendering once, because Vercel has
    blocked both hosted URLs since 2026-11-11.
  - A Reflections draft in
    [workflow/drafts/](../workflow/drafts/reflections-draft.md) covers AI
    security, development-agent security, the limits of validation, and
    multi-agent and resource-aware work. It is marked as an agent draft for the
    author to rewrite, and is kept out of `docs/` so the site never publishes it
    as final. Claims without a recorded source are left for the author to add.
  - `workflow/README.md` gains a Commits section: conventional prefixes, one
    purpose per commit, a `fix:` that states the corrected behaviour, and
    staging by name.
  - The Pages build now rewrites guide links that leave `docs/` into links to
    the built commit on GitHub, so the index's links to specs, tests and logs
    work on the site.
- Validation: every spec filename appears in the index; a link check over the
  index, draft, README, workflow README, site index and Developer Guide found all
  262 relative links resolve (the site index's four links to copied guides
  resolve at build time). Each draft claim was checked against its cited log,
  spec or test. A local Pages build with GitHub's image converted the guide
  links to `.html` and rewrote the outside links. No application code changed.
- Open: the author rewrites the Reflections draft into `docs/Reflections.md`
  and deletes the draft.
