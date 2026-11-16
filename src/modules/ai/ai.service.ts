import { z } from "zod";

export const providerNameSchema = z.enum(["openai", "deepseek", "gemini"]);
export type ProviderName = z.infer<typeof providerNameSchema>;
const inputSchema = z.strictObject({
  system: z.string().trim().min(1).max(16_000),
  user: z.string().trim().min(1).max(20_000),
});
const optionsSchema = z.strictObject({ provider: providerNameSchema.optional() });
export type AiInput = z.input<typeof inputSchema>;
export type AiOptions = z.input<typeof optionsSchema>;
export type AiErrorCode = "CONFIGURATION" | "INVALID_INPUT" | "TIMEOUT" | "RATE_LIMITED" | "UNAVAILABLE" | "INVALID_OUTPUT";

export class AiError extends Error {
  constructor(readonly code: AiErrorCode) {
    super(code);
    this.name = "AiError";
  }
}

export interface AiUsage { inputTokens: number; outputTokens: number }
export interface AiProvider {
  generate(input: AiInput & { format: "text" | "json"; signal: AbortSignal }): Promise<{
    text: string; model: string; usage?: AiUsage;
  }>;
}
export interface AiResult<T> { data: T; provider: ProviderName; model: string; usage?: AiUsage }

export class AiService {
  constructor(private readonly providers: Partial<Record<ProviderName, AiProvider>>, readonly defaultProvider: ProviderName) {}

  private async generate(input: AiInput, format: "text" | "json", options: AiOptions = {}): Promise<AiResult<string>> {
    const parsed = inputSchema.safeParse(input);
    if (!parsed.success) throw new AiError("INVALID_INPUT");
    const selection = optionsSchema.safeParse(options);
    if (!selection.success) throw new AiError("CONFIGURATION");
    const provider = selection.data.provider ?? this.defaultProvider;
    const adapter = this.providers[provider];
    if (!adapter) throw new AiError("CONFIGURATION");

    const signal = AbortSignal.timeout(30_000);
    try {
      const result = await adapter.generate({ ...parsed.data, format, signal });
      if (!result.text.trim() || result.text.length > 32_000) throw new AiError("INVALID_OUTPUT");
      return { data: result.text, provider, model: result.model, usage: result.usage };
    } catch (error) {
      if (signal.aborted) throw new AiError("TIMEOUT");
      if (error instanceof AiError) throw error;
      throw new AiError("UNAVAILABLE");
    }
  }

  generateText(input: AiInput, options?: AiOptions): Promise<AiResult<string>> {
    return this.generate(input, "text", options);
  }

  async generateJson<T>(input: AiInput, outputSchema: z.ZodType<T>, options?: AiOptions): Promise<AiResult<T>> {
    const result = await this.generate(input, "json", options);
    let data: unknown;
    try { data = JSON.parse(result.data); } catch { throw new AiError("INVALID_OUTPUT"); }
    const parsed = await outputSchema.safeParseAsync(data);
    if (!parsed.success) throw new AiError("INVALID_OUTPUT");
    return { ...result, data: parsed.data };
  }
}
