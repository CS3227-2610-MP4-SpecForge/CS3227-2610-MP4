# 2026-11-10: Durable agent instructions

- Changes: Replaced the feature inventory, deployment status and historical test
  results in `AGENTS.md` with durable constraints, task-specific documentation
  pointers and validation rules. Preserved the generated Next.js block. Updated
  `workflow/README.md` to distinguish feature work from routine fixes and removed
  obsolete setup commentary and completeness claims.
- Validation: Relative Markdown links in both edited instruction files resolve;
  the generated Next.js block matches the committed version; `git diff --check`
  passes. Application tests were not run for this documentation-only change.
- Review: Independent review approved the changes with no blocking findings.
