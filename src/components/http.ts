export async function api(path: string, body?: unknown, timeoutMs = 30000, method?: "PUT") {
  const deadline = AbortSignal.timeout(timeoutMs);
  try {
    const response = await fetch(path, {
      method: method ?? (body === undefined ? "GET" : "POST"), cache: "no-store",
      headers: body === undefined ? {} : { "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body), signal: deadline,
    });
    reportSession(path, response);
    const result = await response.json();
    if (!response.ok) throw new ApiError(typeof result.error === "string" ? result.error : "Unable to complete the request.", response.status, result);
    return result;
  } catch (failure) {
    if (deadline.aborted) throw new ApiWaitTimeout(timeoutMs);
    throw failure;
  }
}
export class ApiWaitTimeout extends Error {
  constructor(readonly timeoutMs: number) { super(`This request exceeded the browser's ${timeoutMs / 1000}-second waiting limit. The app may still be processing; refresh before retrying.`); }
}
export class ApiError extends Error {
  constructor(message: string, readonly status: number, readonly body?: unknown) { super(message); }
}
export function failureMessage(failure: unknown) {
  return failure instanceof ApiError || failure instanceof ApiWaitTimeout ? failure.message : "Unable to connect. Check your connection and try again.";
}

// One shared "signed out" signal for every api call. Sign-in answers rejected
// credentials with 401 too, so auth endpoints never report an ended session.
const session = new EventTarget();
function reportSession(path: string, response: Response) {
  const auth = new URL(path, "http://app.invalid").pathname.startsWith("/api/auth/");
  if (response.status === 401 && !auth) session.dispatchEvent(new Event("expired"));
  else if (response.ok && (!auth || path === "/api/auth/signin")) session.dispatchEvent(new Event("active"));
}
/** Calls `listener(false)` on a 401 from any api call, and `listener(true)` once a call succeeds again. */
export function onSessionChange(listener: (active: boolean) => void) {
  const expired = () => listener(false), active = () => listener(true);
  session.addEventListener("expired", expired); session.addEventListener("active", active);
  return () => { session.removeEventListener("expired", expired); session.removeEventListener("active", active); };
}
