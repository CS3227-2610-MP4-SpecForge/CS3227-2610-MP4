import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { expect, it } from "vitest";
import { localFixture } from "./local.fixture";
it.skipIf(process.env.SPECFORGE_MIGRATION_TEST !== "1")("migrates legacy maximum-length published fields and empty drafts without changing identity or dates", async () => {
  const fixture = localFixture();
  try {
    const pm = await fixture.actor("PM");
    const org = (await pm.client.rpc("create_organisation", { organisation_name: "Migration fixture" })).data;
    const empty = (await pm.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
    if ("description" in empty.fields) throw new Error("Run this one-off migration check before applying the two-field migration.");
    const legacy = { title: "Preserved", problem: "🙂".repeat(4000), behaviour: "漢".repeat(4000), acceptance: "x".repeat(4000), out_of_scope: "y".repeat(4000), assumptions: "z".repeat(4000) };
    const published = await pm.client.rpc("publish_request", { target_org: org, request_id: empty.id, expected_revision: 1, content: legacy, acknowledged: true, first_submission: true });
    expect(published.error).toBeNull();
    const blank = (await pm.client.rpc("create_request", { target_org: org, creation_key: randomUUID() })).data;
    try { execFileSync("node_modules/.bin/supabase", ["migration", "up", "--local", "--workdir", "src"], { stdio: ["ignore", "pipe", "pipe"], timeout: 60000 }); }
    catch { throw new Error("Local migration failed; provider output suppressed."); }
    const converted = (await pm.client.rpc("read_request", { target_org: org, request_id: empty.id })).data;
    expect(converted).toMatchObject({ id: empty.id, author_id: pm.id, revision: 2, created_at: published.data.created_at, updated_at: published.data.updated_at, submitted_at: published.data.submitted_at });
    expect(Object.keys(converted.fields).sort()).toEqual(["description", "title"]);
    expect(converted.fields).toEqual({ title: "Preserved", description: `## Problem description\n\n${legacy.problem}\n\n## Desired behaviour\n\n${legacy.behaviour}\n\n## Acceptance criteria\n\n${legacy.acceptance}\n\n## Out of scope\n\n${legacy.out_of_scope}\n\n## Assumptions / unresolved questions\n\n${legacy.assumptions}` });
    expect((await pm.client.rpc("read_request", { target_org: org, request_id: blank.id })).data.fields).toEqual({ title: "", description: "" });
  } finally { await fixture.cleanup(); }
});
