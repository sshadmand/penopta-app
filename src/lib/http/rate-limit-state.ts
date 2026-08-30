/** Named buckets applied to public / high-volume API routes. */
export const RATE_LIMITS = {
  hostSyncDevice: { limit: 60, windowMs: 60 * 60 * 1000 },
  hostSyncDeviceToken: { limit: 120, windowMs: 60 * 1000 },
  oauthRegister: { limit: 30, windowMs: 60 * 60 * 1000 },
  oauthToken: { limit: 60, windowMs: 60 * 1000 },
  macosExchange: { limit: 30, windowMs: 60 * 1000 },
  agentSync: { limit: 60, windowMs: 60 * 1000 },
  mcp: { limit: 120, windowMs: 60 * 1000 },
} as const;

export type RateLimitBucket = keyof typeof RATE_LIMITS;

export type RateLimitState = {
  windowStartedAt: Date;
  hitCount: number;
  allowed: boolean;
  retryAfterSec: number;
};

export function rateLimitKey(bucket: string, ip: string): string {
  return `${bucket}:${ip}`;
}

/** Pure fixed-window increment. Used by the DB helper and tests. */
export function nextRateLimitState(opts: {
  existing: { windowStartedAt: Date; hitCount: number } | null;
  now: Date;
  windowMs: number;
  limit: number;
}): RateLimitState {
  const { existing, now, windowMs, limit } = opts;
  const windowExpired =
    !existing ||
    existing.windowStartedAt.getTime() + windowMs <= now.getTime();
  const windowStartedAt = windowExpired ? now : existing.windowStartedAt;
  const hitCount = windowExpired ? 1 : existing.hitCount + 1;
  const retryAfterSec = Math.max(
    1,
    Math.ceil((windowStartedAt.getTime() + windowMs - now.getTime()) / 1000),
  );
  return {
    windowStartedAt,
    hitCount,
    allowed: hitCount <= limit,
    retryAfterSec,
  };
}
