# 2026-11-12: Usable guides

- Changes: workstream F of
  [the MP3 feedback spec](../workflow/specs/2026-11-12-mp3-feedback-improvements.md).
  - The [Developer Guide](../docs/DeveloperGuide.md) is regrouped into Setup,
    Architecture, Data model, Security, AI features, Testing, Deployment and
    Process, with a table of contents. It adds three Mermaid diagrams (request
    flow, tables, one PM AI turn) and an endpoint table. The six SoC experiment
    write-ups are now one "Observed provider behaviour" summary linking their
    logs. Per-feature migration filenames and per-feature browser-coverage lists
    were dropped: one `migration up` applies every migration, and the tests hold
    their own coverage. Anchors linked from elsewhere are unchanged.
  - The [User Guide](../docs/UserGuide.md) gains a table of contents and a
    five-minute walkthrough with five screenshots.
  - `npm run screenshots` regenerates `docs/images/` against the local stack
    with the fake AI and two disposable demo accounts.
  - The Pages build copies `docs/images/`, and `website/_includes/head-custom.html`
    draws the diagrams with Mermaid 11.4.1.
- Validation:
  - `npm run verify` (226 passed, 84 skipped) and the smoke browser tests (10)
    before the review fixes; after them, the type check, lint, format check,
    unit tests (196 passed, 84 skipped) and the screenshot run.
  - `npm run screenshots` passes on the running local stack.
  - A link check over the guides, README, AGENTS.md and the site index found
    every relative link and anchor; the site index's links to the guides
    resolve once the build copies them in.
  - A local build with GitHub's Pages image, served and opened in a browser:
    all three diagrams render with no syntax errors, all five images load, and
    guide links become `.html`. That run caught semicolons in sequence-diagram
    notes, which Mermaid treats as statement ends; they are now commas.
  - GitHub's own rendering of the diagrams is not checked until the branch is
    pushed.
- Review: the first review found three factual errors in the new reference
  material, now fixed: the ER diagram named two columns wrongly (`fields`,
  `recipient_email`), the endpoint table omitted the 201 for ticket creation,
  and it claimed SoC failures return 503 (they return a failed, refunded turn).
  Three facts the restructure had dropped are restored, the sequence diagram
  now shows the 429 when a limit is reached, and the screenshot setup fails by
  name instead of timing out.
