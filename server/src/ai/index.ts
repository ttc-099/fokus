// picks the ai provider from env config, with offline as the safety net

import { env } from "../env";
import { offlineProvider } from "./offline";
import { makeOpenAiCompatibleProvider } from "./openaiCompatible";
import type { AiProvider } from "./types";

// per-provider defaults when env vars are only partly filled in
const defaults: Record<string, { baseUrl: string; model: string }> = {
  openai: {
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
  },
  huggingface: {
    baseUrl: "https://router.huggingface.co/v1",
    model: "meta-llama/Llama-3.1-8B-Instruct",
  },
};

// build the configured provider
const buildProvider = (): AiProvider => {
  const { provider, apiKey, baseUrl, model } = env.ai;

  if (provider === "offline") return offlineProvider;

  if (provider === "openai" || provider === "huggingface") {
    if (!apiKey) {
      console.warn(
        `[ai] AI_PROVIDER=${provider} but AI_API_KEY is empty — falling back to offline`,
      );
      return offlineProvider;
    }
    return makeOpenAiCompatibleProvider(
      {
        baseUrl: baseUrl || defaults[provider].baseUrl,
        apiKey,
        model: model || defaults[provider].model,
      },
      model || defaults[provider].model,
    );
  }

  console.warn(`[ai] unknown AI_PROVIDER "${provider}" — using offline`);
  return offlineProvider;
};

export const ai = buildProvider();

// try the real provider first, fall back to offline if it fails
// returns the result plus which provider actually produced it
export const withFallback = async <T>(
  op: (p: AiProvider) => Promise<T>,
): Promise<{ result: T; provider: string }> => {
  try {
    return { result: await op(ai), provider: ai.name };
  } catch (err) {
    if (ai === offlineProvider) throw err;
    console.warn("[ai] provider failed, falling back to offline:", err);
    return { result: await op(offlineProvider), provider: "offline (fallback)" };
  }
};
