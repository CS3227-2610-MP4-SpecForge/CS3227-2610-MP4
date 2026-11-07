export async function api(path: string, body?: unknown) {
  const response = await fetch(path, {
    method: body === undefined ? "GET" : "POST", cache: "no-store",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(30_000),
  });
  const result = await response.json();
  if (!response.ok) throw new ApiError(typeof result.error === "string" ? result.error : "Unable to complete the request.", response.status);
  return result;
}
export class ApiError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}
export function failureMessage(failure: unknown) {
  return failure instanceof ApiError ? failure.message : "Unable to connect. Check your connection and try again.";
}
