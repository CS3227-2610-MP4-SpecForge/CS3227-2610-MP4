#!/usr/bin/env node
// Review gate for Claude Code hooks. Ensures the code-reviewer subagent has
// seen the current src/ working diff before a turn ends or a commit is made.
//
// Modes (first argument):
//   record   PostToolUse on Agent/Task: remember the diff the reviewer saw. A
//            foreground reviewer's verdict is in its result; a background one
//            only returns "async_launched", so the diff is held as pending.
//   verdict  PostToolUse on SubagentHandback and SubagentStop, both firing for
//            the reviewer itself: read the verdict from the report's last line
//            and approve the launched diff if the working diff has not changed.
//            A foreground reviewer's approval is held until record() sees it.
//   commit   PreToolUse on Bash: deny `git commit` unless that diff was approved.
//   stop     Stop: ask for a review once; insist if a session log was written.
//
// State lives in ignored local/review/state.json. Set SPECFORGE_REVIEW_GATE=off
// in the environment to disable the gate for a human-driven session.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, readlinkSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const GATED_PATHS = ["src"];
const REVIEWER = "code-reviewer";

const mode = process.argv[2];
const input = readInput();
const root = process.env.CLAUDE_PROJECT_DIR || input.cwd || process.cwd();
const statePath = join(root, "local", "review", "state.json");

if (process.env.SPECFORGE_REVIEW_GATE === "off") process.exit(0);

try {
  if (mode === "record") record();
  else if (mode === "verdict") verdict();
  else if (mode === "commit") commit();
  else if (mode === "stop") stop();
} catch (error) {
  // Never wedge the session on an internal failure; report it and allow.
  process.stderr.write(`review-gate: ${error.message}\n`);
}
process.exit(0);

function record() {
  if (input.tool_input?.subagent_type !== REVIEWER) return;
  const hash = diffHash();
  if (!hash) return;
  const response = input.tool_response ?? "";
  const state = readState();
  state.reviewedHash = hash;
  if (response?.status === "async_launched") {
    const id = agentKey(response.agentId);
    if (id) state.pending = prune({ ...state.pending, [id]: { hash, at: now() } });
  } else {
    // A foreground reviewer that hands back reports through SubagentHandback,
    // whose verdict hook ran before this result arrived.
    const id = agentKey(response?.agentId);
    const early = id && state.verdicts?.[id];
    if (isApproved(responseText(response)) || early?.hash === hash) state.approvedHash = hash;
    if (early) delete state.verdicts[id];
  }
  state.updatedAt = now();
  writeState(state);
}

// Runs inside the reviewer: for real hook events the harness supplies agent_type
// and agent_id. This is a process guard, not a security boundary; anything with
// shell access could still write the state file. The diff must be the one the
// reviewer was launched on; a later edit needs a new review.
function verdict() {
  if (input.agent_type !== REVIEWER) return;
  const id = agentKey(input.agent_id);
  const state = readState();
  if (!id) return;
  const pending = state.pending?.[id];
  const stopping = input.hook_event_name === "SubagentStop";
  const text = stopping
    ? String(input.last_assistant_message ?? "")
    : String(input.tool_input?.message ?? "");
  if (!pending) {
    // A foreground run: its launch is recorded only when it finishes, so keep
    // the approval and the diff it saw for record() to confirm.
    if (isApproved(text)) {
      state.verdicts = prune({ ...state.verdicts, [id]: { hash: diffHash(), at: now() } });
      writeState(state);
    }
    return;
  }
  if (isApproved(text) && pending.hash === diffHash()) {
    state.approvedHash = pending.hash;
    state.updatedAt = now();
  }
  if (stopping) delete state.pending[id];
  writeState(state);
}

// Only the report's final non-empty line counts, so a report that quotes the
// approved line in its body but ends with needs-fixes does not approve.
function isApproved(text) {
  const last = String(text).trim().split(/\r?\n/).pop() ?? "";
  return /^\W*Verdict:\W*approved\W*$/i.test(last.trim());
}

// A foreground Agent result is a string or a list of content blocks.
function responseText(response) {
  if (typeof response === "string") return response;
  const blocks = Array.isArray(response?.content) ? response.content : [];
  return blocks.filter(block => block?.type === "text").map(block => block.text).join("\n");
}

// Launch results and hook inputs may differ by an "agent-" prefix.
function agentKey(id) {
  return id ? String(id).replace(/^agent-/, "") : null;
}

function prune(pending) {
  const entries = Object.entries(pending ?? {}).sort((a, b) => (a[1].at < b[1].at ? 1 : -1));
  return Object.fromEntries(entries.slice(0, 20));
}

function now() {
  return new Date().toISOString();
}

function commit() {
  const command = String(input.tool_input?.command ?? "");
  if (!/\bgit\b[^;&|]*\bcommit\b/.test(command)) return;
  const hash = diffHash();
  if (!hash) return;
  // A commit takes the index, while the hash reads the working tree. Unless the
  // command stages the working tree itself (-a/--all), they must agree.
  const stagesAll = /\s(-[A-Za-z]*a[A-Za-z]*|--all)(\s|$)/.test(command);
  if (!stagesAll && git(["diff", "--name-only", "-z", "--", ...GATED_PATHS])) {
    respond({
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason:
          `Staged ${GATED_PATHS.join(", ")} content differs from the working tree, which is ` +
          `what was reviewed. Stage the approved changes (git add) before committing.`,
      },
    });
    return;
  }
  if (readState().approvedHash === hash) return;
  respond({
    hookSpecificOutput: {
      hookEventName: "PreToolUse",
      permissionDecision: "deny",
      permissionDecisionReason:
        `The current ${GATED_PATHS.join(", ")} changes have no approved ${REVIEWER} review. ` +
        `Dispatch the ${REVIEWER} subagent on the exact working diff, fix any findings, ` +
        `and get "Verdict: approved" on the final diff before committing.`,
    },
  });
}

function stop() {
  const hash = diffHash();
  if (!hash || readState().reviewedHash === hash) return;
  if (!input.stop_hook_active) {
    respond({
      decision: "block",
      reason:
        `Uncommitted ${GATED_PATHS.join(", ")} changes have not been reviewed by the ` +
        `${REVIEWER} subagent. If this change is complete, dispatch ${REVIEWER} now ` +
        `(spec path, exact diff, relevant files, test evidence) per AGENTS.md. ` +
        `If you are pausing for user input or the work is unfinished, say so briefly and stop.`,
    });
    return;
  }
  if (sessionLogChanged()) {
    respond({
      decision: "block",
      reason:
        `A session log was written, so this work is being reported as complete, but the ` +
        `current changes still have no ${REVIEWER} review. Dispatch ${REVIEWER} before finishing.`,
    });
  }
}

// Hashes every file that differs from HEAD by its path, mode and working-tree
// content, so staging a file (for example a new test) before committing does
// not change the hash of an already-approved diff. --no-renames lists both
// sides of a rename, so the old path's deletion is covered too.
function diffHash() {
  const list = args => git(args).split("\0").filter(Boolean);
  const files = [
    ...new Set([
      ...list(["diff", "HEAD", "--no-renames", "--name-only", "-z", "--", ...GATED_PATHS]),
      ...list(["ls-files", "--others", "--exclude-standard", "-z", "--", ...GATED_PATHS]),
    ]),
  ].sort();
  if (files.length === 0) return null;
  const hash = createHash("sha256");
  for (const file of files) {
    hash.update(`\0${file}\0`);
    try {
      const path = join(root, file);
      const stat = lstatSync(path);
      hash.update(`${stat.mode}\0`);
      hash.update(stat.isSymbolicLink() ? `link:${readlinkSync(path)}` : readFileSync(path));
    } catch {
      hash.update("<missing>");
    }
  }
  return hash.digest("hex");
}

function sessionLogChanged() {
  return git(["status", "--porcelain", "--", "logs"]).trim().length > 0;
}

function git(args) {
  return execFileSync("git", args, {
    cwd: root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024,
  });
}

function readState() {
  try {
    return JSON.parse(readFileSync(statePath, "utf8"));
  } catch {
    return {};
  }
}

function writeState(state) {
  mkdirSync(join(root, "local", "review"), { recursive: true });
  writeFileSync(statePath, `${JSON.stringify(state, null, 2)}\n`);
}

function readInput() {
  try {
    return JSON.parse(readFileSync(0, "utf8") || "{}");
  } catch {
    return {};
  }
}

function respond(payload) {
  process.stdout.write(`${JSON.stringify(payload)}\n`);
}
