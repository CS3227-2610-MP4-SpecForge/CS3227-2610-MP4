import { describe, expect, it, vi } from "vitest";
import { createSocProvider } from "../server/soc";
const configuration = { baseUrl: "https://soclaas-api.comp.nus.edu.sg/v1", model: "fixture-model", key: "fixture-key" };
const input = { fields: { title: "Search", description: "Find requests" }, message: "Help clarify", history: [] };
const envelope = (content: string, finish = "stop") => Response.json({ choices: [{ finish_reason: finish, message: { content } }] });
describe("SoC provider interface", () => {
  it("accepts human-only replies and complete task proposals through the bounded SoC request", async () => {
    let wire: Record<string, unknown> = {};
    const provider = createSocProvider(configuration, async (_url, init) => { wire = JSON.parse(String(init?.body)); return envelope(JSON.stringify({ reply: "Here is a draft.", proposal: { title: "Search requests", description: "## Desired behaviour\n\n- Search titles" } })); });
    expect(await provider(input)).toEqual({ reply: "Here is a draft.", proposal: { title: "Search requests", description: "## Desired behaviour\n\n- Search titles" } });
    expect(wire).toMatchObject({ max_tokens: 2000, reasoning_effort: "none", response_format: { type: "json_object" }, model: "fixture-model" });
    expect(await createSocProvider(configuration, async () => envelope('{"reply":"Who is the user?","proposal":null}'))(input)).toEqual({ reply: "Who is the user?", proposal: null });
  });
  it("accepts valid JSON replies when the provider includes an empty tool-call list", async () => {
    const provider = createSocProvider(configuration, async () => Response.json({ choices: [{ finish_reason: "stop", message: { content: '{"reply":"Draft ready.","proposal":null}', tool_calls: [] } }] }));
    expect(await provider(input)).toEqual({ reply: "Draft ready.", proposal: null });
  });
  it("accepts replies longer than 4,000 characters within the bounded response body", async () => {
    const reply = "x".repeat(8001);
    expect(await createSocProvider(configuration, async () => envelope(JSON.stringify({ reply, proposal: null })))(input)).toEqual({ reply, proposal: null });
  });
  it.each([
    [() => envelope('{"reply":"Partial","proposal":null}', "length"), "truncated"],
    [() => envelope('not JSON'), "invalid_json"],
    [() => envelope(JSON.stringify({ reply: "x".repeat(65536), proposal: null })), "body_limit"],
    [() => envelope('{"reply":"Hi","proposal":{"title":"Only title"}}'), "invalid_schema"],
    [() => envelope('{"reply":"Hi","proposal":null,"publish":true}'), "invalid_schema"],
    [() => envelope(JSON.stringify({ reply: "   ", proposal: null })), "invalid_schema"],
    [() => Response.json({ choices: [] }), "invalid_envelope"],
    [() => new Response("not a provider envelope"), "invalid_envelope"],
    [() => Response.json({ choices: [{ finish_reason: "stop", message: { content: null } }] }), "missing_content"],
    [() => Response.json({ choices: [{ finish_reason: "stop", message: { content: "{}", tool_calls: [{ type: "function" }] } }] }), "tool_calls"],
    [() => envelope('{}', "PRIVATE_FINISH_REASON"), "unexpected_finish"],
  ] as const)("records a safe invalid-output reason without exposing provider text", async (response, reason) => {
    const failure = await createSocProvider(configuration, async () => response())(input).catch(error => error);
    expect(failure).toMatchObject({ code: "invalid_output", diagnostic: { source: "invalid_output", reason } });
    expect(JSON.stringify(failure)).not.toContain("PRIVATE_FINISH_REASON");
  });
  it("rejects oversized context without dropping history or contacting SoC", async () => {
    let calls = 0;
    const provider = createSocProvider(configuration, async () => { calls++; return envelope('{}'); });
    await expect(provider({ ...input, history: [{ message: "x".repeat(49000), reply: null, proposal: null }] })).rejects.toMatchObject({ code: "context_limit" });
    expect(calls).toBe(0);
  });
  it("maps transport/provider errors to safe failures with no automatic retry", async () => {
    let calls = 0;
    const provider = createSocProvider(configuration, async () => { calls++; return Response.json({ error: "private provider diagnostic" }, { status: 429 }); });
    await expect(provider(input)).rejects.toMatchObject({ code: "upstream_http", diagnostic: { http_status: 429 } });
    expect(calls).toBe(1);
  });
  it("classifies a transport rejection as network_error rather than invalid model output", async () => {
    await expect(createSocProvider(configuration, async () => { throw new TypeError("synthetic network failure"); })(input)).rejects.toMatchObject({ code: "network_error", diagnostic: { source: "network", elapsed_ms: expect.any(Number) } });
  });

  it("distinguishes a received upstream 502 from our local timeout with safe timing/status", async () => {
    const provider = createSocProvider(configuration, async () => Response.json({ error: "PRIVATE_PROVIDER_BODY" }, { status: 502 }));
    const failure = await provider(input).catch(error => error);
    expect(failure).toMatchObject({ code: "upstream_http", diagnostic: { source: "upstream_http", http_status: 502, elapsed_ms: expect.any(Number) } });
    expect(JSON.stringify(failure)).not.toContain("PRIVATE_PROVIDER_BODY");
  });

  it.each(["fetch", "body"])("identifies our deadline during %s without waiting 60 seconds", async phase => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    const clock = vi.spyOn(performance, "now").mockReturnValueOnce(100).mockReturnValue(60100);
    try {
      const reason = new DOMException("PRIVATE_TIMEOUT_DETAIL", "TimeoutError");
      const provider = createSocProvider(configuration, async () => {
        if (phase === "fetch") { controller.abort(reason); throw reason; }
        return new Response(new ReadableStream({ start(stream) { controller.abort(reason); stream.error(reason); } }));
      });
      const failure = await provider(input).catch(error => error);
      expect(failure).toMatchObject({ code: "local_timeout", diagnostic: { source: "local_deadline", elapsed_ms: 60000 } });
      expect(failure.diagnostic).not.toHaveProperty("http_status");
      expect(JSON.stringify(failure)).not.toContain("PRIVATE_TIMEOUT_DETAIL");
      expect(timeout).toHaveBeenCalledWith(60000);
    } finally { timeout.mockRestore(); clock.mockRestore(); }
  });
  it("does not call an unrelated AbortError our deadline", async () => {
    const failure = await createSocProvider(configuration, async () => { throw new DOMException("Unrelated abort", "AbortError"); })(input).catch(error => error);
    expect(failure).toMatchObject({ code: "network_error", diagnostic: { source: "network" } });
  });

});
