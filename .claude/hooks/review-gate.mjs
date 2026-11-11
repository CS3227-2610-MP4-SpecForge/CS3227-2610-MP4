#!/usr/bin/env node
// Review gate for Claude Code hooks. Ensures the code-reviewer subagent has
// seen the current src/ working diff before a turn ends or a commit is made.
//
// Modes (first argument):
//   record  PostToolUse on Agent/Task: remember the diff the reviewer saw.
//   commit  PreToolUse on Bash: deny `git commit` unless that diff was approved.
//   stop    Stop: ask for a review once; insist if a session log was written.
//
// State lives in ignored local/review/state.json. Set SPECFORGE_REVIEW_GATE=off
// in the environment to disable the gate for a human-driven session.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
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
  const text = JSON.stringify(input.tool_response ?? "");
  const approved = /Verdict:\W*approved/i.test(text);
  const state = readState();
  state.reviewedHash = hash;
  if (approved) state.approvedHash = hash;
  state.updatedAt = new Date().toISOString();
  writeState(state);
}

function commit() {
  const command = String(input.tool_input?.command ?? "");
  if (!/\bgit\b[^;&|]*\bcommit\b/.test(command)) return;
  const hash = diffHash();
  if (!hash || readState().approvedHash === hash) return;
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

function diffHash() {
  const tracked = git(["diff", "HEAD", "--binary", "--", ...GATED_PATHS]);
  const untracked = git([
    "ls-files", "--others", "--exclude-standard", "-z", "--", ...GATED_PATHS,
  ]).split("\0").filter(Boolean).sort();
  if (!tracked && untracked.length === 0) return null;
  const hash = createHash("sha256").update(tracked);
  for (const file of untracked) {
    hash.update(`\0${file}\0`);
    try {
      hash.update(readFileSync(join(root, file)));
    } catch {
      hash.update("<unreadable>");
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
