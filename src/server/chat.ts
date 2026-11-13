import { aiDiagnostic, diagnosticSources } from "./ai-diagnostics";
import type { AiDiagnostic } from "../ai-diagnostics";
import { assistanceMessages, assistantIntents, messageLimit } from "../assistance";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { error, json, logFailure, readBody, serviceUnavailable } from "./http";
import { taskFields } from "./requests";
import { AiFailure, pauseFor, type AiProvider, type AiReply } from "./soc";
import { limitBlock, limitResponse, type AiLimits } from "./ai-limits";
export type ChatDependencies = { worker(): SupabaseClient; provider: AiProvider };
const intent = z.enum(assistantIntents);
const turnSchema = z.object({
  id: z.uuid(),
  request_id: z.uuid(),
  organisation_id: z.uuid(),
  author_id: z.uuid(),
  turn_key: z.uuid(),
  base_revision: z.number().int().positive(),
  input_fields: taskFields,
  message: z.string(),
  status: z.enum(["running", "completed", "failed"]),
  generation: z.number().int().positive(),
  lease_until: z.string(),
  reply: z.string().nullable(),
  proposal: taskFields.nullable(),
  error_code: z.string().nullable(),
  diagnostic: aiDiagnostic.nullable().default(null),
  created_at: z.string(),
  intent: intent.default("edit"),
});
const usageSchema = z.object({
  remaining: z.number().int().min(0),
  limit: z.number().int().positive(),
  resets_at: z.string().nullable(),
  daily_used: z.number().int().min(0),
  daily_resets_at: z.string(),
});
const manual = "or keep editing manually.";
// Provider output is rechecked here because the provider is injectable.
const replySchema = z.object({
  reply: z.string().refine(value => value.trim() !== ""),
  proposal: taskFields.nullable().default(null),
});
// Fixed user-facing strings keyed by fixed database messages; raw database text never reaches the browser.
const limits: Record<string, string> = {
  "Another AI turn is running": "Another AI request is still running. Wait for it to finish, or keep editing manually.",
  "AI usage limit reached":
    "You have used all your AI requests for this hour. Keep editing manually until more are available.",
  "AI attempt limit reached": "Too many AI attempts this hour. Keep editing manually and try again later.",
  "Conversation capacity reached": "This ticket's AI history is full. Keep editing manually.",
};
function failureResponse(request: Request, failure: { code?: string; message?: string } | null) {
  if (!failure) return null;
  if (failure.code === "42501") return error("Chat unavailable or access has changed.", 403);
  if (failure.code === "22023")
    return error("The request or ticket snapshot is invalid. Send a new request using the current ticket.", 400);
  if (failure.code === "P0001")
    return error("The ticket or AI request changed. Check the saved ticket before continuing.", 409);
  if (failure.code === "PT429")
    return error(limits[failure.message ?? ""] ?? "AI is busy. Keep editing manually and try again later.", 429);
  return serviceUnavailable(request, failure, "AI is unavailable right now. Your ticket is unchanged.");
}
// The caller's own hourly and daily usage. The daily cap comes from server
// configuration; without it the daily meter is omitted.
async function usageOf(client: SupabaseClient, limits: AiLimits | null | undefined) {
  const { data } = await client.rpc("read_ai_usage");
  const parsed = usageSchema.safeParse(data);
  if (!parsed.success) return null;
  const { daily_used, daily_resets_at, ...hourly } = parsed.data;
  return limits
    ? {
        ...hourly,
        daily: {
          remaining: Math.max(0, limits.user_per_day - daily_used),
          limit: limits.user_per_day,
          resets_at: daily_resets_at,
        },
      }
    : hourly;
}
export async function handleChat(
  request: Request,
  client: SupabaseClient,
  actorId: string,
  dependencies?: ChatDependencies,
  limits?: AiLimits | null,
): Promise<Response | null> {
  const match = new URL(request.url).pathname.match(/^\/api\/organisations\/([^/]+)\/requests\/([^/]+)\/chat$/);
  if (!match) return null;
  const [, org, id] = match;
  if (!z.uuid().safeParse(org).success || !z.uuid().safeParse(id).success) return error("Not found.", 404);
  // Authorize with the user's session before constructing privileged worker
  // access or contacting SoC. Worker RPCs independently recheck that identity.
  const { data: history, error: readError } = await client.rpc("read_chat", { target_org: org, request_id: id });
  const denied = failureResponse(request, readError);
  if (denied) return denied;
  if (request.method === "GET") {
    const parsed = z.array(turnSchema).safeParse(history);
    return parsed.success
      ? json({
          turns: parsed.data.map(turn =>
            turn.status === "running" && Date.parse(turn.lease_until) <= Date.now()
              ? { ...turn, status: "failed", error_code: "interrupted" }
              : turn,
          ),
          usage: await usageOf(client, limits),
        })
      : serviceUnavailable(request, parsed.error, "Chat service unavailable.");
  }
  if (request.method !== "POST") return error("Not found.", 404);
  const input = z
    .strictObject({
      key: z.uuid(),
      revision: z.number().int().positive().max(2147483647),
      fields: taskFields,
      intent,
      message: z
        .string()
        .trim()
        .refine(value => [...value].length <= messageLimit)
        .optional(),
      retry: z.boolean().default(false),
    })
    .refine(value => value.intent !== "edit" || Boolean(value.message))
    .safeParse(await readBody(request, 262144));
  if (!input.success) return error("Enter a message of 1–4,000 characters and a valid current ticket.", 400);
  if (!dependencies || !limits)
    return serviceUnavailable(request, undefined, "AI is not configured. Continue editing manually.");
  // A draft carries the PM's own rough idea when they typed one, else a fixed message.
  const message = input.data.message || assistanceMessages.draft;
  const worker = dependencies.worker();
  const { data: admission, error: admissionError } = await worker.rpc("begin_chat_turn", {
    target_org: org,
    request_id: id,
    actor_id: actorId,
    turn_key: input.data.key,
    base_revision: input.data.revision,
    input_fields: input.data.fields,
    user_message: message,
    retry_failed: input.data.retry,
    p_intent: input.data.intent,
    p_answers: null,
    ai_limits: limits,
  });
  const block = limitBlock(admissionError);
  if (block) return limitResponse(block, manual, limits, { usage: await usageOf(client, limits) });
  const admissionFailure = failureResponse(request, admissionError);
  if (admissionFailure)
    return admissionFailure.status === 429
      ? json({ ...(await admissionFailure.json()), usage: await usageOf(client, limits) }, 429)
      : admissionFailure;
  const parsed = turnSchema.safeParse(admission?.turn);
  if (!parsed.success || typeof admission.dispatch !== "boolean")
    return serviceUnavailable(request, parsed.error, "Chat service unavailable.");
  const turn = parsed.data;
  if (!admission.dispatch)
    return json({ turn, usage: await usageOf(client, limits) }, turn.status === "running" ? 202 : 200);
  let result: AiReply | null = null;
  let code: string | null = null;
  let diagnostic: AiDiagnostic | null = null;
  let pause: number | null = null;
  try {
    const recent = z
      .array(z.object({ message: z.string(), reply: z.string() }))
      .max(3)
      .parse(admission.history);
    const reply = replySchema.safeParse(
      await dependencies.provider({
        intent: turn.intent,
        fields: turn.input_fields,
        message: turn.message,
        recent,
      }),
    );
    if (!reply.success) throw new AiFailure("invalid_output", { source: "invalid_output", reason: "invalid_schema" });
    result = reply.data;
  } catch (failure) {
    code = failure instanceof AiFailure ? failure.code : "unavailable";
    if (
      diagnosticSources[code] &&
      !(code === "invalid_output" && failure instanceof AiFailure && failure.diagnostic == null)
    ) {
      const safe = aiDiagnostic.safeParse(failure instanceof AiFailure ? failure.diagnostic : null);
      if (safe.success && safe.data.source === diagnosticSources[code]) diagnostic = safe.data;
      else code = "unavailable";
    }
    pause = pauseFor(failure, diagnostic);
    logFailure(request, failure, { diagnostic });
  }
  const { data: completed, error: completionError } = await worker.rpc("finish_chat_turn", {
    target_org: org,
    request_id: id,
    actor_id: actorId,
    turn_id: turn.id,
    worker_generation: turn.generation,
    human_reply: result?.reply ?? null,
    task_proposal: result?.proposal ?? null,
    task_questions: null,
    failure_code: code,
    failure_diagnostic: diagnostic,
    pause_seconds: pause,
  });
  const completionFailure = failureResponse(request, completionError);
  if (completionFailure) return completionFailure;
  const final = turnSchema.safeParse(completed);
  return final.success
    ? json({ turn: final.data, usage: await usageOf(client, limits) })
    : serviceUnavailable(request, final.error, "Chat service unavailable.");
}
