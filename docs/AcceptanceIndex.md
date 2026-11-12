# SpecForge Acceptance Index

One row per feature: the approved spec, the tests that exercise it, the session
logs that record it, and whether it has been checked on a hosted environment.
Local checks (`npm run verify`, the database suite and the browser suite) cover
every feature below; see the [Developer Guide](DeveloperGuide.md#testing).

**Hosted verification.** The development app was deployed on 2026-11-10 and its
sign-up page rendered ([log](../logs/2026-11-10-first-live-deployment.md)).
Nothing beyond that page has been exercised on a hosted environment. From
2026-11-11 Vercel blocked the team and both URLs answered HTTP 402
([log](../logs/2026-11-12-doc-drift.md)), so hosting moved to Render
([log](../logs/2026-11-12-render-hosting.md)), which has not deployed yet. Every
feature's hosted check is therefore **pending**: it is accepted locally, not on a hosted environment. Live SoC calls
have been made from a developer machine, not from a hosted app
([log](../logs/2026-11-10-soc-llm-live.md)).

## Features

| Feature | Spec | Main tests | Session logs | Hosted check |
| --- | --- | --- | --- | --- |
| Accounts, verification and organisations | [product MVP](../workflow/specs/2026-11-07-product-mvp.md) | [accounts](../src/tests/browser/accounts.spec.ts), [HTTP](../src/tests/application.test.ts), [database](../src/tests/database.test.ts) | [requirements](../logs/2026-11-07-product-requirements.md), [setup](../logs/2026-11-07-project-setup-summary.md) | Sign-up page rendered; rest pending |
| Account usernames | [usernames](../workflow/specs/2026-11-09-account-usernames.md) | [accounts](../src/tests/browser/accounts.spec.ts), [profile database](../src/tests/profile.database.test.ts) | [log](../logs/2026-11-09-account-usernames.md) | Pending |
| Organisation membership | [membership](../workflow/specs/2026-11-07-organisation-membership.md) | [membership](../src/tests/browser/membership.spec.ts), [database](../src/tests/database.test.ts) | [log](../logs/2026-11-07-organisation-membership.md) | Pending |
| Email-addressed invitations | [invitations](../workflow/specs/2026-11-10-email-addressed-invitations.md) | [membership](../src/tests/browser/membership.spec.ts), [database](../src/tests/database.test.ts) | [log](../logs/2026-11-10-organisation-direct-navigation.md) | Pending |
| Direct organisation navigation | [navigation](../workflow/specs/2026-11-10-organisation-direct-navigation.md) | [accounts](../src/tests/browser/accounts.spec.ts), [requests](../src/tests/browser/requests.spec.ts) | [log](../logs/2026-11-10-organisation-direct-navigation.md) | Pending |
| Navbar account menu | [account menu](../workflow/specs/2026-11-10-navbar-account-menu.md) | [accounts](../src/tests/browser/accounts.spec.ts), [profile](../src/tests/browser/profile.spec.ts) | [log](../logs/2026-11-10-navbar-account-menu.md) | Pending |
| Profile page | [profile](../workflow/specs/2026-11-10-profile-page.md) | [profile](../src/tests/browser/profile.spec.ts), [profile database](../src/tests/profile.database.test.ts) | [log](../logs/2026-11-10-navbar-account-menu.md) | Pending |
| Ticket drafting and publication (two fields) | [two-field workspace](../workflow/specs/2026-11-07-two-field-ai-workspace.md) | [requests](../src/tests/browser/requests.spec.ts), [requests database](../src/tests/requests.database.test.ts), [migration](../src/tests/migration.database.test.ts) | [log](../logs/2026-11-07-two-field-ai-workspace.md) | Pending |
| Description preview | [preview](../workflow/specs/2026-11-08-ticket-description-preview.md) | [requests](../src/tests/browser/requests.spec.ts), [layout](../src/tests/browser/ticket-layout.spec.ts) | [log](../logs/2026-11-08-ticket-description-preview.md) | Pending |
| Ticket delivery and team discussion | [delivery](../workflow/specs/2026-11-08-ticket-delivery.md) | [delivery](../src/tests/browser/delivery.spec.ts), [delivery database](../src/tests/delivery.database.test.ts), [ticket migration](../src/tests/ticket-migration.database.test.ts) | [log](../logs/2026-11-08-ticket-mvp-research.md) | Pending |
| Ticket layout and AI sidebar | [layout](../workflow/specs/2026-11-08-ticket-layout.md) | [layout](../src/tests/browser/ticket-layout.spec.ts) | [log](../logs/2026-11-08-ticket-layout.md) | Pending |
| Ticket visibility banner | [visibility](../workflow/specs/2026-11-08-ticket-visibility-banner.md) | [layout](../src/tests/browser/ticket-layout.spec.ts) | [layout log](../logs/2026-11-08-ticket-layout.md) | Pending |
| Whole-ticket Publish and Update | [whole ticket](../workflow/specs/2026-11-08-ticket-autosave.md) | [delivery](../src/tests/browser/delivery.spec.ts), [requests](../src/tests/browser/requests.spec.ts) | [log](../logs/2026-11-08-ticket-autosave.md) | Pending |
| Email assignee picker | [assignees](../workflow/specs/2026-11-08-email-assignee-picker.md) | [delivery](../src/tests/browser/delivery.spec.ts), [delivery database](../src/tests/delivery.database.test.ts) | [log](../logs/2026-11-08-email-assignee-picker.md) | Pending |
| Priority and status pill dropdowns | [pills](../workflow/specs/2026-11-08-ticket-pill-dropdowns.md) | [dropdown](../src/components/dropdown.test.tsx), [delivery](../src/tests/browser/delivery.spec.ts) | [assignee log](../logs/2026-11-08-email-assignee-picker.md) | Pending |
| Purple date picker | [date picker](../workflow/specs/2026-11-08-purple-date-picker.md) | [date picker](../src/components/date-picker.test.tsx), [delivery](../src/tests/browser/delivery.spec.ts) | [assignee log](../logs/2026-11-08-email-assignee-picker.md) | Pending |
| Requests table and filters | [table](../workflow/specs/2026-11-10-requests-table.md) | [delivery](../src/tests/browser/delivery.spec.ts), [delivery database](../src/tests/delivery.database.test.ts) | [log](../logs/2026-11-10-requests-table.md) | Pending |
| Inline delivery edits in the table | [inline edits](../workflow/specs/2026-11-10-inline-request-delivery.md) | [delivery](../src/tests/browser/delivery.spec.ts) | [table log](../logs/2026-11-10-requests-table.md) | Pending |
| Sort requests by status | [status sort](../workflow/specs/2026-11-10-request-status-sort.md) | [delivery database](../src/tests/delivery.database.test.ts) | [table log](../logs/2026-11-10-requests-table.md) | Pending |
| PM AI assistant | [redesign](../workflow/specs/2026-11-10-pm-ai-assistant-redesign.md), [ticket-first AI](../workflow/specs/2026-11-08-ticket-first-ai.md) | [requests](../src/tests/browser/requests.spec.ts), [chat database](../src/tests/chat.database.test.ts), [assistant database](../src/tests/assistant.database.test.ts), [SoC adapter](../src/tests/soc.test.ts) | [redesign](../logs/2026-11-11-pm-ai-assistant-redesign.md), [ticket-first](../logs/2026-11-08-ticket-first-ai.md) | Pending |
| AI chat transcript and change review | [review](../workflow/specs/2026-11-11-ai-chat-review-modal.md), [Accept all](../workflow/specs/2026-11-12-accept-all-positions.md) | [change review](../src/components/change-review.test.tsx), [ticket changes](../src/tests/ticket-changes.test.ts), [requests](../src/tests/browser/requests.spec.ts) | [review](../logs/2026-11-11-ai-chat-review-modal.md), [Accept all](../logs/2026-11-12-accept-all-positions.md) | Pending |
| AI response handling and failure diagnostics | [diagnostics](../workflow/specs/2026-11-07-ai-failure-diagnostics.md), [tolerant response](../workflow/specs/2026-11-08-tolerant-ai-response.md), [invalid output](../workflow/specs/2026-11-08-invalid-ai-output.md) | [SoC adapter](../src/tests/soc.test.ts), [chat database](../src/tests/chat.database.test.ts), [requests](../src/tests/browser/requests.spec.ts) | [diagnostics](../logs/2026-11-07-ai-failure-diagnostics.md), [invalid output](../logs/2026-11-08-invalid-ai-output.md), [limits](../logs/2026-11-08-ai-debug-limits.md), [tolerant contract](../logs/2026-11-08-soc-live-verification.md) | Pending |
| Developer test plans | [test plans](../workflow/specs/2026-11-09-developer-test-plans.md) | [provider](../src/tests/test-plans.test.ts), [database](../src/tests/test-plans.database.test.ts), [notifications](../src/tests/browser/notifications.spec.ts) | [log](../logs/2026-11-09-developer-test-plans.md), [live runs](../logs/2026-11-10-soc-llm-live.md) | Pending |
| Demo kits | [demo kits](../workflow/specs/2026-11-12-demo-kits.md) | [endpoint](../src/tests/demo-kits.test.ts), [database and removal](../src/tests/demo-kits.database.test.ts), [component](../src/components/demo-kit.test.tsx), [journeys](../src/tests/browser/demo-kits.spec.ts) | [log](../logs/2026-11-12-demo-kits.md) | Pending |
| Notification banners | [banners](../workflow/specs/2026-11-10-app-notification-banners.md) | [notifications](../src/tests/browser/notifications.spec.ts), [modal](../src/components/modal.test.tsx) | [log](../logs/2026-11-10-organisation-direct-navigation.md) | Pending |
| Deployment pipeline and product website | [deployment](../workflow/specs/2026-11-09-deployment-and-product-website.md) | The deploy workflows themselves | [setup](../logs/2026-11-09-deployment-and-product-website.md), [first deploy](../logs/2026-11-10-first-live-deployment.md), [doc drift](../logs/2026-11-12-doc-drift.md), [Render](../logs/2026-11-12-render-hosting.md) | Pending first Render deploy |
| Server failure logging | [MP3 feedback, A](../workflow/specs/2026-11-12-mp3-feedback-improvements.md) | [failure logging](../src/tests/failure-logging.test.ts), [runtime logging](../src/tests/runtime-failure-logging.test.ts) | [log](../logs/2026-11-12-server-failure-logging.md) | Pending |
| Session expiry banner | [MP3 feedback, B](../workflow/specs/2026-11-12-mp3-feedback-improvements.md) | [session](../src/components/session.test.tsx), [session journeys](../src/tests/browser/session.spec.ts) | [log](../logs/2026-11-12-session-expiry.md) | Pending |
| Health endpoint and release check | [MP3 feedback, C](../workflow/specs/2026-11-12-mp3-feedback-improvements.md) | [health](../src/tests/health.test.ts), [database](../src/tests/database.test.ts) | [log](../logs/2026-11-12-release-check.md) | Pending: runs on the first Render deploy |
| Sign-in rate limit (documented) | [MP3 feedback, D](../workflow/specs/2026-11-12-mp3-feedback-improvements.md) | [HTTP](../src/tests/application.test.ts) | [log](../logs/2026-11-12-signin-rate-limit-docs.md) | Hosted Auth limits not yet checked |
| Formatter and route split | [MP3 feedback, E](../workflow/specs/2026-11-12-mp3-feedback-improvements.md) | [HTTP](../src/tests/application.test.ts) and the full suites | [log](../logs/2026-11-12-formatter-and-routes.md) | Not applicable |
| Usable guides | [MP3 feedback, F](../workflow/specs/2026-11-12-mp3-feedback-improvements.md) | [screenshot run](../src/tooling/screenshots.spec.ts) | [log](../logs/2026-11-12-usable-guides.md) | Site not yet rebuilt |
| Acceptance index and Reflections draft | [MP3 feedback, G](../workflow/specs/2026-11-12-mp3-feedback-improvements.md) | Link checks | [log](../logs/2026-11-12-acceptance-and-reflections.md) | Not applicable; Reflections await the author's rewrite |
| Helpful empty states | [MP3 feedback, H](../workflow/specs/2026-11-12-mp3-feedback-improvements.md) | [request list](../src/components/request-list.test.tsx), [test plan panel](../src/components/test-plan-panel.test.tsx), [requests](../src/tests/browser/requests.spec.ts) | [log](../logs/2026-11-12-empty-states.md) | Pending |

## Engineering process

| Change | Spec | Evidence | Session logs |
| --- | --- | --- | --- |
| Component test tier and accessibility checks | [component tier](../workflow/specs/2026-11-12-component-test-tier.md) | `src/components/*.test.tsx` | [log](../logs/2026-11-12-component-test-tier.md) |
| Browser suite stability | [stability](../workflow/specs/2026-11-12-browser-suite-stability.md) | [global setup](../src/tests/browser/global-setup.ts), [fixtures](../src/tests/browser/ui.fixture.ts) | [log](../logs/2026-11-12-browser-suite-stability.md) |
| Enforced independent code review | none (tooling) | `.claude/hooks/review-gate.mjs` | [log](../logs/2026-11-12-review-gate.md) |
| Development workflow | [workflow design](../workflow/specs/2026-11-07-agentic-workflow-design.md) (historical) | [workflow README](../workflow/README.md) | [setup](../logs/2026-11-07-lightweight-workflow-setup.md), [instructions](../logs/2026-11-10-agent-instructions-cleanup.md), [logs](../logs/2026-11-10-concise-session-logs.md) |

## SoC experiments

These specs approved bounded live experiments, not features. Their results are
summarised in the Developer Guide's
[Observed provider behaviour](DeveloperGuide.md#observed-provider-behaviour) and
did not change the production prompt or model unless the log says so.

| Experiment | Spec | Log |
| --- | --- | --- |
| Writing verification and stabilisation | [spec](../workflow/specs/2026-11-08-soc-writing-stabilization.md) | [log](../logs/2026-11-08-soc-writing-stabilization.md) |
| Committed live verification | [spec](../workflow/specs/2026-11-08-soc-live-verification.md) | [log](../logs/2026-11-08-soc-live-verification.md) |
| Short prompt variant | [spec](../workflow/specs/2026-11-08-soc-prompt-variant.md) | [log](../logs/2026-11-08-soc-prompt-variant.md) |
| Qwen and Gemma comparison | [spec](../workflow/specs/2026-11-08-soc-model-comparison.md) | [log](../logs/2026-11-08-soc-model-comparison.md) |
| Minimal instruction-following diagnostic | [spec](../workflow/specs/2026-11-08-soc-minimal-diagnostic.md) | [log](../logs/2026-11-08-soc-minimal-diagnostic.md) |
| Gemma clarity across varied tickets | [spec](../workflow/specs/2026-11-08-gemma-clarity-variety.md) | [log](../logs/2026-11-08-gemma-clarity-variety.md) |

## Historical or superseded specs

| Spec | Status |
| --- | --- |
| [Manual request lifecycle](../workflow/specs/2026-11-07-request-lifecycle.md) | Superseded in shape by the two-field workspace; its lifecycle, revisions and recovery still apply ([log](../logs/2026-11-07-request-lifecycle.md)). |
| [Development workflow design](../workflow/specs/2026-11-07-agentic-workflow-design.md) | Historical; superseded by the user-selected lightweight workflow in `workflow/README.md`. |
| [MP3 feedback improvements](../workflow/specs/2026-11-12-mp3-feedback-improvements.md) | Umbrella spec; its workstreams A to H appear as rows above. All are implemented locally; the Reflections rewrite and hosted checks remain. |
