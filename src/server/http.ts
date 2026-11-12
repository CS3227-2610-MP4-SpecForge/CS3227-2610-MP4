import { aiDiagnostic } from "./ai-diagnostics";
const headers = { "Cache-Control": "private, no-store", Vary: "Cookie, Origin", "X-Content-Type-Options": "nosniff" };
export function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers });
}
export function error(message: string, status: number) {
  return json({ error: message }, status);
}
export class InputError extends Error {
  constructor(readonly status: number) {
    super("Invalid request.");
  }
}
export async function readBody(request: Request, limit = 8192): Promise<unknown> {
  if (request.headers.get("content-type")?.split(";")[0].trim() !== "application/json") throw new InputError(415);
  const reader = request.body?.getReader();
  if (!reader) throw new InputError(400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel();
        throw new InputError(413);
      }
      chunks.push(value);
    }
    const bytes = new Uint8Array(size);
    let position = 0;
    for (const chunk of chunks) {
      bytes.set(chunk, position);
      position += chunk.byteLength;
    }
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch (failure) {
    if (failure instanceof InputError) throw failure;
    throw new InputError(400);
  } finally {
    reader.releaseLock();
  }
}

// Failure logging: one JSON line of allowlisted fields. Messages, bodies,
// headers and identifiers are excluded by construction, never by redaction.
const methods = new Set(["GET", "POST", "PUT", "PATCH", "DELETE"]);
const areas = new Set(["auth", "invitations", "organisations", "account"]);
const routeWords = new Set([
  ...areas,
  "signup",
  "signin",
  "verify",
  "resend",
  "signout",
  "members",
  "requests",
  "ticket-members",
  "delivery",
  "activity",
  "chat",
  "test-plan",
]);
const identifier = /^[A-Za-z_$][\w$]{0,63}$/;
const failureCode = /^[A-Za-z0-9_]{1,64}$/;
function routeOf(pathname: string) {
  const segments = pathname.split("/").slice(1);
  if (segments.length > 8 || segments[0] !== "api" || !areas.has(segments[1])) return "/:unknown";
  return "/" + segments.map(segment => (routeWords.has(segment) || segment === "api" ? segment : ":id")).join("/");
}
// Reads one property; a throwing getter or proxy counts as absent.
function field(failure: unknown, key: string): unknown {
  try {
    return (typeof failure === "object" && failure !== null) || typeof failure === "function"
      ? (failure as Record<string, unknown>)[key]
      : undefined;
  } catch {
    return undefined;
  }
}
export type FailureDetails = { status?: number; diagnostic?: unknown };
export function logFailure(request: Request, failure: unknown, details: FailureDetails = {}) {
  try {
    const entry: Record<string, unknown> = {
      event: "server_failure",
      method: methods.has(request.method) ? request.method : "OTHER",
      route: routeOf(new URL(request.url).pathname),
    };
    if (details.status !== undefined) entry.status = details.status;
    const name = field(field(failure, "constructor"), "name");
    entry.error = failure === undefined ? "None" : typeof name === "string" && identifier.test(name) ? name : "Unknown";
    const code = field(failure, "code");
    if (typeof code === "string" && failureCode.test(code)) entry.code = code;
    // Only auth errors carry an upstream HTTP status; local errors are not conflated with it.
    const upstream = field(failure, "status");
    if (
      field(failure, "__isAuthError") === true &&
      Number.isInteger(upstream) &&
      (upstream as number) >= 100 &&
      (upstream as number) <= 599
    )
      entry.upstreamStatus = upstream;
    if (details.diagnostic != null) {
      const safe = aiDiagnostic.safeParse(details.diagnostic);
      if (safe.success) entry.diagnostic = safe.data;
    }
    console.error(JSON.stringify(entry));
  } catch {
    // Logging must never change the response.
  }
}
// An unexpected failure becomes this response; the caller's message is unchanged.
export function serviceUnavailable(request: Request, failure: unknown, message: string) {
  logFailure(request, failure, { status: 503 });
  return error(message, 503);
}
