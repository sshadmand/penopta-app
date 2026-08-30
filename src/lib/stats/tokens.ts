import { Tiktoken } from "js-tiktoken/lite";
import o200kBase from "js-tiktoken/ranks/o200k_base";

/**
 * GPT-4o / GPT-5 vocabulary. We don't know the producer model, but this
 * modern BPE is a tighter estimate than character-count ÷ 4 — especially
 * for code, indentation, and punctuation.
 */
let encoder: Tiktoken | undefined;

function modernEncoder(): Tiktoken {
  encoder ??= new Tiktoken(o200kBase);
  return encoder;
}

/** Token count for captured transcript text. Empty input is 0. */
export function estimateTokens(text: string | null | undefined): number {
  if (!text) return 0;
  return modernEncoder().encode(text).length;
}
