import { z } from "zod";
import OpenAI from "openai";
import { AiError, type AiProvider } from "./ai.service.js";

const completion = z.object({
  model: z.string().min(1),
  choices: z.array(z.object({
    finish_reason: z.literal("stop"),
    message: z.object({ content: z.string() }),
  })).min(1),
  usage: z.object({ prompt_tokens: z.number().int().nonnegative(), completion_tokens: z.number().int().nonnegative() }).optional(),
});

const OUTPUT_TOKEN_LIMIT = 4096;

class ChatProvider implements AiProvider {
  private readonly client: OpenAI;

  constructor(baseURL: string, apiKey: string, private readonly model: string,
    private readonly tokenParameter: "max_completion_tokens" | "max_tokens", request: typeof fetch) {
    this.client = new OpenAI({ baseURL, apiKey, maxRetries: 0, timeout: 30_000, fetch: request, fetchOptions: { redirect: "error" } });
  }

  async generate(input: Parameters<AiProvider["generate"]>[0]) {
    const system = input.format === "json" ? input.system + "\nReturn a JSON object only." : input.system;
    let data: unknown;
    try {
      data = await this.client.chat.completions.create({
        model: this.model,
        [this.tokenParameter]: OUTPUT_TOKEN_LIMIT,
        messages: [{ role: "system", content: system }, { role: "user", content: input.user }],
        ...(input.format === "json" ? { response_format: { type: "json_object" } } : {}),
      }, { signal: input.signal });
    } catch (error) {
      if (error instanceof OpenAI.APIConnectionTimeoutError) throw new AiError("TIMEOUT");
      if (error instanceof OpenAI.APIError && error.status !== undefined) {
        if (error.status === 429) throw new AiError("RATE_LIMITED");
        if (error.status === 408 || error.status === 504) throw new AiError("TIMEOUT");
        if (error.status >= 500) throw new AiError("UNAVAILABLE");
        throw new AiError("CONFIGURATION");
      }
      if (error instanceof SyntaxError) throw new AiError("INVALID_OUTPUT");
      throw error;
    }
    const result = completion.safeParse(data);
    if (!result.success) throw new AiError("INVALID_OUTPUT");
    const { model, choices, usage } = result.data;
    return { model, text: choices[0].message.content, usage: usage && { inputTokens: usage.prompt_tokens, outputTokens: usage.completion_tokens } };
  }
}

export class OpenAiProvider extends ChatProvider {
  constructor(key: string, model: string, request = fetch) {
    super("https://api.openai.com/v1", key, model, "max_completion_tokens", request);
  }
}

export class DeepSeekProvider extends ChatProvider {
  constructor(key: string, model: string, request = fetch) {
    super("https://api.deepseek.com", key, model, "max_tokens", request);
  }
}

export class GeminiProvider extends ChatProvider {
  constructor(key: string, model: string, request = fetch) {
    super("https://generativelanguage.googleapis.com/v1beta/openai/", key, model.replace(/^models\//, ""), "max_tokens", request);
  }
}
