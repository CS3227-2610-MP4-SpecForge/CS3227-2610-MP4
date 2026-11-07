export type AiDiagnostic =
  | { source: "local_deadline"; elapsed_ms: number }
  | { source: "network"; elapsed_ms: number }
  | { source: "upstream_http"; elapsed_ms: number; http_status: number };
export function describeAiFailure(code: string | null, diagnostic?: AiDiagnostic | null): string {
  const elapsed = diagnostic ? (diagnostic.elapsed_ms / 1000).toFixed(1) : "";
  if (code === "local_timeout" && diagnostic?.source === "local_deadline") return `SpecForge stopped waiting for SoC after ${elapsed} s (local 60-second deadline). SoC may still be processing. Your message is saved.`;
  if (code === "upstream_http" && diagnostic?.source === "upstream_http") return `SoC returned HTTP ${diagnostic.http_status} after ${elapsed} s. An upstream HTTP error was received; this was not SpecForge's local deadline. Your message is saved.`;
  if (code === "network_error" && diagnostic?.source === "network") return `The connection to SoC failed after ${elapsed} s. No upstream HTTP error response was received. Your message is saved.`;
  const messages: Record<string, string> = {
    unavailable: "AI failed or timed out. No detailed diagnostic was recorded for this turn. Your message is saved; retry explicitly when ready.",
    invalid_output: "AI returned an incomplete or invalid response. Ask for a concise response, or continue manually.",
    context_limit: "The full task and conversation exceed the AI context limit. Nothing was omitted. Continue editing the task manually.",
    interrupted: "The previous turn expired. Retry explicitly if needed; an older worker cannot replace the new result.",
    configuration: "AI is not configured for this environment. Continue editing manually.",
  };
  return messages[code ?? ""] ?? "AI turn failed. Your message is saved.";
}
