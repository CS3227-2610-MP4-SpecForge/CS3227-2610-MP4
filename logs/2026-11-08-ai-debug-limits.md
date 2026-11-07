# AI debugging response limits — 2026-11-08

User requested removing the 4,000-character AI response ceiling, increasing the
SoC output budget from 600 to 2,000 tokens for debugging, and disclosing the system
prompt. Recorded the approved amendment in the existing two-field workspace spec.

Main agent used local TDD/codebase-design/security skills. Provider regression
tests first failed on the old token budget and long reply; HTTP/local integration
then demonstrated the remaining database rejection after the TypeScript fix.
Removed reply upper length checks in the provider, table constraint and completion
RPC through an additive migration applied locally without resetting data. Prompt
and request now agree on 2,000 tokens. User messages retain their separate
4,000-character limit; proposal limits, strict JSON/nonblank validation, 64KiB
transport cap, complete-context cap, deadlines and aggregate storage cap remain.
Existing 202,048-byte admission reserve exceeds the whole bounded provider
envelope plus persisted metadata. Updated user/developer guides.

Verification: npm run verify passed lint, type checking, 34 unit tests and
production build (36 database/migration tests skipped in that command).
npm run test:integration passed all 35 local database tests, including an
8,001-character reply through authenticated HTTP/persistence/reload, blank reply
rejection and aggregate capacity enforcement. git diff --check passed.
Independent code and security reviewers approved with no findings; reviews were
read-only. No live SoC requests, credential output or new provider-limit claims.
The 2,000-token policy is user-selected debugging configuration; live reliability
and provider quotas remain unverified. Browser UI was unchanged; no browser suite
was repeated. No commit or push was requested for this amendment.
