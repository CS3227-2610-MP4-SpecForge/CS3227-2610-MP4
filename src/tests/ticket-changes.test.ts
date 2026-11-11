import { describe, expect, it } from "vitest";
import { applyChange, changeStatus, reviewStatus, summarizeChanges, ticketChanges, undoChange, wordDiff } from "../ticket-changes";

const before = { title: "Tutorial text", description: "## Summary\n\nOld intro.\n\n## Acceptance criteria\n\n- Level 3\n- Level 5" };
const after = { title: "Remove multi-enchantment from tutorials", description: "## Summary\n\nNew intro.\n\n## Acceptance criteria\n\n- Level 3\n- Level 5\n- Level 7" };

describe("ticket changes", () => {
  it("splits a proposal into the title and each changed description block", () => {
    const changes = ticketChanges(before, after);
    expect(changes.map(change => [change.field, change.before, change.after])).toEqual([
      ["title", "Tutorial text", "Remove multi-enchantment from tutorials"],
      ["description", "Old intro.", "New intro."],
      ["description", "", "- Level 7"],
    ]);
    expect(summarizeChanges(changes)).toBe("3 changes: title and 2 in Description");
    expect(summarizeChanges(changes.slice(1, 2))).toBe("1 change in Description");
    expect(summarizeChanges(changes.slice(0, 1))).toBe("1 change: title");
  });

  it("returns no changes for an identical proposal", () => {
    expect(ticketChanges(before, before)).toEqual([]);
  });

  it("applies one change without touching the others, then undoes it", () => {
    const [title, intro, level] = ticketChanges(before, after);
    expect(changeStatus(intro, before)).toBe("open");
    const withIntro = applyChange(intro, before)!;
    expect(withIntro.description).toBe("## Summary\n\nNew intro.\n\n## Acceptance criteria\n\n- Level 3\n- Level 5");
    expect(withIntro.title).toBe("Tutorial text");
    expect(changeStatus(intro, withIntro)).toBe("applied");
    expect(changeStatus(title, withIntro)).toBe("open");
    expect(changeStatus(level, withIntro)).toBe("open");
    expect(undoChange(intro, withIntro)).toEqual(before);
  });

  it("reaches the full proposal by applying every change in any order", () => {
    const changes = ticketChanges(before, after);
    const forward = changes.reduce((fields, change) => applyChange(change, fields)!, before);
    const backward = [...changes].reverse().reduce((fields, change) => applyChange(change, fields)!, before);
    expect(forward).toEqual(after);
    expect(backward).toEqual(after);
  });

  it("keeps changes usable after unrelated edits", () => {
    const [, intro] = ticketChanges(before, after);
    const edited = { ...before, description: before.description.replace("- Level 5", "- Level 5 and 6") };
    expect(changeStatus(intro, edited)).toBe("open");
    expect(applyChange(intro, edited)!.description).toContain("New intro.\n\n## Acceptance criteria\n\n- Level 3\n- Level 5 and 6");
  });

  it("marks a change outdated when its original text was edited", () => {
    const [title, intro] = ticketChanges(before, after);
    const edited = { title: "My own title", description: before.description.replace("Old intro.", "Rewritten intro.") };
    expect(changeStatus(intro, edited)).toBe("outdated");
    expect(changeStatus(title, edited)).toBe("outdated");
    expect(applyChange(intro, edited)).toBeNull();
  });

  it("marks a change outdated when its original text is no longer unique", () => {
    const [, intro] = ticketChanges(before, after);
    const duplicated = { ...before, description: "## Summary\n\nOld intro.\n\nOld intro.\n\nEnd" };
    expect(changeStatus(intro, duplicated)).toBe("outdated");
    expect(applyChange(intro, duplicated)).toBeNull();
  });

  it("anchors insertions and deletions at the start and end of a field", () => {
    const start = ticketChanges({ title: "T", description: "Body" }, { title: "T", description: "Intro\nBody" });
    expect(start.map(change => [change.before, change.after])).toEqual([["", "Intro"]]);
    expect(applyChange(start[0], { title: "T", description: "Body" })).toEqual({ title: "T", description: "Intro\nBody" });
    const end = ticketChanges({ title: "T", description: "Body\nOutro" }, { title: "T", description: "Body" });
    expect(applyChange(end[0], { title: "T", description: "Body\nOutro" })).toEqual({ title: "T", description: "Body" });
    expect(changeStatus(end[0], { title: "T", description: "Body" })).toBe("applied");
  });

  it("fills an empty description and inserts replacement text literally", () => {
    const [change] = ticketChanges({ title: "T", description: "" }, { title: "T", description: "Use $& and $1 literally" });
    expect(applyChange(change, { title: "T", description: "" })).toEqual({ title: "T", description: "Use $& and $1 literally" });
  });

  it("reports the change card status from the ticket and this page's rejections", () => {
    const changes = ticketChanges(before, after);
    const [title, intro, level] = changes;
    expect(reviewStatus(changes, before, new Set())).toBe("Not reviewed");
    expect(reviewStatus(changes, applyChange(intro, before)!, new Set())).toBe("1 of 3 applied");
    expect(reviewStatus(changes, applyChange(intro, before)!, new Set([title.id, level.id]))).toBe("1 of 3 applied");
    expect(reviewStatus(changes, after, new Set())).toBe("All applied");
    expect(reviewStatus(changes, before, new Set(changes.map(change => change.id)))).toBe("Dismissed");
    expect(reviewStatus(changes, { title: "Other", description: "Other" }, new Set())).toBe("Outdated");
  });

  it("highlights only the changed words on each side", () => {
    expect(wordDiff("Change the start of level tutorial", "Change the end of level tutorial")).toEqual({
      before: [{ text: "Change the ", changed: false }, { text: "start ", changed: true }, { text: "of level tutorial", changed: false }],
      after: [{ text: "Change the ", changed: false }, { text: "end ", changed: true }, { text: "of level tutorial", changed: false }],
    });
  });

  it.each([
    ["a new paragraph between blank lines", "# H\n\nPara one.\n\nPara two.", "# H\n\nPara one.\n\nNew para.\n\nPara two."],
    ["a repeated line", "A\nB", "A\nB\nB"],
    ["an extra blank line", "A\n\nB", "A\n\n\nB"],
    ["a removed duplicate line", "A\nA\nB", "A\nB"],
  ])("tracks %s as open, then applied, then undone", (_name, from, to) => {
    const original = { title: "T", description: from };
    const changes = ticketChanges(original, { title: "T", description: to });
    expect(changes.length).toBeGreaterThan(0);
    for (const change of changes) expect(changeStatus(change, original)).toBe("open");
    const applied = changes.reduce((fields, change) => applyChange(change, fields)!, original);
    expect(applied.description).toBe(to);
    for (const change of changes) expect(changeStatus(change, applied)).toBe("applied");
    expect(changes.reduceRight((fields, change) => undoChange(change, fields)!, applied)).toEqual(original);
  });
});
