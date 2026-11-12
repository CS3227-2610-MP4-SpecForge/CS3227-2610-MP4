import { invalidOutputReasons } from "../ai-diagnostics";
import { z } from "zod";
const elapsed = z.number().int().min(0).max(2147483647);
export const aiDiagnostic = z.discriminatedUnion("source", [
  z.strictObject({ source: z.literal("invalid_output"), reason: z.enum(invalidOutputReasons) }),
  z.strictObject({ source: z.literal("local_deadline"), elapsed_ms: elapsed }),
  z.strictObject({ source: z.literal("network"), elapsed_ms: elapsed }),
  z.strictObject({
    source: z.literal("upstream_http"),
    elapsed_ms: elapsed,
    http_status: z.number().int().min(300).max(599),
  }),
]);
export const diagnosticSources: Record<string, string> = {
  invalid_output: "invalid_output",
  local_timeout: "local_deadline",
  network_error: "network",
  upstream_http: "upstream_http",
};
