---
layout: default
title: SpecForge
---

# SpecForge

**A shared workspace for product managers and developers.**

Client requests arrive vague. SpecForge is where a product manager turns one into
a clear, reviewable feature ticket with help from an LLM, publishes it to the
organisation, and tracks it through delivery alongside the developers who build
it.

- **Live application:** [specforge-prod.vercel.app](https://specforge-prod.vercel.app)
  (production). The development environment runs separately at
  [specforge-dev.vercel.app](https://specforge-dev.vercel.app). Both are
  deployed by the team's own GitHub Actions workflows in `.github/workflows/`,
  each against its own Supabase project.
- **Source:** [github.com/CS3227-2610-MP4-SpecForge/CS3227-2610-MP4](https://github.com/CS3227-2610-MP4-SpecForge/CS3227-2610-MP4)

## What it does

**Accounts and organisations.** Email/password signup with emailed-code
verification, unique usernames, organisations you create or are invited into, and
admin/member management. Whoever creates an organisation becomes its admin.

**Private drafting, then deliberate publication.** A product manager drafts a
ticket privately — title plus a Markdown description — and nothing is visible to
the organisation until they explicitly publish it. Authors keep editing after
publication; other members cannot.

**AI drafting and inline suggestions.** The PM asks the assistant to rewrite a
rough request into a clearer ticket. Proposals arrive as reviewable suggestions,
never as silent edits: the PM applies or discards each one, and a proposal built
on text that has since changed is blocked rather than applied over newer work.

**Private AI discussion.** A collapsible side panel holds the PM's private
conversation with the assistant about the ticket. It is scoped to that ticket and
is not shared with the organisation.

**Delivery tracking.** Due dates, up to five assignees chosen by email, three
priorities, delivery status, shared comments and an activity trail, with filtered
and paged ticket lists.

## Built for failure, not just the happy path

The AI integration is bounded on purpose. Every provider call has one deadline
and no automatic retry. Responses are validated against a strict schema and
unexpected fields are discarded. A dropped connection is recorded differently
from a definitive provider failure, because retrying an unknown outcome is not
safe. Authentication attempts are capped, sessions are server-only with HttpOnly
cookies, and every mutation is checked against one exactly configured origin.

## Documentation

- [User Guide](UserGuide.md) — every feature and how to try it.
- [Developer Guide](DeveloperGuide.md) — design, module boundaries, setup, checks
  and the security and deployment gates.
- [Reflections](Reflections.md) — what multi-agent development and context
  engineering actually cost and returned on this project.

## How it was built

SpecForge was developed with spec-driven development and a multi-agent workflow:
one implementing agent, an independent code and architecture reviewer, and a
security specialist dispatched before and after sensitive work. Every feature
began as an approved specification under `workflow/specs/`, and every working
session left a sanitised summary under `logs/`. The agent briefs, skills and
engineering policies are versioned in the repository, so cloning it reproduces
the workflow and not just the code.

## The team

| Member | Role | Responsibility |
| --- | --- | --- |
| _add your name_ | Product manager features | Ticket drafting, publication, AI rewriting and suggestion review |
| _add your name_ | Developer features | Developer-facing AI and delivery workflow |

Built for CS3227 Machine Problem 4, National University of Singapore.
