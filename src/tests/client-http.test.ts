import { expect, it, vi } from "vitest";
import { api, failureMessage } from "../components/http";
it("identifies the browser waiting deadline without claiming SoC timed out", async () => {
  const controller = new AbortController();
  const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
  const transport = vi.spyOn(globalThis, "fetch").mockImplementation(async () => { controller.abort(new DOMException("PRIVATE_DETAIL", "TimeoutError")); throw controller.signal.reason; });
  try {
    const failure = await api("/api/example", {}, 75000).catch(error => error);
    expect(failureMessage(failure)).toContain("browser's 75-second waiting limit");
    expect(failureMessage(failure)).not.toContain("PRIVATE_DETAIL");
    expect(timeout).toHaveBeenCalledWith(75000);
  } finally { timeout.mockRestore(); transport.mockRestore(); }
});
