# SpecForge reflections

This document looks back on how we built SpecForge with AI coding agents and
what we would keep or change. It has four parts. The first two follow the
course themes: multi-agent software engineering, then context engineering and
resource-aware use. The third covers the AI features inside the product, where
most of our model experiments happened. The fourth covers security lessons from
the development process itself.

Each section is headed by the lesson it reflects on. Inside, we describe what
happened, what we changed and, under "What we learnt", what we would carry into
the next project. Several sections describe a small experiment we ran to test a
belief; those start from what we expected. The experiments ran only a handful
of times each, so their numbers describe what we saw, not general rates. The
SoC experiments are recorded in the linked logs and specs. The Argyph retrieval
pilot and the two process experiments ran in a separate local workspace that is
not committed to the repository.

## Part 1: Multi-agent software engineering

This part covers how we designed the coordination between agents, how we
checked it was followed, how disagreements were settled, and whether the extra
agents were worth what they cost.

### One writer and read-only reviewers kept coordination simple

We settled on a small coordination pattern early
([workflow setup log](../logs/2026-11-07-lightweight-workflow-setup.md)). The
main agent clarifies requirements, designs, writes the tests and writes the
code. Only it edits files, so there is never more than one writer per checkout.
Two kinds of helper agent support it, and both are read-only. A security agent
sets criteria before sensitive work and reviews it afterwards, and a code and
architecture reviewer checks each change once its focused tests pass. Reviewers
never start agents of their own
([workflow README](../workflow/README.md)).

The security agent's first criteria set the shape of the first slice. It worked
without reading `.env`, calling the provider or changing files, and its list
became verified identity checks, protected fixed roles, database confirmation
checks, row-level security and atomic creator-admin provisioning. For the AI
workspace, the same preflight led to a service-role-only path for admitting and
completing a worker after session authorisation, durable idempotency, and
reservations held per account and per request with lease generations. We do not
count a preflight as proof that the code is secure; the reviews afterwards are
recorded in each session summary.

**What we learnt:** a single writer removed a whole class of coordination
problems, because no two agents could edit the same file or disagree about the
current state of the code. The main agent stayed the only place where
decisions were made.

### A rule that nothing checks will be skipped

Writing the review step into the instructions was not enough to make it happen.
The Developer test plan generator was a concrete example: it sent ticket text
to an LLM and introduced authorisation decisions, yet its session log recorded
that both the required security preflight and independent code review had been
missed ([test plan log](../logs/2026-11-09-developer-test-plans.md)). Writing the
rule had not been enough to ensure it was followed.

In our process experiment (below), our own workflow skipped the mandatory
independent review in three of four runs. A separate set of test runs showed
the reviewer skipped in four of five runs while it existed only as a written
brief. The likely causes were that the reviewer was not a registered agent, so
the harness default of "do not spawn agents unless asked" worked against it;
that the trigger wording let changes be classed as routine; and that nothing
checked whether a review had happened.

We registered the reviewer as a read-only subagent with a required verdict line
and added hooks to the agent harness. A `git commit` is denied until the exact
`src/` diff has an approving verdict, and a turn that ends with unreviewed
changes is prompted once and then blocked
([review gate log](../logs/2026-11-12-review-gate.md)). We tested the gate in a
scratch repository. Codex and other clients do not run these hooks, so the gate
only covers sessions in Claude Code.

**What we learnt:** the way to verify that a coordination pattern is followed
is to make the harness check it. Instructions handle intent; triggering needs
something that fails loudly when the step is missing.

### Reviewers found what our tests did not

The independent reviewer repeatedly found bugs in code whose tests passed. In
the manual request lifecycle it found three gaps that a passing browser journey
missed: browser history could bypass the unsaved-work warning, a skip-link jump
could switch off later protection, and PostgreSQL's locale-dependent whitespace
rules treated FEFF differently from JavaScript's `trim`. In the AI workspace it
found a recovery loop when a send had not been admitted and the user edited
manually, and an incomplete storage-cap calculation. When we split the routes,
a differential test of 1,800 requests matched old and new routing exactly, yet
the reviewer found one path the test never tried, which returned an
organisation through a fixed-length slice
([formatter and routes log](../logs/2026-11-12-formatter-and-routes.md)). In the
guides it found three factual errors in a new endpoint table and diagram
([usable guides log](../logs/2026-11-12-usable-guides.md)).

Each finding got a regression test that reproduced it before the fix. Editors
now opt in to native unload protection, same-page hash changes are ignored,
storage validation lists the trimmed whitespace characters explicitly, recovery
starts from the current snapshot, and completion capacity is reserved exactly.

**What we learnt:** a large or green test suite only covers the paths its author
thought of. The reviewer was useful because it looked for another way to reach
the same feature, which is the question our tests never asked.

### Experiment: the reviewer would need the most capable model

We assumed a reviewer needed the strongest model to catch subtle bugs. To test
that, we seeded three bugs into a real commit: a cross-organisation data leak
caused by missing SQL parentheses, Done sorted before Cancelled, and no re-read
after a failed inline save. Lint, typecheck and all 85 unit tests still passed.
The unchanged reviewer brief ran twice on the seeded revision and once on the
clean one for each of Haiku, Sonnet and Opus, and an Opus grader scored the
reviews blind.

Sonnet and Opus caught all six seeds, and Haiku caught five, missing the sort
order once. All three approved the clean revision, though Haiku raised six
debatable findings on it. A seeded review cost about $0.02 with Haiku, $0.23
with Sonnet and $0.65 with Opus.

**What we learnt:** on this task Sonnet matched Opus at about a third of the
cost, so the benefit of a second agent did not depend on the most expensive
model. The cheapest model was close but noisier, which would cost the main
agent time sorting real findings from debatable ones.

### Disagreements were settled against the spec, with a limit on rework

Our workflow tells the main agent to resolve a disagreement with a reviewer by
checking it against the specification and the evidence, and to ask the user when
resolving it would change scope. The same finding gets at most two rework
rounds before the main agent stops and diagnoses or escalates, and that limit
never waives a blocking finding ([workflow README](../workflow/README.md)).

The clearest case came while setting up the workflow itself. The security
reviewer marked the change as needing fixes because an optional upstream report
template loaded executable CDN scripts and used loose Mermaid settings. The main
agent rewrote the instructions to use escaped text, static CSS and SVG, no
external or active content and a restrictive content security policy, and a
focused follow-up review approved it after one round
([workflow setup log](../logs/2026-11-07-lightweight-workflow-setup.md)).

**What we learnt:** a disagreement was easier to settle once both sides pointed
at the spec or a concrete finding. The rework limit is there so that an
implementer and a reviewer cannot loop on the same point indefinitely.

### Experiment: a heavier process would produce better results

Early on we replaced the Superpowers plugin with our lighter workflow because of
concerns about its overhead. Later we tested that choice. Fresh Claude Code
sessions implemented the same small feature ("make tickets due in the next few
days stand out") under each process, with a simulated PM answering from a
hidden brief and twelve hidden acceptance tests deciding the result. The PM was
either lenient or strict about process.

With the strict PM, Superpowers took about 2.1 times as long, cost about 2.6
times as much and made the PM read twice as many words. One of its strict runs
took 33 agent turns, against 9 to 17 for every other run, and still failed five
of the twelve hidden tests: its design document added the date to the "Due
tomorrow" label, the PM approved the document, and the code followed it. With
the lenient PM, Superpowers skipped its own design document and plan. Our
workflow passed every hidden test, though it skipped review as described above.

**What we learnt:** extra planning documents and handoffs between phases added
turns and reading without making the result more correct, and a PM approving a
document did not catch the mistake in it. Repeated analysis was the main
resource cost we saw from coordination.

### Shared limits blocked parallel workers

We expected that running the browser suite on several workers would cut its
time by about 30%. Two and four workers both failed consistently at sign-in
([browser stability log](../logs/2026-11-12-browser-suite-stability.md)). The
workers shared the app's own limit of 30 sign-in or sign-up attempts per minute,
so the extra workers were blocked by a resource they all needed. Supabase's
limit was ruled out by sending 60 rapid local token requests, none of which was
rejected. The suite stays on one worker until we decide whether tests may skip
the UI sign-in or the local stack may raise that limit. Replacing fixed sleeps
with a controlled clock still made the one-worker suite about 8% faster and
stable across seven consecutive runs.

We did not record idle or waiting time for the agents themselves. With one
writer and serial reviews, the main agent waits for each review by design, and
we accepted that wait in exchange for having one writer.

**What we learnt:** parallelism only helps when the workers do not share a
bottleneck, and here the bottleneck was a security control we had built. We
only found it by measuring.

### When we would use multiple agents again

Across these sections, extra agents paid off when they brought an independent
view of finished work: security preflight before sensitive changes, and a
read-only reviewer after them. They did not pay off as extra planning phases,
and we did not use parallel writers. Our rule is now to add an agent when its job is to check work
the main agent cannot check itself, and to add parallel workers only for
substantial independent work that shares no files or limits.

## Part 2: Context engineering and resource-aware use

This part covers how we wrote the instructions and skills, what context we gave
upfront and what agents fetched themselves, what went into handoff notes, when
more context hurt, how we chose models, and what we know about cache and token
use.

### Instructions shrank to what the agent needs every time

Our first `AGENTS.md` carried a feature inventory and test history. We cut it
down to durable constraints, working rules and pointers to guides that the agent
reads only when relevant
([log](../logs/2026-11-10-agent-instructions-cleanup.md)). Feature detail lives
in specs and guides, dated results in session logs, and temporary state in
handoffs. Repeated procedures became skills: six adapted from Matt Pocock's
collection (for example `tdd` and `codebase-design`) and a project-authored
`specforge-security` skill shared by the implementer and the security reviewer.
Session logs were also made to record outcomes instead of narrating the session
([log](../logs/2026-11-10-concise-session-logs.md)).

**What we learnt:** an instruction file that grows with the project buries the
rules the agent must follow on every task under facts it rarely needs. Keeping
the always-loaded file short, and moving the rest behind "read when relevant"
links, made the important constraints easier to find.

### Reviewers got the evidence upfront, and the codebase on demand

Each reviewer receives the spec path, the exact diff, the relevant files and the
test evidence, and nothing from the conversation
([workflow README](../workflow/README.md)). The reviewer then reads any other
file it needs. We supply upfront what defines the task and what the reviewer
cannot reconstruct, such as which diff and which spec, and let it retrieve
everything else.

### Experiment: semantic code search would make retrieval cheaper

If agents retrieve code themselves, a better retrieval tool should help. We
expected Argyph, a local semantic code index exposed to the agent over MCP, to
help the coding agent find the right code with less effort and the same
accuracy. We froze a snapshot of the repository, three investigation tasks, the
model settings and the scoring rules before running anything, then ran each
task once with ordinary search and once with Argyph, in fresh read-only Codex
sessions. A blind grader scored the answers.

Accuracy was identical: both arms scored 2/2, 2/2 and 1/2, and both missed the
same existing membership-removal regression. Argyph used 22.6% more total input
tokens (471,794 against 384,800) and 9% more combined wall time (126.7 s against
116.2 s). Three different questions returned byte-identical snippets, one of
them reported at line 29 when it actually sat at lines 350 to 378, even with all
1,882 chunks embedded. Reading the pinned release's source suggested two causes:
vector hits are merged before they are sorted by similarity, and line numbers
are computed from the wrong byte offsets. We did not reproduce or patch either.

Our own protocol was also too strict. It banned reading whole files and capped
output lines through the prompt, and five of the six runs broke those rules,
mostly by reading small complete files of 31 to 75 lines. We did not relax the
rules after seeing the results, so the strict efficiency comparison is
inconclusive. We kept ordinary search as the default.

**What we learnt:** irrelevant retrieved context cost tokens without improving
answers, and full index coverage did not mean results were relevant or correctly
located. We also learnt to enforce limits in the tool interface instead of the
prompt, because a rule the agent can ignore will be ignored.

### More context made the agent worse in two places

The process experiment above is one case. The heavier process produced more
documents for the agent and the PM to read, and the run with the most turns was
the one that failed the hidden tests. The signals were the turn count, the cost
and the words the PM had to read, and the hidden tests confirmed it.

The other case is the PM assistant's system prompt, which grew long as we added
rules. We suspected the length was causing invented requirements, and tested a
shorter prompt (see Part 3). The short prompt gave tighter clarifying questions
but still invented details, so length was not the whole cause there.

**What we learnt:** the signals that context was hurting were more turns and
more reading for the same task, and output that followed a document instead of
the user's intent. Cutting context helped focus but did not fix accuracy on its
own.

### Handoff notes record decisions and the next action

When unfinished work crosses a pause or moves to another agent, we keep one
short handoff note of 150 to 250 words instead of passing on a transcript
([workflow README](../workflow/README.md)). It records the objective and scope,
the current state with implemented, verified and pending work kept apart, three
to five relevant files, consequential decisions and constraints, the evidence
with its revision, one concrete next action and any blocker. It never holds
secrets or hidden reasoning, and it does not count as approval for live calls or
deployment. The next agent checks the note's claims against the checkout before
relying on it. To test a note, a fresh agent reads `AGENTS.md` and the note and
states the next action, constraints and missing evidence in under 150 words.

**What we learnt:** the next agent needs the decisions and the reasons for them,
because those are what it cannot recover by reading the code. Anything it can
recover from the repository is better linked than copied.

### Choosing a model for the job

We chose models per task instead of inheriting the most expensive one by
default, and the workflow says so explicitly. For review, the seeded-bug
experiment in Part 1 showed Sonnet was enough. For the in-product assistant, SoC
offered Qwen and Gemma, and our comparison found no overall winner (Part 3), so
we kept the existing Qwen default. The Argyph pilot ran Codex at low reasoning
effort.

### What we know about cache and token use

We did not run a controlled experiment on reducing cache misses, so we cannot
say how much any change saved. What we did measure shows how much of the input
came from cache. In the eight process-experiment runs, cache reads made up 87%
to 96% of input tokens. In the Argyph pilot, 77.5% of input was cached with
ordinary search and 83.0% with Argyph. Keeping instruction files stable and
giving reviewers the same short brief each time should help the cache, but we
have no before-and-after figure for it.

Codex reported reasoning output separately in the Argyph pilot: 23 reasoning
tokens against 2,366 output tokens with ordinary search, and 96 against 2,670
with Argyph, at low reasoning effort. In the product, reasoning cost more. The
first Qwen probe spent its whole 600-token budget and returned nothing visible
(Part 3). We deliberately do not persist hidden reasoning, in agent notes or in
the app. A handoff note keeps the decisions reasoning led to, which is the part
another agent can reuse.

The most expensive work we measured was planning-heavy process runs, where the
strict-PM Superpowers runs cost $1.44 and $1.55 against $0.46 to $0.69 for our
workflow. One-time tool setup was also costly: preparing Argyph used 85,408
input tokens, and its index warm-up took 337.5 seconds. We do not have a
breakdown of token use across the whole project.

### Keeping live quota out of routine work

Routine tests use a disposable local Supabase, transport fixtures and a fake AI.
CI never calls SoC, and the one live suite is opt-in and makes exactly two calls
([live runs log](../logs/2026-11-10-soc-llm-live.md)). We run the broad checks
only at feature completion or after a material fix. The experiment harnesses
wrote per-run metrics files, and the browser suite can write a timing report
(`SPECFORGE_TIMING_FILE`) for comparing runs. We did not measure savings from
these practices, so we claim none.

**What we learnt:** the cheapest way to save provider quota was to need it less.
Most of our checks did not need a live model at all.

## Part 3: The AI features in SpecForge

This part covers the model behaviour we saw through SoC and how it shaped the
product design.

### A successful response can still be useless

Our first contact with SoC was one authenticated model-discovery request, which
succeeded, and two synthetic Qwen checks with the same 600-token completion cap.
The first took 10.16 seconds, reported 734 total tokens, returned no visible
content and stopped because it hit the length limit. A second run with
`reasoning_effort: none` took 5.76 seconds, reported 416 total tokens and
finished normally with visible content. Neither reply passed strict six-field
JSON validation. Later, model discovery reported 65,536 context tokens; the
first synthetic chat call failed or timed out under a 45-second deadline, and a
smaller second call returned a valid chat-only JSON envelope with 49 prompt and
33 completion tokens. Neither used real task data, and no production feature
relies on these numbers.

**What we learnt:** the model can spend its whole output budget before writing
anything the app can use, and an HTTP 200 says nothing about whether the content
is valid. The adapter now validates every reply against a schema and treats
truncation as its own failure.

### Experiment: a different model would write more faithfully

The live check of the PM assistant produced an acceptance-criteria result that
passed every validation check while inventing session and cache behaviour and
dropping a reset requirement the ticket stated
([live verification log](../logs/2026-11-08-soc-live-verification.md)). We
expected the larger Gemma model to do better than Qwen, so we ran the same five
synthetic cases through both with identical settings
([model comparison log](../logs/2026-11-08-soc-model-comparison.md)).

Neither model won. Each timed out on two of its five calls. On the acceptance
case Qwen refused without producing a proposal, while Gemma produced valid
output that added a cache-reset criterion nobody asked for and left out one the
ticket stated. We kept Qwen as the default because the evidence gave no reason
to switch.

### Experiment: a shorter prompt would stop the invented requirements

Our next guess was that the long system prompt was the problem. We fixed a
short, action-specific candidate before making any calls and compared it with
the existing prompt on the same five cases
([prompt variant log](../logs/2026-11-08-soc-prompt-variant.md)). Each arm
produced four usable outputs and one rejected output. The short prompt gave
tighter answers when asking a clarifying question or leaving unknowns open, but
it still invented cookies, session lifetime and storage choices, and its
acceptance-criteria reply failed the schema. We did not adopt it.

To check whether prompt length explained the omissions, we sent both models a
tiny ticket with three facts and asked them only to reword it
([minimal diagnostic log](../logs/2026-11-08-soc-minimal-diagnostic.md)). Qwen
still replaced the named "All" filter option with generic wording, so the long
prompt was not the whole explanation. Gemma passed that one case, so we tried
it on five varied short tickets
([Gemma clarity log](../logs/2026-11-08-gemma-clarity-variety.md)). Two met the
rubric, two changed meaning in subtle ways, and one timed out.

**What we learnt:** a reply that passes the schema can still be wrong, so we
scored format and faithfulness separately from then on. Neither a model switch
nor prompt tuning made the writing reliable, and after these four runs we
stopped tuning prompts blind. Passing local tests use a fake provider, so they
say nothing about live quality
([Developer Guide](DeveloperGuide.md#observed-provider-behaviour)).

### Because the model can be wrong, a person decides

The experiments changed the product design. AI never publishes, every proposed
change goes through a per-change review, and the first draft can be undone
([review spec](../workflow/specs/2026-11-11-ai-chat-review-modal.md)). Test
plans are saved only when a developer chooses to save them
([test plan spec](../workflow/specs/2026-11-09-developer-test-plans.md)).

**What we learnt:** when we could not make the model reliable, we designed the
feature so that an unreliable suggestion costs the user one rejected change.

### Ticket text and model output are both untrusted

The test plan request sends its fixed instructions separately from the ticket
and from the developer's focus note, so a ticket titled "Ignore previous
instructions" never reaches the instruction text
([`test-plans.test.ts`](../src/tests/test-plans.test.ts)). The PM assistant does
the same, and its outbound prompt contract is tested
([writing stabilisation log](../logs/2026-11-08-soc-writing-stabilization.md)).
Replies that do not fit the schema fail as `invalid_schema` and are never
repaired ([tolerant response spec](../workflow/specs/2026-11-08-tolerant-ai-response.md),
[`soc.test.ts`](../src/tests/soc.test.ts)). Accepted output is rendered as text:
a ticket containing a `<script>` tag, a tracking image and a `javascript:` link
renders without running or fetching any of them
([`requests.spec.ts`](../src/tests/browser/requests.spec.ts)).

### Permissions and spending limits belong in the database

A forged completion is denied, late output after a member is removed is not
stored, and a PM's chat stays private even from an organisation admin
([`chat.database.test.ts`](../src/tests/chat.database.test.ts)). Test plan
generations are private to their developer, and the HTTP layer authorises the
request before the provider is called
([`test-plans.database.test.ts`](../src/tests/test-plans.database.test.ts)).
Hourly request and attempt limits are persistent, and a failed turn is refunded
once while attempts are never refunded. Failure details come from an allowlist,
so no raw provider text, parse error or hidden reasoning is stored
([diagnostics spec](../workflow/specs/2026-11-07-ai-failure-diagnostics.md)),
and server failure logs carry only fixed fields
([log](../logs/2026-11-12-server-failure-logging.md)).

### Retrying blindly is unsafe when you cannot tell what happened

Browser tests intercepted requests to simulate a failure before a write and a
lost response after a commit. Those two cases need different handling, and
seeing them side by side showed us why a blind retry is unsafe. Creation now
uses a key scoped to the account and organisation, and saves reconcile against
the stored revision while keeping newer local text. Database and HTTP tests also
cover revision races and a member losing access mid-edit. In the AI workspace,
an unknown network outcome is handled differently from a turn that definitely
failed.

### Tests through public interfaces caught real gaps first

TDD went through the public HTTP and Supabase interfaces. The failing cases we
saw first included missing signup, verification and organisation routes, a
missing creation RPC, no limit on auth attempts, and provider outages reported
to the user as invalid credentials. The implementation then made those cases
pass. Tests against a local Supabase instance cover controls that a mocked
provider response cannot exercise.

## Part 4: Security of the development process

This part covers what went wrong, or nearly wrong, with secrets and untrusted
text while agents ran tools on our behalf.

### Telling an agent not to print secrets did not stop a tool printing them

During setup, a local Supabase CLI diagnostic printed disposable local
development credentials once. No hosted or SoC credential was exposed. The
project wrappers now suppress output that carries credentials, on success and on
failure. The same setup also needed a pinned Supabase CLI, because the newest
version rejected the inbox configuration, and a targeted override for a
vulnerable transitive dependency of the lint tool.

**What we learnt:** output handling needs code that filters it. An instruction
covers what the agent chooses to print, and a tool can print things on its own.

### Our fix for leaking output went too far

During the first deployment, a failed `supabase db push` printed nothing,
because of the suppression added after the credential leak. The fix relays the
tail of the output with JWTs, keys and passwords redacted, and we checked the
redaction against sample lines before relying on it
([first deployment log](../logs/2026-11-10-first-live-deployment.md)). When the
agent drove the browser during deployment setup, account creation, passwords
and tokens stayed with the user.

**What we learnt:** suppressing everything hid the error we needed to see.
Redacting the sensitive parts kept both the secret and the diagnosis safe.

### A rule we have not yet seen tested

The project's security skill tells both the implementer and the security
reviewer to treat user, retrieved and generated text as untrusted
([`specforge-security`](../.agents/skills/specforge-security/SKILL.md)). No log
records an incident where this rule was tested, so it remains a stated rule
without observed evidence behind it.
