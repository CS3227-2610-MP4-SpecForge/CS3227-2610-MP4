# Site-wide, organisation and daily AI limits

Status: approved by the user on 2026-11-13 ("Approve and start"), including its
test interfaces. Follows the 2026-11-13 AI security audit,
which found no site-wide, per-organisation, per-minute, daily or concurrency
cap on SoC calls. User decisions so far:

- Failed calls count toward the site and organisation limits.
- A per-organisation cap is in scope.
- Add a site-wide pause when SoC pushes back (429/503).
- Add a per-user daily cap of 40.
- Document the limits in the User Guide: numbers for user and organisation
  limits, a description without numbers for site limits, and a table of
  notices.
- Show organisation admins their organisation's daily usage.

## Problem and user

Both AI features (the PM assistant and Developer test plans) send requests to
SoC with one shared API key. Today every limit is per account per hour (PM: 20
charged and 40 attempts; Developer: 20). That allows up to 480 charged requests
per account per day. Accounts are cheap to get: demo kits alone give up to 60 a
day, and each account brings its own allowance and can run one request at a
time.

- A burst from many accounts can make SoC throttle or block the shared key.
  Then AI stops working for every organisation.
- **SoC's own limits are unknown.** The public SoCLaaS API guide documents no
  rate limits, quotas or `Retry-After` behaviour, and the fuller guide on
  `dochub.comp.nus.edu.sg` is only reachable from the NUS network. Today a SoC
  429 shows each user a red "SoC returned HTTP 429" error. Nothing slows the
  next users down, so they keep hitting SoC.
- One busy organisation, or one busy person in it, can use up capacity others
  need.

Operators need a ceiling for the whole environment that also adapts to SoC's
real limit. Organisations and their members need a fair share. Users need a
clear message when they hit any limit, not something that looks like an outage.

## Reference: other course projects (CS3227 2610 MP3)

| Project | Site-wide | Per user | Other |
|---|---|---|---|
| ConnectTalent | 24 / rolling minute | 3 / rolling minute | Reserved in the database before the provider call |
| Homebrew | 60 / minute and 100 / Singapore day in prod; 30 and 40 in dev | 5 / minute, 30 / day | Per-feature and per-café caps. Failed attempts count. 0 denies. Missing or invalid values turn AI off. |
| HelpiNUS | 20 requests / minute (assistant) | 1 request in flight | Mentor summaries capped at 5 running at once |

SpecForge's defaults below sit within this range: 20 per minute, 4 running at
once, a site daily ceiling and 40 per user per day. Like Homebrew, the site
windows count failed calls, all daily windows use Singapore days, and invalid
settings turn AI off. None of these numbers is a SoC quota. The SoC pause is
what adapts them to SoC's real limit.

## Behaviour

### Admission checks

- Each environment (development and production) has its own budget, stored in
  its own database. The PM assistant and Developer test plans share every
  window below, because they share the SoC key.
- A request that would dispatch to SoC must pass these checks, in a transaction
  that holds a lock, before any count is taken. All state is in the database,
  with no per-process or per-IP state:
  - **User per day:** at most **40** charged dispatches per user per Singapore
    calendar day, across both features and all organisations.
  - **Organisation per day:** at most **80** dispatches per organisation per
    Singapore calendar day, across both features and all members.
  - **SoC pause:** no dispatch while a site-wide pause is active (see below).
  - **Site concurrency:** at most **4** SoC requests running at once across both
    features. A `running` turn whose lease has expired does not count.
  - **Site per minute:** at most **20** dispatches per clock minute.
  - **Site per day:** at most **200** dispatches per Singapore calendar day.
- Order of checks inside `begin_chat_turn` / `begin_test_plan_turn`:
  1. The existing access and input validation.
  2. Replay and duplicate handling.
  3. The per-user running check, the existing per-user hourly limits, then the
     user daily cap.
  4. The organisation daily cap, the SoC pause, then the site concurrency,
     per-minute and per-day caps.
  5. Count the dispatch in every window, and take the per-user hourly charge.

  A request blocked at step 3 or 4 charges and records nothing and creates no
  turn row. Each turn records when it was charged (chat turns already have
  `charged_at`; test-plan turns gain it), which identifies its user-day window.

### What counts and what is refunded

| Window | Failed or interrupted dispatch |
|---|---|
| Existing per-user hourly charge | Refunded (unchanged) |
| User per day | Refunded, but only within the same Singapore day |
| Organisation per day, site per minute, site per day | Not refunded |

- The user-day refund matches the hourly charge: a SoC outage does not use up a
  user's day. The organisation and site windows are not refunded, so an outage
  cannot turn into unlimited retries. The SoC pause also limits outage traffic.
- Test plans gain the user-day refund. Their existing hourly limit stays a
  non-refunded attempt count.
- Requests answered without calling SoC never count: an identical completed
  request returned from history, or a replay of the same request key.
- Unchanged: the existing per-user hourly limits, one running request per
  account, and the per-ticket storage cap.

### SoC pause

- When a dispatch ends with SoC returning HTTP **429** or **503**, the server
  records a site-wide **pause-until** time in the database:
  - SoC's `Retry-After` header when it is a whole number of seconds (bounded to
    5–600), otherwise **60 seconds**.
  - An HTTP-date `Retry-After`, a missing one or an invalid one all use 60
    seconds.
  - A new pause only extends the current one, never shortens it.
- The pause is set inside `finish_chat_turn` / `finish_test_plan_turn`, which
  receive the bounded number of seconds from the server. A browser session
  cannot set or clear it.
- Other failures (timeouts, network errors, other HTTP statuses, invalid output)
  do not pause, because they say nothing about SoC's rate limit.
- While paused, requests are blocked with the `site` notice. Requests already
  running continue.
- The turn that hit the 429/503 keeps its existing detailed failure entry
  (diagnostic unchanged). Its user-facing text changes to the calm capacity
  wording: "SoC is busy right now. Your message is saved; try again in a
  minute or two." The pause length is not stored on the turn, so this text
  gives no exact wait. The next blocked request's notice gives the exact wait.

## Limits as configuration

- Caps come from server configuration, following the demo-kit pattern:

  | Setting | Default | Maximum | Development (`render.yaml`) |
  |---|---|---|---|
  | `AI_SITE_CONCURRENT` | 4 | 8 | 2 |
  | `AI_SITE_PER_MINUTE` | 20 | 60 | 10 |
  | `AI_SITE_PER_DAY` | 200 | 1000 | 60 |
  | `AI_ORG_PER_DAY` | 80 | 500, and not above `AI_SITE_PER_DAY` | 40 |
  | `AI_USER_PER_DAY` | 40 | 200, and not above `AI_ORG_PER_DAY` | 20 |

- Production uses the defaults. The lower development values match Homebrew's
  lower dev budget.
- A value that isn't a whole number, is above its maximum, or breaks an
  ordering rule makes AI answer 503 "AI is not configured". A value of 0 turns
  AI off (same 503 path), as an operator kill switch.
- The pause duration (60 s default, 5–600 s bound) is fixed in code, not
  configurable.
- The server passes the validated caps to the worker-only RPCs. The RPCs check
  the bounds again and raise `22023` when a value is out of range.

## Responses and UI

- A blocked request returns **429** with a `Retry-After` header (whole seconds,
  at least 1) and a body of `{ error, limit, retryAfter }`. `limit` is one of:

  | `limit` | Cause | `retryAfter` |
  |---|---|---|
  | `site` | Concurrency cap, per-minute cap or SoC pause | 15 s for concurrency; time left otherwise |
  | `site_daily` | Site daily cap | Until midnight Singapore time |
  | `organisation` | Organisation daily cap | Until midnight Singapore time |
  | `user_daily` | User daily cap | Until midnight Singapore time |

- Fixed messages, shown as the existing non-error limit notice in each panel.
  The ending is "or keep editing manually." in the PM assistant and "or plan
  manually." in test plans:
  - `site`: "SpecForge's AI is at capacity right now. Try again in about
    N minutes, …"
  - `site_daily`: "SpecForge's AI has reached today's limit. It resets at
    midnight Singapore time (in about N hours), …"
  - `organisation`: "Your organisation has used today's AI allowance. It resets
    at midnight Singapore time (in about N hours), …"
  - `user_daily`: "You have used today's 40 AI requests. They reset at midnight
    Singapore time (in about N hours), …" The number is the configured cap.
  - N is rounded up to whole minutes or whole hours, and is at least 1.
- The send/generate button stays enabled for `site`, `site_daily` and
  `organisation`, and pressing it checks again. For `user_daily` it is disabled
  until the reset, like the existing hourly behaviour, then re-enables on its
  own.
- **Usage meter:** the PM assistant's existing usage response gains
  `daily: { remaining, limit, resets_at }` for the signed-in user, shown as
  "N of 40 left today" next to the hourly count. The user-day count comes from
  the caller's own row only. The server combines it with the configured cap, so
  no browser-callable function receives or reveals caps. The test-plan panel
  shows the notice but gets no meter (unchanged).
- The site and organisation blocks do not change the per-user meters.
- **Organisation meter (admins only):** on the organisation's members page,
  next to the admin-only member and invitation lists, admins see a bar using
  the same `UsageMeter` style: "AI today: N of 80 left · resets at midnight
  Singapore time".
  - The reset time always shows. It is not limited to the low-count state as
    in the personal meter.
  - The number is the configured cap.
  - It shows the organisation's total only. There is no per-member breakdown.
  - Non-admin members never see this bar, only the `organisation` notice when
    blocked.
  - It refreshes when the page loads and when an admin returns to it. It does
    not poll.
  - A failed read hides the bar and leaves the rest of the page unchanged.

### User Guide

- The AI assistant and test-plan sections state the user's own limits (20 per
  hour, 40 per day) and the organisation limit (80 per day, shared by all
  members and both features).
- One sentence describes the site-wide limits and the SoC pause without
  numbers: "SpecForge also limits total AI use across the site and pauses
  briefly when the SoC service is busy."
- A troubleshooting table lists each of the four notices and the
  "SoC is busy" turn text, with the cause and what to do.
- The members-page section describes the admin organisation meter.
- The line "the request is not counted" is replaced. It now says a failed
  request is refunded to your own hourly and daily counts, but still counts
  toward the organisation and site limits.

## Permissions and failures

- The window and pause tables are in the `private` schema, with all access
  revoked from `public`, `anon` and `authenticated`. Only `service_role`-only
  admission and finish functions write them. There are two browser-callable
  reads:
  - The caller's own user-day count, through `read_ai_usage`.
  - `read_organisation_ai_usage(target_org)`. It returns that organisation's
    daily used count and window start. It raises `42501` unless the caller is
    a verified admin of `target_org`, checked inside the function with
    `private.is_admin`, not only hidden in the UI.

  No browser-callable function shows site counts, other organisations' counts,
  individual members' counts or the pause.
- `GET /api/organisations/[org]/ai-usage` calls it with the session client,
  adds the configured `AI_ORG_PER_DAY` cap, and returns
  `{ remaining, limit, resets_at }`. It returns 403 for non-admins and 404 for
  invalid IDs, like the existing members routes.
- Database errors during these checks go through the existing 503 path. The
  request fails closed: no SoC call is made.
- If the pause cannot be recorded, the finish call fails through the existing
  path, and the turn expires as `interrupted` as it does today.
- Blocked requests are expected limits, not failures, and are not logged as
  `server_failure`. Logs never include organisation IDs, user IDs or counts.
- Window rows older than 2 days are deleted, as with demo kits. Deleting an
  organisation or a profile deletes its window rows.

## Exclusions

- No per-IP or per-feature quotas, and no per-user per-minute cap. One running
  request per account already limits each user's pace.
- No circuit breaker for timeouts or network errors, and no automatic retry
  after a pause.
- No changes to SoC prompts, models or output validation, and no filter for
  off-topic chat use.
- No operator dashboard, alerting, per-member usage breakdown, usage history or
  configurable per-organisation or per-user overrides.
- No exact site-wide numbers in the User Guide or the app.
- No changes to sign-up, demo kits or auth admission.
- No queueing: a blocked request is rejected, not held until capacity frees up.
- No claim about SoC's real quotas. That would need the NUS-network SoCLaaS
  guide or course staff confirmation.

## Acceptance criteria

1. With caps (concurrent 1, per minute 2, site day 3, organisation 2, user 1) in
   a local test, a second request running at the same time from a different
   account and either feature gets 429 `limit: "site"`. The request already
   running finishes normally.
2. The third dispatch in one clock minute gets 429 `site`. The fourth in one
   Singapore day gets 429 `site_daily`. Both hold across any mix of accounts and
   both features, and across server restarts.
3. The third dispatch in one Singapore day from one organisation gets 429
   `organisation`, while another organisation can still dispatch.
4. A user's second charged dispatch in one Singapore day, across both features
   and any of their organisations, gets 429 `user_daily`, while another member
   of the same organisation can still dispatch.
5. A blocked request does not change any count, the user's hourly charge or
   attempts, or the chat/test-plan rows, and makes no SoC call.
6. A failed dispatch (for example a SoC timeout) is refunded to the user's hourly
   and daily counts, but still counts toward the organisation and site windows.
   A failure that finishes after Singapore midnight does not refund the new
   day.
7. Duplicate-request and replay responses do not count toward any window.
8. An expired `running` lease does not count toward the concurrency cap.
9. A SoC 429 or 503 with `Retry-After: 120` blocks all new dispatches with 429
   `site` for 120 seconds. Missing or invalid `Retry-After` gives 60 seconds.
   Values outside 5–600 are bounded. A second, shorter pause does not shorten
   it. Other failure kinds do not pause.
10. The turn that received the 429/503 shows the calm "SoC is busy" text, and
    its stored diagnostic is unchanged.
11. A cap of 0, a non-numeric value, a value above its maximum, or a broken
    ordering rule returns 503 and makes no SoC call.
12. `authenticated` and `anon` cannot read or write the window or pause tables,
    or call any function that reveals them. `read_ai_usage` returns only the
    caller's own daily count.
13. Both panels show the matching notice in the non-error style, with a correct
    rounded-up wait. The PM meter shows "N of 40 left today" and updates after
    a charge and after a refund.
14. The Developer Guide documents the five settings, their defaults, maximums
    and development values, the kill switch, the SoC pause and the fact that
    SoC's real quotas are unverified.
15. The User Guide meets the User Guide section above. It contains no
    site-wide numbers, and no line says a failed request is "not counted".
16. An organisation admin sees "N of 80 left" on the members page, and the
    count drops after any member's dispatch in that organisation. A non-admin
    member sees no bar. A direct call to `read_organisation_ai_usage` or
    `GET …/ai-usage` by a non-admin, an admin of another organisation or an
    anonymous caller is refused with no count.

## Module and test boundaries

- **Database (new migration):**
  - A `private.ai_usage_windows` table keyed by scope (site, organisation or
    user), window kind and window start.
  - A one-row `private.ai_soc_pause` table.
  - A `private.reserve_ai_dispatch(target_org, actor, caps…)` helper that takes
    a transaction advisory lock.
  - A user-day refund helper.
  - `begin_chat_turn` / `begin_test_plan_turn` recreated to take the caps and
    call the helper. `finish_chat_turn` / `finish_test_plan_turn` recreated to
    refund the user day and accept an optional bounded `pause_seconds`.
  - `read_ai_usage` extended with the caller's own daily count.
  - A new admin-only `read_organisation_ai_usage(target_org)`.
  - Tested in `src/tests/*.database.test.ts` (criteria 1–9, 12, and the
    database half of 16).
- **Server:**
  - An `aiDispatchCaps(env)` parser next to `demoKitCaps`.
  - `requestSocJson` reads and bounds `Retry-After` on a 429/503 and returns it
    alongside the existing `AiFailure`, not inside the stored diagnostic.
  - `chat.ts` and `test-plans.ts` pass `pause_seconds` to the finish RPC, map
    the new `PT429` messages to the 429 body and `Retry-After`, and add the
    daily meter.
  - Unit tests in `src/tests/` cover the parser, `Retry-After` parsing and the
    response mapping (criteria 9 server half, 11), with the existing fake SoC
    provider and transport seam.
- **Client:** `use-assistant.ts`, `chat-panel.tsx` and `test-plan-panel.tsx`
  show the notices, the daily meter and the calm 429/503 turn text.
  `ai-diagnostics.ts` changes only the 429/503 user-facing string.
  `membership.tsx` shows the admin organisation meter, reusing the shared
  usage-bar component. Component tests cover these (criteria 10, 13, and the
  UI half of 16). A browser journey covers the admin meter, because it crosses
  the server.
- **Server route:** the `ai-usage` route joins the organisation routes. Unit
  tests cover 403/404 mapping and cap merging.
- Security preflight and review are required because this changes LLM
  admission.
