export const aiResponseTimeoutMs = 90_000;
// Give the server time to admit the turn and persist the result around the SoC call.
export const aiBrowserTimeoutMs = aiResponseTimeoutMs + 20_000;

export const invalidOutputReasons = ["truncated", "invalid_json", "invalid_schema", "invalid_envelope", "missing_content", "tool_calls", "unexpected_finish", "body_limit", "unsafe_section", "unmatched_edit"] as const;
export type InvalidOutputReason = typeof invalidOutputReasons[number];
export type AiDiagnostic =
  | { source: "local_deadline"; elapsed_ms: number }
  | { source: "network"; elapsed_ms: number }
  | { source: "invalid_output"; reason: InvalidOutputReason }
  | { source: "upstream_http"; elapsed_ms: number; http_status: number };
export function describeAiFailure(code: string | null, diagnostic?: AiDiagnostic | null): string {
  const elapsed = diagnostic && "elapsed_ms" in diagnostic ? (diagnostic.elapsed_ms / 1000).toFixed(1) : "";
  if (code === "invalid_output" && diagnostic?.source === "invalid_output") {
    const reasons: Record<InvalidOutputReason, string> = {
      truncated: "SoC reached the 2,000-token output limit before finishing. Ask for a shorter draft or continue manually.",
      invalid_json: "SoC completed its response, but it was not valid JSON. Your ticket is unchanged; retry explicitly or continue manually.",
      invalid_schema: "SoC returned JSON that did not match the required reply and ticket format. Your ticket is unchanged; retry explicitly or continue manually.",
      invalid_envelope: "SoC returned an unreadable response envelope. Your ticket is unchanged; retry explicitly or continue manually.",
      missing_content: "SoC returned no usable answer text. Your ticket is unchanged; retry explicitly or continue manually.",
      tool_calls: "SoC returned a tool call instead of a ticket response. No tool was executed. Continue manually or retry explicitly.",
      unexpected_finish: "SoC did not report a normal completed response. Your ticket is unchanged; retry explicitly or continue manually.",
      body_limit: "The SoC response exceeded the app’s 64 KiB response limit. Ask for a shorter response or continue manually.",
      unmatched_edit: "AI tried to change text that is not in your ticket exactly once, so nothing was applied. Your ticket is unchanged.",
      unsafe_section: "The acceptance-criteria update could not be safely separated from other sections. Your ticket is unchanged; edit the section manually or request a whole-ticket suggestion.",
    };
    return reasons[diagnostic.reason];
  }
  if (code === "local_timeout" && diagnostic?.source === "local_deadline") {
    const seconds = Math.round(Math.min(diagnostic.elapsed_ms, aiResponseTimeoutMs) / 1000);
    return `AI response timed out after ${seconds} seconds.`;
  }
  if (code === "upstream_http" && diagnostic?.source === "upstream_http") return `SoC returned HTTP ${diagnostic.http_status} after ${elapsed} s. An upstream HTTP error was received; this was not SpecForge's local deadline. Your message is saved.`;
  if (code === "network_error" && diagnostic?.source === "network") return `The connection to SoC failed after ${elapsed} s. No upstream HTTP error response was received. Your message is saved.`;
  const messages: Record<string, string> = {
    unavailable: "AI failed or timed out. No detailed diagnostic was recorded for this turn. Your message is saved; retry explicitly when ready.",
    invalid_output: "AI returned an incomplete or invalid response. Ask for a concise response, or continue manually.",
    context_limit: "The ticket and your instruction exceed the AI context limit. Shorten the ticket or continue editing manually.",
    interrupted: "The previous turn expired. Retry explicitly if needed; an older worker cannot replace the new result.",
    configuration: "AI is not configured for this environment. Continue editing manually.",
  };
  return messages[code ?? ""] ?? "AI turn failed. Your message is saved.";
}
