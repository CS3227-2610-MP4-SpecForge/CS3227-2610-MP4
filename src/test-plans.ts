import type { AiDiagnostic } from "./ai-diagnostics";
import type { RequestFields } from "./requests";

// One definition of the plan shape and its caps, shared by the client, the
// server schema and the SoC instructions. private.valid_test_plan in the
// migration is the storage-side authority and must agree with these numbers.
export const testPlanLimits = { cases: 12, title: 160, preconditions: 500, steps: 10, step: 300, expected: 500, focus: 500 } as const;
export const testCaseKinds = ["happy", "edge", "failure"] as const;
export type TestCaseKind = (typeof testCaseKinds)[number];
export const testCaseKindLabels: Record<TestCaseKind, string> = { happy: "Happy path", edge: "Edge case", failure: "Failure" };
export type TestCase = { title: string; kind: TestCaseKind; preconditions?: string; steps: string[]; expected: string };
export type TestPlan = { cases: TestCase[] };

export type TestPlanTurn = {
  id: string; turn_key: string; base_revision: number; input_fields: RequestFields;
  focus: string | null; status: "running" | "completed" | "failed"; generation: number;
  lease_until: string; reply: string | null; plan: TestPlan | null;
  error_code: string | null; diagnostic?: AiDiagnostic | null; created_at: string;
};
export type SavedTestPlan = {
  request_id: string; plan: TestPlan; revision: number; ticket_revision: number;
  saved_by: string; saved_by_username: string; created_at: string; updated_at: string;
};

// A saved plan built against older ticket content must not be written over newer
// wording, and a proposal from an earlier revision cannot be saved at all.
export function planIsStale(plan: Pick<SavedTestPlan, "ticket_revision">, ticketRevision: number) {
  return plan.ticket_revision !== ticketRevision;
}
export function countKinds(plan: TestPlan) {
  return testCaseKinds.map(kind => ({ kind, count: plan.cases.filter(item => item.kind === kind).length })).filter(entry => entry.count > 0);
}
