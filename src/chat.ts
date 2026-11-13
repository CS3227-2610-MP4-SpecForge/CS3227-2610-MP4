import type { AiDiagnostic } from "./ai-diagnostics";
import type { AssistantIntent } from "./assistance";
import type { RequestFields } from "./requests";
export type ChatTurn = {
  id: string;
  turn_key: string;
  base_revision: number;
  input_fields: RequestFields;
  message: string;
  status: "running" | "completed" | "failed";
  generation: number;
  lease_until: string;
  reply: string | null;
  proposal: RequestFields | null;
  error_code: string | null;
  diagnostic?: AiDiagnostic | null;
  created_at: string;
  intent: AssistantIntent;
};
