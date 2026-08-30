import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogle } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

import {
  getDecryptedOrgLlmCredential,
  listOrgLlmCredentials,
} from "@/lib/ai/credentials";
import {
  DEFAULT_LLM_MODELS,
  LLM_PROVIDER_PREFERENCE,
} from "@/lib/ai/models";
import type { LlmProvider } from "@/lib/db/schema";

export { DEFAULT_LLM_MODELS } from "@/lib/ai/models";

export class NoLlmCredentialError extends Error {
  constructor() {
    super("No AI provider key is configured for this organization.");
    this.name = "NoLlmCredentialError";
  }
}

export type ResolvedOrgLlm = {
  provider: LlmProvider;
  modelId: string;
  model: LanguageModel;
};

/**
 * Pick a usable model for the org. Prefer Anthropic, then Gemini, then OpenAI,
 * unless `prefer` is set. Calls the provider directly with the org's BYOK
 * (no AI Gateway) so spend stays on the user's key.
 */
export async function resolveLlmForOrg(
  orgId: string,
  opts?: { prefer?: LlmProvider },
): Promise<ResolvedOrgLlm> {
  const configured = await listOrgLlmCredentials(orgId);
  if (configured.length === 0) throw new NoLlmCredentialError();

  const order: LlmProvider[] = opts?.prefer
    ? [
        opts.prefer,
        ...LLM_PROVIDER_PREFERENCE.filter((p) => p !== opts.prefer),
      ]
    : [...LLM_PROVIDER_PREFERENCE];

  for (const provider of order) {
    if (!configured.some((c) => c.provider === provider)) continue;
    const cred = await getDecryptedOrgLlmCredential(orgId, provider);
    if (!cred) continue;

    const modelId = cred.model?.trim() || DEFAULT_LLM_MODELS[provider];
    if (provider === "anthropic") {
      const anthropic = createAnthropic({ apiKey: cred.apiKey });
      return { provider, modelId, model: anthropic(modelId) };
    }
    if (provider === "google") {
      const google = createGoogle({ apiKey: cred.apiKey });
      return { provider, modelId, model: google(modelId) };
    }
    const openai = createOpenAI({ apiKey: cred.apiKey });
    return { provider, modelId, model: openai(modelId) };
  }

  throw new NoLlmCredentialError();
}
