import { constrainSuggestion } from "./task-suggestions";
import { aiDiagnostic, diagnosticSources } from "./ai-diagnostics";
import type { AiDiagnostic } from "../ai-diagnostics";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { error, json, readBody } from "./http";
import { taskFields } from "./requests";
import { AiFailure, validateAiReply, type AiProvider } from "./soc";
export type ChatDependencies = { worker(): SupabaseClient; provider: AiProvider };
const turnSchema = z.object({ id: z.uuid(), request_id: z.uuid(), organisation_id: z.uuid(), author_id: z.uuid(), turn_key: z.uuid(), base_revision: z.number().int().positive(), input_fields: taskFields, message: z.string(), status: z.enum(["running", "completed", "failed"]), generation: z.number().int().positive(), lease_until: z.string(), reply: z.string().nullable(), proposal: taskFields.nullable(), error_code: z.string().nullable(), diagnostic: aiDiagnostic.nullable().default(null), created_at: z.string() });
function failureResponse(failure: { code?: string } | null) {
  if (!failure) return null;
  if (failure.code === "42501") return error("Chat unavailable or access has changed.", 403);
  if (failure.code === "22023") return error("The message or task snapshot is invalid. Send a new message using the current task.", 400);
  if (failure.code === "P0001") return error("The task or AI turn changed. Refresh chat and check the saved task before continuing.", 409);
  if (failure.code === "PT429") return error("AI is busy or an account/conversation limit was reached. Refresh chat; wait for a running turn or continue editing manually.", 429);
  return error("Chat service unavailable. Refresh chat before retrying; your task text is preserved.", 503);
}
export async function handleChat(request: Request, client: SupabaseClient, actorId: string, dependencies?: ChatDependencies): Promise<Response | null> {
  const match = new URL(request.url).pathname.match(/^\/api\/organisations\/([^/]+)\/requests\/([^/]+)\/chat$/);
  if (!match) return null;
  const [, org, id] = match;
  if (!z.uuid().safeParse(org).success || !z.uuid().safeParse(id).success) return error("Not found.", 404);
  // Authorize with the user's session before constructing privileged worker
  // access or contacting SoC. Worker RPCs independently recheck that identity.
  const { data: history, error: readError } = await client.rpc("read_chat", { target_org: org, request_id: id });
  const denied = failureResponse(readError); if (denied) return denied;
  if (request.method === "GET") {
    const parsed = z.array(turnSchema).safeParse(history);
    return parsed.success ? json({ turns: parsed.data.map(turn => turn.status === "running" && Date.parse(turn.lease_until) <= Date.now() ? { ...turn, status: "failed", error_code: "interrupted" } : turn) }) : error("Chat service unavailable.", 503);
  }
  if (request.method !== "POST") return error("Not found.", 404);
  const input = z.strictObject({ key: z.uuid(), revision: z.number().int().positive().max(2147483647), fields: taskFields, message: z.string().trim().min(1).refine(value => [...value].length <= 4000), retry: z.boolean().default(false) }).safeParse(await readBody(request, 262144));
  if (!input.success) return error("Enter a message of 1–4,000 characters and a valid current task.", 400);
  if (!dependencies) return error("AI is not configured. Continue editing manually.", 503);
  const worker = dependencies.worker();
  const { data: admission, error: admissionError } = await worker.rpc("begin_chat_turn", { target_org: org, request_id: id, actor_id: actorId, turn_key: input.data.key, base_revision: input.data.revision, input_fields: input.data.fields, user_message: input.data.message, retry_failed: input.data.retry });
  const admissionFailure = failureResponse(admissionError); if (admissionFailure) return admissionFailure;
  const parsed = turnSchema.safeParse(admission?.turn);
  if (!parsed.success || typeof admission.dispatch !== "boolean") return error("Chat service unavailable. Refresh before retrying.", 503);
  const turn = parsed.data;
  if (!admission.dispatch) return json({ turn }, turn.status === "running" ? 202 : 200);
  let result: ReturnType<typeof validateAiReply> | null = null;
  let code: string | null = null;
  let diagnostic: AiDiagnostic | null = null;
  try {
    const context = z.array(z.object({ message: z.string(), reply: z.string().nullable(), proposal: taskFields.nullable() })).parse(admission.history);
    result = constrainSuggestion(turn.message, turn.input_fields, validateAiReply(await dependencies.provider({ fields: turn.input_fields, message: turn.message, history: context })));
  } catch (failure) {
    code = failure instanceof AiFailure ? failure.code : "unavailable";
    if (diagnosticSources[code] && !(code === "invalid_output" && failure instanceof AiFailure && failure.diagnostic == null)) {
      const safe = aiDiagnostic.safeParse(failure instanceof AiFailure ? failure.diagnostic : null);
      if (safe.success && safe.data.source === diagnosticSources[code]) diagnostic = safe.data;
      else code = "unavailable";
    }
  }
  const { data: completed, error: completionError } = await worker.rpc("finish_chat_turn", { target_org: org, request_id: id, actor_id: actorId, turn_id: turn.id, worker_generation: turn.generation, human_reply: result?.reply ?? null, task_proposal: result?.proposal ?? null, failure_code: code, failure_diagnostic: diagnostic });
  const completionFailure = failureResponse(completionError); if (completionFailure) return completionFailure;
  const final = turnSchema.safeParse(completed);
  return final.success ? json({ turn: final.data }) : error("Chat service unavailable. Refresh before retrying.", 503);
}
