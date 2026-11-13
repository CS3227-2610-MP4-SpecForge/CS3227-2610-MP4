# 2026-11-13: Reflections rewrite and experiment lessons

- Changes: [docs/Reflections.md](../docs/Reflections.md) rewritten for plainer
  prose using the humanizer skill's patterns, with "What we learnt" notes on
  sections that describe a lesson. The sections from the
  [Reflections draft](../workflow/drafts/reflections-draft.md) are folded in
  with links rebased to `docs/`. An introduction explains the structure:
  four parts (multi-agent SE, context engineering and resource use, the
  product's AI features, development-process security), each opened by the
  course questions it answers, with headings that state the lesson. Experiment
  sections cover the SoC model, prompt and diagnostic runs, the Argyph retrieval
  pilot, the Superpowers process comparison, the seeded-bug reviewer check and
  the parallel browser workers. The Argyph and process experiment records are in
  the ignored `local/` workspace, so the section describes them without links.
- Validation: every relative link in the file resolves, the Developer Guide
  anchor exists, and the file contains no em or en dashes. Figures were checked
  against the source logs and local experiment summaries.
- Open: the author still needs to review the text as their own graded work,
  then delete the draft and update the Reflections row in
  [the acceptance index](../docs/AcceptanceIndex.md).
