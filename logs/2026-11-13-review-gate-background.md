# 2026-11-13: Review gate for background reviewers

- Changes: the review gate never approved a background `code-reviewer` run,
  because a background Agent result is only a launch notice
  (`status: "async_launched"`), so `git commit` stayed denied after approved
  reviews. The gate now keeps the launched diff as pending and reads the verdict
  from the reviewer's own `SubagentHandback` message or `SubagentStop` event,
  approving only if the diff is unchanged since launch. A foreground reviewer
  that hands back its report has its approval held until the Agent result
  arrives. Only the report's final line counts as the verdict. The diff hash
  now covers each changed, new or renamed-away file's path, mode and
  working-tree content: before, staging a new file moved it from the untracked
  list into the tracked diff and invalidated the approval, so a commit adding a
  new `src/` file was always denied. A commit is also denied while staged
  `src/` content differs from the reviewed working tree, unless it uses `-a`.
  The [Developer Guide](../docs/DeveloperGuide.md) describes the gate.
- Validation: a scratch-repository harness with simulated hook inputs passed 25
  cases, including a stale diff, another agent type, an unknown id, a quoted
  approved line ending in needs-fixes, the foreground hand-back path, staging
  new files after approval, a stale index, a rename whose old path is restored,
  and a mode change. Live in
  this session, a background review was recorded as pending at launch, cleared
  on `SubagentStop` without approval after needs-fixes, and the next review's
  approval set the approved hash to the current `src/` diff. The foreground
  hand-back path has not been observed live.
- Review: the first review found that the verdict match was unanchored, so a
  needs-fixes report quoting the approved line could approve; it now reads only
  the final line. A later review of the staging fix found that renames could
  hide a deletion and that the index was never compared with the reviewed
  working tree; both are fixed.
- Open: the gate hashes the whole working `src/` diff, so approved `src/`
  changes must be committed together. It is a process guard: anything with
  shell access can still write its state file. The `-a` check reads the whole
  command, so a message containing ` -a ` or a chained `ls -la` skips the index
  check. An approved new file that was never staged is left out of a commit
  without warning.
