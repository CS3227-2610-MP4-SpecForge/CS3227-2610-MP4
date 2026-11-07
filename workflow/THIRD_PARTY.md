# Skill provenance and local changes

Selected skills from [Matt Pocock's skills](https://github.com/mattpocock/skills),
pinned at commit `4ae2317ddb22b046e26455e4f9c9b3aaaf62212d` on 2026-11-07:

| Local directory under `.agents/skills/` | Upstream path |
| --- | --- |
| `grill-me` | `skills/productivity/grill-me` |
| `grilling` | `skills/productivity/grilling` |
| `codebase-design` | `skills/engineering/codebase-design` |
| `tdd` | `skills/engineering/tdd` |
| `improve-codebase-architecture` | `skills/engineering/improve-codebase-architecture` |
| `domain-modeling` | `skills/engineering/domain-modeling` |

License: [MIT, Copyright 2026 Matt Pocock](MATT-POCOCK-LICENSE).
Original files include upstream references and invocation metadata. Do not install
the full Matt Pocock plugin alongside these copies: that duplicates skill names.

Local adaptations implement the user-selected workflow and reviewed safety fixes:

1. `grilling/SKILL.md`: small factual lookups stay in the main agent; substantial
   independent research can still be delegated.
2. `tdd/SKILL.md`: allow small refactoring while tests are green; point to the
   project feature reviewer instead of requiring the upstream dual-review skill.
3. `grill-me/SKILL.md` and `improve-codebase-architecture/SKILL.md`: remove the
   Claude-specific `disable-model-invocation` field; preserve the upstream
   `agents/openai.yaml` explicit-only policy for Codex.
4. `improve-codebase-architecture/SKILL.md` and `HTML-REPORT.md`: use offline
   static CSS/SVG, escaped repository text, no scripts or external assets, and
   restrictive CSP instead of mutable CDN scripts and loose Mermaid rendering.

The `codebase-design` and `domain-modeling` directories are unchanged. Recheck dependencies and local
adaptations before updating. Updates are deliberate; these copies do not auto-update.
`specforge-security` and `workflow/agents/` are project-authored.

Process inspiration:

- [Anthropic: when to fold subagents into the main loop](https://claude.com/resources/articles/building-agents-when-to-fold-subagents-into-your-main-agent-loop)
- [OpenAI: targeted skills and repository instructions](https://developers.openai.com/blog/rethinking-skills-and-prompts-for-gpt-6-astra)

The initial workflow documents also reference Superpowers; they are historical,
superseded by `workflow/README.md`. This file is a source for the eventual
developer guide's acknowledgement section, not a substitute for that guide.
