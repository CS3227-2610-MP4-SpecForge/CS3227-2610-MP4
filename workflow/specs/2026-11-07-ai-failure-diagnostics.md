# Distinguish AI timeout and upstream failures

Status: implemented and independently code/security reviewed for local use.
Authorised by the user's explicit request to distinguish the failures
explained in chat; uses the existing approved provider/HTTP/storage/browser seams.

Keep the60-second provider deadline,75-second browser wait and zero automatic
retries. Distinguish an aborted local provider deadline, a received upstream
HTTP error (including502/504/429), and a network/stream transport failure.
Protocol/JSON failures remain invalid_output. A local deadline must not claim
an upstream502 was received, and502 must not be described as proof of a timeout.

Record only an allowlisted source, measured monotonic provider elapsed milliseconds
and optional numeric upstream HTTP status. Persist these with the failed private
turn through worker-only completion, so reload retains the explanation. Do not
read/log raw provider error bodies, headers, prompts, replies, keys or exceptions.
Legacy unavailable turns remain readable with a generic explanation; no guessed
status/timing is backfilled. Author/member isolation and generation checks remain.

Tests: deterministic provider transport for local abort, receivedHTTP errors,
network/stream failures and malformed output; real local RPC/HTTP roundtrip and
strict diagnostic validation; browser checks for distinct durable messages. No
live SoC calls. Security preflight and independent code/security review apply.
