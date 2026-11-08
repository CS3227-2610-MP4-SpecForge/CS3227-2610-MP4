import { describe, expect, it, vi } from "vitest";
import { createSocProvider } from "../server/soc";
const configuration = { baseUrl: "https://soclaas-api.comp.nus.edu.sg/v1", model: "qwen3.5:9b", key: "fixture-key" };
const input = { fields: { title: "Search", description: "Find requests" }, message: "Help clarify", history: [] };
const envelope = (content: string, finish = "stop") => Response.json({ choices: [{ finish_reason: finish, message: { content } }] });
describe("SoC provider interface", () => {
  it("accepts human-only replies and complete task proposals through the bounded SoC request", async () => {
    let wire: Record<string, unknown> = {};
    const provider = createSocProvider(configuration, async (_url, init) => { wire = JSON.parse(String(init?.body)); return envelope(JSON.stringify({ reply: "Here is a draft.", proposal: { title: "Search requests", description: "## Desired behaviour\n\n- Search titles" } })); });
    expect(await provider(input)).toEqual({ reply: "Here is a draft.", proposal: { title: "Search requests", description: "## Desired behaviour\n\n- Search titles" } });
    expect(wire).toMatchObject({ max_tokens: 2000, reasoning_effort: "none", response_format: { type: "json_object" }, model: "qwen3.5:9b" });
    expect(await createSocProvider(configuration, async () => envelope('{"reply":"Who is the user?","proposal":null}'))(input)).toEqual({ reply: "Who is the user?", proposal: null });
  });
  it.each(["gemma4:unverified", "qwen3.6:35b", ""])("rejects unsupported model %s before contacting the provider", async model => {
    let calls = 0;
    const provider = createSocProvider({ ...configuration, model }, async () => { calls++; return envelope('{"reply":"Hi","proposal":null}'); });
    await expect(provider(input)).rejects.toMatchObject({ code: "configuration" });
    expect(calls).toBe(0);
  });
  it.each(["qwen3.5:9b", "gemma4:26b"])("uses the same bounded JSON request for enabled model %s", async model => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    try {
      let wire: Record<string, unknown> = {};
      const provider = createSocProvider({ ...configuration, model }, async (_url, init) => {
        wire = JSON.parse(String(init?.body));
        expect(init).toMatchObject({ redirect: "error", cache: "no-store" });
        expect(init?.signal).toBeInstanceOf(AbortSignal);
        return envelope('{"reply":"Which columns?","proposal":null}');
      });
      expect(await provider(input)).toEqual({ reply: "Which columns?", proposal: null });
      expect(wire).toMatchObject({ model, max_tokens: 2000, reasoning_effort: "none", response_format: { type: "json_object" } });
      expect(timeout).toHaveBeenCalledWith(90_000);
    } finally { timeout.mockRestore(); }
  });
  it("sends scope and uncertainty rules separately from untrusted ticket content", async () => {
    let messages: { role: string; content: string }[] = [];
    const fields = { title: "", description: "Synthetic request: remember a filter on reload." };
    await createSocProvider(configuration, async (_url, init) => {
      messages = JSON.parse(String(init?.body)).messages;
      return envelope('{"reply":"Draft ready.","proposal":{"title":"Remember filter","description":"Preserve on reload."}}');
    })({ fields, message: "Draft ticket", history: [] });
    expect(messages[0].role).toBe("system");
    expect(messages[0].content).toContain("Do not add storage technologies, retention periods, cross-session guarantees, roles, or extra workflows unless supplied");
    expect(messages[0].content).toContain("Keep material unknowns in an explicit Assumptions / unresolved questions section");
    expect(messages[0].content).toContain("Wording changes are edits. Return a complete proposal that preserves the existing scope.");
    expect(messages[0].content).toContain("Use ATX Markdown headings");
    expect(JSON.parse(messages.at(-1)!.content)).toEqual({ currentTask: fields, message: "Draft ticket" });
  });
  it("discards extra response and proposal fields before returning ticket changes", async () => {
    const provider = createSocProvider(configuration, async () => envelope(JSON.stringify({
      reply: "Review this draft.", publish: true, diagnostic: { private: "discard me" },
      proposal: { title: "Remember filter", description: "Keep the selected filter on reload.", status: "published", permission: "admin" },
    })));
    expect(await provider(input)).toEqual({ reply: "Review this draft.", proposal: { title: "Remember filter", description: "Keep the selected filter on reload." } });
  });
  it.each([undefined, null, "", " \n "])('uses a neutral reply for a complete proposal without usable reply text (%j)', async reply => {
    const proposal = { title: "Remember filter", description: "Keep the selected filter on reload." };
    const provider = createSocProvider(configuration, async () => envelope(JSON.stringify({ reply, proposal })));
    expect(await provider(input)).toEqual({ reply: "Review these suggested ticket changes.", proposal });
  });
  it("accepts clarification with an omitted proposal and discards unrelated keys", async () => {
    expect(await createSocProvider(configuration, async () => envelope('{"reply":" Which columns? ","publish":true}'))(input)).toEqual({ reply: "Which columns?", proposal: null });
  });
  it.each([
    null, [], {}, { reply: null }, { reply: "", proposal: null },
    ...[0, false, [], {}].map(reply => ({ reply, proposal: { title: "Valid title", description: "Valid description" } })),
    ...[{}, [], false, "text", { title: "Only title" }, { title: null, description: "Text" },
      { title: "Text", description: 2 }, { title: " ", description: "Text" },
      { title: "Text", description: "\n " }, { title: "😀".repeat(161), description: "Text" },
      { title: "Text", description: "x".repeat(24001) }].map(proposal => ({ reply: "A valid reply cannot rescue a malformed proposal.", proposal })),
  ])("rejects malformed known fields instead of repairing or downgrading them (case %#)", async value => {
    await expect(createSocProvider(configuration, async () => envelope(JSON.stringify(value)))(input)).rejects.toMatchObject({ code: "invalid_output", diagnostic: { source: "invalid_output", reason: "invalid_schema" } });
  });
  it("preserves title and description whitespace and Unicode limits when discarding extras", async () => {
    const proposal = { title: "😀".repeat(160), description: " \n" + "x".repeat(23997) + " " };
    expect(await createSocProvider(configuration, async () => envelope(JSON.stringify({ proposal: { ...proposal, extra: true } })))(input)).toEqual({ reply: "Review these suggested ticket changes.", proposal });
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
    [() => envelope('{"publish":true}'), "invalid_schema"],
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
  it.each(["qwen3.5:9b", "gemma4:26b"])("rejects oversized context without dropping history or contacting %s", async model => {
    let calls = 0;
    const provider = createSocProvider({ ...configuration, model }, async () => { calls++; return envelope('{}'); });
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

  it.each(["fetch", "body"])("identifies the 90-second deadline during %s", async phase => {
    const controller = new AbortController();
    const timeout = vi.spyOn(AbortSignal, "timeout").mockReturnValue(controller.signal);
    const clock = vi.spyOn(performance, "now").mockReturnValueOnce(100).mockReturnValue(90_100);
    try {
      const reason = new DOMException("PRIVATE_TIMEOUT_DETAIL", "TimeoutError");
      const provider = createSocProvider(configuration, async () => {
        if (phase === "fetch") { controller.abort(reason); throw reason; }
        return new Response(new ReadableStream({ start(stream) { controller.abort(reason); stream.error(reason); } }));
      });
      const failure = await provider(input).catch(error => error);
      expect(failure).toMatchObject({ code: "local_timeout", diagnostic: { source: "local_deadline", elapsed_ms: 90_000 } });
      expect(failure.diagnostic).not.toHaveProperty("http_status");
      expect(JSON.stringify(failure)).not.toContain("PRIVATE_TIMEOUT_DETAIL");
      expect(timeout).toHaveBeenCalledWith(90_000);
    } finally { timeout.mockRestore(); clock.mockRestore(); }
  });
  it("does not call an unrelated AbortError our deadline", async () => {
    const failure = await createSocProvider(configuration, async () => { throw new DOMException("Unrelated abort", "AbortError"); })(input).catch(error => error);
    expect(failure).toMatchObject({ code: "network_error", diagnostic: { source: "network" } });
  });

});
