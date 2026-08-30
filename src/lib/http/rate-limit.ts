import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { db } from "@/lib/db/client";
import { rateLimitBuckets } from "@/lib/db/schema";
import { clientIpFromHeaders } from "@/lib/http/client-ip";
import {
  nextRateLimitState,
  RATE_LIMITS,
  rateLimitKey,
  type RateLimitBucket,
} from "@/lib/http/rate-limit-state";

export function tooManyRequestsResponse(
  retryAfterSec: number,
  extraHeaders?: Record<string, string>,
): NextResponse {
  return NextResponse.json(
    { error: "Too many requests. Try again shortly." },
    {
      status: 429,
      headers: {
        "Retry-After": String(retryAfterSec),
        ...extraHeaders,
      },
    },
  );
}

/**
 * Increment the bucket for this client IP. Returns a 429 response when over
 * the limit, otherwise null so the caller can continue.
 */
export async function rejectIfRateLimited(
  request: Request,
  bucket: RateLimitBucket,
  extraHeaders?: Record<string, string>,
): Promise<NextResponse | null> {
  const { limit, windowMs } = RATE_LIMITS[bucket];
  const ip = clientIpFromHeaders(request.headers);
  const key = rateLimitKey(bucket, ip);
  const now = new Date();

  const [existing] = await db
    .select({
      windowStartedAt: rateLimitBuckets.windowStartedAt,
      hitCount: rateLimitBuckets.hitCount,
    })
    .from(rateLimitBuckets)
    .where(eq(rateLimitBuckets.key, key))
    .limit(1);

  const next = nextRateLimitState({
    existing: existing ?? null,
    now,
    windowMs,
    limit,
  });

  await db
    .insert(rateLimitBuckets)
    .values({
      key,
      windowStartedAt: next.windowStartedAt,
      hitCount: next.hitCount,
    })
    .onConflictDoUpdate({
      target: rateLimitBuckets.key,
      set: {
        windowStartedAt: next.windowStartedAt,
        hitCount: next.hitCount,
      },
    });

  if (next.allowed) return null;
  return tooManyRequestsResponse(next.retryAfterSec, extraHeaders);
}
