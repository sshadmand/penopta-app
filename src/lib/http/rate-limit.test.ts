import assert from "node:assert/strict";
import test from "node:test";

import { nextRateLimitState, rateLimitKey } from "./rate-limit-state";

const WINDOW_MS = 60_000;
const NOW = new Date("2026-08-29T12:00:00.000Z");

test("rateLimitKey joins bucket and ip", () => {
  assert.equal(rateLimitKey("mcp", "203.0.113.9"), "mcp:203.0.113.9");
});

test("first hit in a window is allowed", () => {
  const next = nextRateLimitState({
    existing: null,
    now: NOW,
    windowMs: WINDOW_MS,
    limit: 3,
  });
  assert.equal(next.allowed, true);
  assert.equal(next.hitCount, 1);
  assert.equal(next.windowStartedAt.toISOString(), NOW.toISOString());
});

test("hits up to the limit stay allowed, then the next is blocked", () => {
  const atLimit = nextRateLimitState({
    existing: { windowStartedAt: NOW, hitCount: 2 },
    now: new Date(NOW.getTime() + 1_000),
    windowMs: WINDOW_MS,
    limit: 3,
  });
  assert.equal(atLimit.allowed, true);
  assert.equal(atLimit.hitCount, 3);

  const over = nextRateLimitState({
    existing: { windowStartedAt: NOW, hitCount: 3 },
    now: new Date(NOW.getTime() + 2_000),
    windowMs: WINDOW_MS,
    limit: 3,
  });
  assert.equal(over.allowed, false);
  assert.equal(over.hitCount, 4);
  assert.equal(over.retryAfterSec, 58);
});

test("a new window starts after the previous one expires", () => {
  const next = nextRateLimitState({
    existing: { windowStartedAt: NOW, hitCount: 99 },
    now: new Date(NOW.getTime() + WINDOW_MS),
    windowMs: WINDOW_MS,
    limit: 3,
  });
  assert.equal(next.allowed, true);
  assert.equal(next.hitCount, 1);
  assert.equal(
    next.windowStartedAt.toISOString(),
    new Date(NOW.getTime() + WINDOW_MS).toISOString(),
  );
});
