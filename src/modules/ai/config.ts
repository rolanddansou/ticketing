import { AiError, AiService, providerNameSchema, type AiProvider, type ProviderName } from "./ai.service.js";
import { DeepSeekProvider, GeminiProvider, OpenAiProvider } from "./chat-provider.js";

export function createAiService(env: NodeJS.ProcessEnv): AiService {
  const selected = providerNameSchema.safeParse(env.AI_DEFAULT_PROVIDER);
  if (!selected.success) throw new AiError("CONFIGURATION");
  const providers: Partial<Record<ProviderName, AiProvider>> = {};
  const openAiKey = env.OPENAI_API_KEY?.trim();
  const openAiModel = env.OPENAI_MODEL?.trim();
  const deepSeekKey = env.DEEPSEEK_API_KEY?.trim();
  const deepSeekModel = env.DEEPSEEK_MODEL?.trim();
  const geminiKey = env.GEMINI_API_KEY?.trim();
  const geminiModel = env.GEMINI_MODEL?.trim();
  if (openAiKey && openAiModel) providers.openai = new OpenAiProvider(openAiKey, openAiModel);
  if (deepSeekKey && deepSeekModel) providers.deepseek = new DeepSeekProvider(deepSeekKey, deepSeekModel);
  if (geminiKey && geminiModel) providers.gemini = new GeminiProvider(geminiKey, geminiModel);
  if (!providers[selected.data]) throw new AiError("CONFIGURATION");
  return new AiService(providers, selected.data);
}
