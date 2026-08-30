import { createAnthropic } from "@ai-sdk/anthropic";
import { createGoogle } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import { APICallError, generateText, type LanguageModel } from "ai";

import {
  DEFAULT_LLM_MODELS,
  LLM_PROVIDER_LABELS,
} from "@/lib/ai/models";
import type { LlmProvider } from "@/lib/db/schema";

export type ValidateLlmKeyResult =
  | { ok: true; modelId: string }
  | { ok: false; error: string };

function buildModel(
  provider: LlmProvider,
  apiKey: string,
  modelId: string,
): LanguageModel {
  if (provider === "anthropic") {
    return createAnthropic({ apiKey })(modelId);
  }
  if (provider === "google") {
    return createGoogle({ apiKey })(modelId);
  }
  return createOpenAI({ apiKey })(modelId);
}

function friendlyValidateError(
  provider: LlmProvider,
  err: unknown,
): string {
  const label = LLM_PROVIDER_LABELS[provider];
  const message =
    err instanceof Error ? err.message.toLowerCase() : String(err).toLowerCase();
  const status =
    APICallError.isInstance(err) && typeof err.statusCode === "number"
      ? err.statusCode
      : null;
  const responseBody =
    APICallError.isInstance(err) && typeof err.responseBody === "string"
      ? err.responseBody.toLowerCase()
      : "";

  if (
    status === 401 ||
    status === 403 ||
    message.includes("invalid api key") ||
    message.includes("incorrect api key") ||
    message.includes("authentication") ||
    message.includes("unauthorized") ||
    responseBody.includes("invalid_api_key") ||
    responseBody.includes("invalid x-api-key")
  ) {
    return `That ${label} API key was rejected. Check the key and try again.`;
  }

  if (
    status === 402 ||
    message.includes("insufficient") ||
    message.includes("quota") ||
    message.includes("billing") ||
    message.includes("credit") ||
    message.includes("balance") ||
    responseBody.includes("insufficient_quota") ||
    responseBody.includes("credit balance") ||
    responseBody.includes("billing")
  ) {
    return `That ${label} key works for auth, but the account looks out of credits or billing. Add credits, then try again.`;
  }

  if (status === 429) {
    return `${label} rate-limited the check. Wait a moment and try again.`;
  }

  if (status === 404 || message.includes("not found") || message.includes("model")) {
    return `Couldn't reach the default ${label} model with that key. Check the key (and model access) and try again.`;
  }

  return `Couldn't verify the ${label} key. ${
    err instanceof Error && err.message
      ? err.message.slice(0, 180)
      : "Try again."
  }`;
}

/**
 * Cheap live ping: one tiny completion against the provider default model.
 * Confirms the key authenticates and can spend (credits / billing).
 */
export async function validateLlmApiKey(opts: {
  provider: LlmProvider;
  apiKey: string;
  model?: string | null;
}): Promise<ValidateLlmKeyResult> {
  const apiKey = opts.apiKey.trim();
  if (!apiKey) return { ok: false, error: "Paste an API key first." };

  const modelId = opts.model?.trim() || DEFAULT_LLM_MODELS[opts.provider];
  const model = buildModel(opts.provider, apiKey, modelId);

  try {
    await generateText({
      model,
      maxRetries: 0,
      maxOutputTokens: 8,
      prompt: 'Reply with the single word "ok".',
    });
    return { ok: true, modelId };
  } catch (err) {
    console.error("validateLlmApiKey", opts.provider, err);
    return { ok: false, error: friendlyValidateError(opts.provider, err) };
  }
}
