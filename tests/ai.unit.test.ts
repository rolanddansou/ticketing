import assert from "node:assert/strict";
import { test } from "node:test";
import { z } from "zod";
import { AiService } from "../src/modules/ai/ai.service.js";
import { DeepSeekProvider, GeminiProvider, OpenAiProvider } from "../src/modules/ai/chat-provider.js";
import { createAiService } from "../src/modules/ai/config.js";

test("Gemini supports JSON mode and normalizes text and usage", async () => {
  const provider = new GeminiProvider("fake", "models/gemini-test", async (url, init) => {
    assert.equal(String(url), "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions");
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer fake");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, "gemini-test");
    assert.match(body.messages[0].content, /^System/);
    assert.equal(body.max_tokens, 4096);
    assert.deepEqual(body.response_format, { type: "json_object" });
    return Response.json({
      model: "gemini-test-version",
      choices: [{ finish_reason: "stop", message: { content: '{"ok":true}' } }],
      usage: { prompt_tokens: 12, completion_tokens: 5 },
    });
  });
  const ai = new AiService({ gemini: provider }, "gemini");
  assert.deepEqual(await ai.generateJson({ system: "System", user: "User" }, z.object({ ok: z.boolean() })), {
    data: { ok: true }, provider: "gemini", model: "gemini-test-version", usage: { inputTokens: 12, outputTokens: 5 },
  });
  assert.equal(createAiService({ AI_DEFAULT_PROVIDER: "gemini", GEMINI_API_KEY: "fake", GEMINI_MODEL: "gemini-test" }).defaultProvider, "gemini");
  assert.throws(() => createAiService({ AI_DEFAULT_PROVIDER: "gemini" }), { code: "CONFIGURATION" });
  let attempts = 0;
  const limited = new AiService({ gemini: new GeminiProvider("fake", "gemini-test", async () => {
    attempts++;
    return new Response(null, { status: 429 });
  }) }, "gemini");
  await assert.rejects(limited.generateText({ system: "System", user: "User" }), { code: "RATE_LIMITED" });
  assert.equal(attempts, 1);
});
import { TicketAgentIa } from "../src/modules/ticket-agent-ia/agent.js";

test("out-of-scope and uncertain tickets never publish a generated solution", async () => {
  const ticket = { title: "Demande RH", description: null };
  for (const scope of ["OUT_OF_SCOPE", "UNCERTAIN"]) {
    const ai = new AiService({ openai: { async generate() {
      return { text: JSON.stringify({ scope, draft: "Generated solution", procedureId: null, canResolve: true }), model: "fake" };
    } } }, "openai");
    const proposal = await new TicketAgentIa(ai, [], true, true).analyze(ticket);
    assert.equal("approved" in proposal, false);
    assert.notEqual(proposal.draft, "Generated solution");
  }
});

test("generated responses close tickets only with both flags and an empty catalog", async () => {
  let canResolve = true;
  const ai = new AiService({ openai: { async generate() {
    return { text: JSON.stringify({ scope: "IT", draft: "Solution complète", procedureId: null, canResolve }), model: "fake" };
  } } }, "openai");
  const ticket = { title: "Demande", description: null };
  assert.deepEqual((await new TicketAgentIa(ai, [], true, true).analyze(ticket)).approved,
    { text: "Solution complète", procedureId: null });
  assert.equal((await new TicketAgentIa(ai, [], true).analyze(ticket)).approved, undefined);
  assert.equal((await new TicketAgentIa(ai, [], false, true).analyze(ticket)).approved, undefined);
  const catalog = [{ id: "other", title: "Autre demande", resolutionText: "Autre solution" }];
  assert.equal((await new TicketAgentIa(ai, catalog, true, true).analyze(ticket)).approved, undefined);
  canResolve = false;
  assert.equal((await new TicketAgentIa(ai, [], true, true).analyze(ticket)).approved, undefined);
});

const input = { system: "Answer briefly", user: "Hello" };
test("AI validates requests and selects the explicit provider or default", async () => {
  const ai = new AiService({
    openai: { async generate() { return { text: "Hello", model: "fake-openai" }; } },
    deepseek: { async generate({ format }) {
      assert.equal(format, "json");
      return { text: '{"value":"OK"}', model: "fake-deepseek" };
    } },
  }, "openai");
  assert.equal((await ai.generateText(input)).provider, "openai");
  const result = await ai.generateJson(input, z.object({ value: z.string() }), { provider: "deepseek" });
  assert.equal(result.provider, "deepseek");
  assert.deepEqual(result.data, { value: "OK" });
  await assert.rejects(ai.generateJson(input, z.object({ value: z.number() }), { provider: "deepseek" }), { code: "INVALID_OUTPUT" });
  await assert.rejects(ai.generateJson(input, z.object({})), { code: "INVALID_OUTPUT" });
  await assert.rejects(ai.generateText({ ...input, user: " " }), { code: "INVALID_INPUT" });
  await assert.rejects(new AiService({}, "openai").generateText(input), { code: "CONFIGURATION" });
});

test("Chat providers translate HTTP errors and validate successful responses", async () => {
  const result = await new AiService({ deepseek: new DeepSeekProvider("fake", "configured", async (url, init) => {
    assert.equal(String(url), "https://api.deepseek.com/chat/completions");
    const body = JSON.parse(String(init?.body));
    assert.equal(body.model, "configured");
    assert.equal(body.max_tokens, 4096);
    assert.equal(body.max_completion_tokens, undefined);
    assert.equal(body.response_format.type, "json_object");
    assert.equal(body.messages[1].content, input.user);
    return Response.json({ model: "reported", choices: [{ finish_reason: "stop", message: { content: "{}" } }],
      usage: { prompt_tokens: 20, completion_tokens: 2 } });
  }) }, "deepseek").generateJson(input, z.strictObject({}));
  assert.deepEqual(result.usage, { inputTokens: 20, outputTokens: 2 });
  for (const [status, code] of [[401, "CONFIGURATION"], [408, "TIMEOUT"], [429, "RATE_LIMITED"], [503, "UNAVAILABLE"]] as const) {
    const provider = new OpenAiProvider("fake", "configured", async (_url, init) => {
      const body = JSON.parse(String(init?.body));
      assert.equal(body.max_completion_tokens, 4096);
      assert.equal(body.max_tokens, undefined);
      return new Response("private upstream error", { status });
    });
    await assert.rejects(new AiService({ openai: provider }, "openai").generateText(input), { code, message: code });
  }
});
