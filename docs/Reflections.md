# SpecForge Reflections

## Initial requirements and provider exploration

Small interview rounds settled the PM workflow before a stack or scaffold was
chosen. User feedback materially changed two assumptions: submitted requests
remain editable, and organisation-wide membership replaces a project entity.
Username-only signup was later replaced explicitly by email verification and
future generated demo accounts. One product specification holds the decisions.

One authenticated model-discovery request succeeded. Two synthetic Qwen checks
then used the same 600-token completion cap. The first took 10.16 seconds,
reported 734 total tokens, returned no visible content and ended for length.
A diagnostic with `reasoning_effort: none` took 5.76 seconds, reported 416 total
tokens, and returned visible content with normal completion. Neither passed
strict direct six-field JSON validation. This is one small experiment, not a
general performance comparison or proof that the optional setting is always
honoured. It motivates schema validation and explicit truncation handling in the
future adapter. No production feature uses these probe results as a guarantee.

## First implementation slice

The main agent writes the implementation; a separate security agent supplied
preflight criteria without reading `.env`, making provider calls or changing
files. Those criteria became verified identity checks, protected fixed roles,
database confirmation checks, RLS and atomic creator-admin provisioning.
Independent post-change reviews and their outcomes are recorded in the session
summary. This document does not treat the preflight itself as security proof.

TDD used public HTTP and Supabase interfaces. Observed RED cases included missing
signup/verification/organisation routes, missing creation RPC, absent auth
attempt limits and provider outages incorrectly mapped to invalid credentials.
Implementation then made the focused cases pass. Direct local-Supabase tests
check controls that mocked provider responses cannot establish.

Resource/context choices: reviewers receive scoped files/specification and test
evidence rather than a conversation dump; main-agent implementation avoids
parallel writers; routine tests use disposable local Supabase or external
transport fixtures, not live SoC quota. Repeated broad checks are reserved for
feature completion or a material fix. Token/cache/time savings from this process
have not been measured; no saving percentage is claimed.

Setup exposed concrete tooling issues: the newest Supabase CLI rejected the
inbox configuration, so a compatible CLI was pinned; Docker was initially
stopped; npm audit identified a lint-tool transitive dependency, corrected with
a targeted patched-version override. A local CLI diagnostic printed disposable
local development credentials once; the new wrappers suppress credential-bearing
success/error output. No hosted or SoC credential was printed. This illustrates
why output handling needs executable controls rather than instructions alone.
