import type { LlmProvider } from "@/lib/db/schema";

/** Defaults when the org has not pinned a model. */
export const DEFAULT_LLM_MODELS: Record<LlmProvider, string> = {
  anthropic: "claude-sonnet-4-6",
  openai: "gpt-5.4",
  google: "gemini-3.5-flash",
};

/** Display labels for toasts / settings. */
export const LLM_PROVIDER_LABELS: Record<LlmProvider, string> = {
  anthropic: "Claude",
  openai: "OpenAI",
  google: "Gemini",
};

/**
 * Default pick order when multiple keys exist.
 * Anthropic first; Gemini before OpenAI so a dead OpenAI billing balance
 * doesn't block orgs that also saved a Gemini key.
 */
export const LLM_PROVIDER_PREFERENCE: LlmProvider[] = [
  "anthropic",
  "google",
  "openai",
];

/** Non-secret credential fields safe to pass into client components. */
export type LlmCredentialPublic = {
  provider: LlmProvider;
  keyLast4: string;
  model: string | null;
  updatedAt: Date;
};
