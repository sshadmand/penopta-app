/**
 * Map AI SDK / provider failures into short chat-safe copy.
 * Always returns something usable for the project chat timeline.
 */

/** Timeline CTA — ProjectTimeline turns this into a link to AI model settings. */
export const REVIEW_INTEGRATIONS_META = "Review integrations";

export function friendlyLlmErrorMessage(err: unknown): string {
  const blob = collectErrorBlob(err);

  if (isBillingOrQuotaError(blob)) {
    return "This AI key is out of credits or quota. Add billing with that provider, or switch to another key.";
  }

  if (
    blob.includes("invalid_api_key") ||
    blob.includes("incorrect api key") ||
    (blob.includes("authentication") && blob.includes("api key"))
  ) {
    return "That API key was rejected. Update or replace it.";
  }

  if (blob.includes("rate_limit") || blob.includes("too many requests")) {
    return "The AI provider rate-limited this request. Wait a moment and try again.";
  }

  const providerMessage = extractProviderUserMessage(collectErrorChunks(err));
  if (providerMessage) {
    return `Couldn't answer: ${providerMessage}`;
  }

  return "Couldn't answer. Check your AI key, then try again.";
}

/** True when the user should be pointed at AI key settings. */
export function shouldLinkReviewIntegrations(err: unknown): boolean {
  const blob = collectErrorBlob(err);
  return (
    isBillingOrQuotaError(blob) ||
    blob.includes("invalid_api_key") ||
    blob.includes("incorrect api key") ||
    (blob.includes("authentication") && blob.includes("api key"))
  );
}

function collectErrorChunks(err: unknown): string[] {
  const chunks: string[] = [];
  const walk = (value: unknown, depth = 0): void => {
    if (value == null || depth > 6) return;
    if (typeof value === "string") {
      chunks.push(value);
      return;
    }
    if (typeof value !== "object") return;
    const obj = value as Record<string, unknown>;
    if (typeof obj.message === "string") chunks.push(obj.message);
    if (typeof obj.responseBody === "string") chunks.push(obj.responseBody);
    if (typeof obj.code === "string") chunks.push(obj.code);
    if (typeof obj.type === "string") chunks.push(obj.type);
    if (Array.isArray(obj.errors)) {
      for (const nested of obj.errors) walk(nested, depth + 1);
    }
    if (obj.lastError) walk(obj.lastError, depth + 1);
    if (obj.cause) walk(obj.cause, depth + 1);
    if (obj.data) walk(obj.data, depth + 1);
    if (obj.error) walk(obj.error, depth + 1);
  };
  walk(err);
  return chunks;
}

function collectErrorBlob(err: unknown): string {
  return collectErrorChunks(err).join("\n").toLowerCase();
}

function isBillingOrQuotaError(blob: string): boolean {
  return (
    blob.includes("credit_balance_exhausted") ||
    blob.includes("insufficient_quota") ||
    blob.includes("no credits remaining") ||
    blob.includes("resource_exhausted") ||
    blob.includes("quota exceeded") ||
    blob.includes("exceeded your current quota") ||
    (blob.includes("billing") &&
      (blob.includes("quota") ||
        blob.includes("credit") ||
        blob.includes("payment") ||
        blob.includes("plan"))) ||
    (blob.includes("token") &&
      (blob.includes("quota") || blob.includes("limit exceeded")))
  );
}

/** Prefer the provider's short human message over SDK wrapper noise. */
function extractProviderUserMessage(chunks: string[]): string | null {
  for (const chunk of chunks) {
    try {
      const parsed = JSON.parse(chunk) as {
        error?: { message?: unknown };
        message?: unknown;
      };
      const fromError =
        typeof parsed.error?.message === "string" ? parsed.error.message : null;
      const fromTop =
        typeof parsed.message === "string" ? parsed.message : null;
      const msg = (fromError ?? fromTop)?.trim();
      if (msg && msg.length < 280 && !/^AI_/i.test(msg)) return msg;
    } catch {
      // not JSON
    }

    const trimmed = chunk.trim();
    if (
      trimmed &&
      trimmed.length < 280 &&
      !/^AI_/i.test(trimmed) &&
      !/^Failed after \d+ attempts/i.test(trimmed) &&
      !trimmed.includes("\n")
    ) {
      if (/Error$/.test(trimmed) && trimmed.length < 40) continue;
      return trimmed;
    }
  }
  return null;
}
