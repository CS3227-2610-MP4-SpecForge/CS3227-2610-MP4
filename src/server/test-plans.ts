import { aiDiagnostic, diagnosticSources } from "./ai-diagnostics";
import type { AiDiagnostic } from "../ai-diagnostics";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { error, json, readBody } from "./http";
import { taskFields } from "./requests";
import { testCaseKinds, testPlanLimits } from "../test-plans";
import { AiFailure } from "./soc";
import { validateTestPlanReply, type TestPlanProvider } from "./test-plan-ai";

export type TestPlanDependencies = { worker(): SupabaseClient; provider: TestPlanProvider };
const revision = z.number().int().positive().max(2147483647);
const limited = (max: number) => z.string().refine(value => [...value].length <= max);
// Client-submitted plans are strict: storage counts keys and rejects extras.
const testCase = z.strictObject({
  title: limited(testPlanLimits.title).refine(value => value.trim() !== ""),
  kind: z.enum(testCaseKinds),
  preconditions: limited(testPlanLimits.preconditions).optional(),
  steps: z.array(limited(testPlanLimits.step).refine(value => value.trim() !== "")).min(1).max(testPlanLimits.steps),
  expected: limited(testPlanLimits.expected).refine(value => value.trim() !== ""),
});
const planSchema = z.strictObject({ cases: z.array(testCase).min(1).max(testPlanLimits.cases) });
const turnSchema = z.object({
  id: z.uuid(), request_id: z.uuid(), organisation_id: z.uuid(), developer_id: z.uuid(), turn_key: z.uuid(),
  base_revision: revision, input_fields: taskFields, focus: z.string().nullable(), status: z.enum(["running", "completed", "failed"]),
  generation: z.number().int().positive(), lease_until: z.string(), reply: z.string().nullable(), plan: planSchema.nullable(),
  error_code: z.string().nullable(), diagnostic: aiDiagnostic.nullable().default(null), created_at: z.string(),
});
const savedSchema = z.object({
  request_id: z.uuid(), plan: planSchema, revision, ticket_revision: revision,
  saved_by: z.uuid(), saved_by_username: z.string(), created_at: z.string(), updated_at: z.string(),
}).nullable();

function failureResponse(failure: { code?: string } | null) {
  if (!failure) return null;
  if (failure.code === "42501") return error("Test plans are unavailable for this ticket, or access has changed.", 403);
  if (failure.code === "22023") return error("The test plan or ticket snapshot is invalid. Generate a new plan from the current ticket.", 400);
  if (failure.code === "P0001") return error("The ticket or the saved plan changed. Reload the ticket before saving this plan.", 409);
  if (failure.code === "PT429") return error("AI is busy or a usage limit was reached. Wait for a running generation or plan manually.", 429);
  return error("Test plan service unavailable. Nothing was changed.", 503);
}

export async function handleTestPlans(request: Request, client: SupabaseClient, actorId: string, dependencies?: TestPlanDependencies): Promise<Response | null> {
  const match = new URL(request.url).pathname.match(/^\/api\/organisations\/([^/]+)\/requests\/([^/]+)\/test-plan$/);
  if (!match) return null;
  const [, org, id] = match;
  if (!z.uuid().safeParse(org).success || !z.uuid().safeParse(id).success) return error("Not found.", 404);
  // Authorize with the user's own session before constructing privileged worker
  // access or contacting SoC. The worker RPCs independently recheck identity.
  const { data: current, error: readError } = await client.rpc("read_test_plan", { target_org: org, request_id: id });
  const denied = failureResponse(readError); if (denied) return denied;
  const view = z.object({ saved: savedSchema, turns: z.array(turnSchema) }).safeParse(current);
  if (!view.success) return error("Test plan service unavailable.", 503);
  const expired = (turns: typeof view.data.turns) => turns.map(turn =>
    turn.status === "running" && Date.parse(turn.lease_until) <= Date.now() ? { ...turn, status: "failed" as const, error_code: "interrupted" } : turn);

  if (request.method === "GET") return json({ saved: view.data.saved, turns: expired(view.data.turns) });

  if (request.method === "PUT") {
    const input = z.strictObject({ plan: planSchema, ticketRevision: revision, planRevision: revision.nullable().default(null) }).safeParse(await readBody(request, 262144));
    if (!input.success) return error("Check the test plan and the ticket revision before saving.", 400);
    const { data: saved, error: saveError } = await client.rpc("save_test_plan", {
      target_org: org, request_id: id, plan: input.data.plan,
      ticket_revision: input.data.ticketRevision, expected_plan_revision: input.data.planRevision,
    });
    const saveFailure = failureResponse(saveError); if (saveFailure) return saveFailure;
    const parsed = savedSchema.safeParse(saved);
    return parsed.success && parsed.data ? json({ saved: parsed.data }) : error("Test plan service unavailable.", 503);
  }

  if (request.method !== "POST") return error("Not found.", 404);
  const input = z.strictObject({
    key: z.uuid(), revision, fields: taskFields,
    focus: limited(testPlanLimits.focus).trim().min(1).nullable().default(null), retry: z.boolean().default(false),
  }).safeParse(await readBody(request, 262144));
  if (!input.success) return error(`Enter an optional focus note of up to ${testPlanLimits.focus} characters and a valid current ticket.`, 400);
  if (!dependencies) return error("AI is not configured. Plan manually.", 503);
  const worker = dependencies.worker();
  const { data: admission, error: admissionError } = await worker.rpc("begin_test_plan_turn", {
    target_org: org, request_id: id, actor_id: actorId, turn_key: input.data.key,
    base_revision: input.data.revision, input_fields: input.data.fields, focus_note: input.data.focus, retry_failed: input.data.retry,
  });
  const admissionFailure = failureResponse(admissionError); if (admissionFailure) return admissionFailure;
  const parsed = turnSchema.safeParse(admission?.turn);
  if (!parsed.success || typeof admission.dispatch !== "boolean") return error("Test plan service unavailable.", 503);
  const turn = parsed.data;
  if (!admission.dispatch) return json({ turn }, turn.status === "running" ? 202 : 200);

  let result: ReturnType<typeof validateTestPlanReply> | null = null;
  let code: string | null = null;
  let diagnostic: AiDiagnostic | null = null;
  try {
    result = validateTestPlanReply(await dependencies.provider({ fields: turn.input_fields, focus: turn.focus }));
  } catch (failure) {
    code = failure instanceof AiFailure ? failure.code : "unavailable";
    if (diagnosticSources[code] && !(code === "invalid_output" && failure instanceof AiFailure && failure.diagnostic == null)) {
      const safe = aiDiagnostic.safeParse(failure instanceof AiFailure ? failure.diagnostic : null);
      if (safe.success && safe.data.source === diagnosticSources[code]) diagnostic = safe.data;
      else code = "unavailable";
    }
  }
  const { data: completed, error: completionError } = await worker.rpc("finish_test_plan_turn", {
    target_org: org, request_id: id, actor_id: actorId, turn_id: turn.id, worker_generation: turn.generation,
    human_reply: result?.reply ?? null, generated_plan: result?.plan ?? null, failure_code: code, failure_diagnostic: diagnostic,
  });
  const completionFailure = failureResponse(completionError); if (completionFailure) return completionFailure;
  const final = turnSchema.safeParse(completed);
  return final.success ? json({ turn: final.data }) : error("Test plan service unavailable.", 503);
}
