import assert from "node:assert/strict";
import test from "node:test";

import { activityBucketsFromThreads } from "./preview";

test("activityBucketsFromThreads counts stamped turns per UTC hour", () => {
  const buckets = activityBucketsFromThreads([
    {
      threadUpdatedAt: "2026-08-14T02:00:00.000Z",
      sourceActivity: [
        {
          timestamp: "2026-08-14T02:04:00.000Z",
          role: "user",
          text: "hi",
          isExact: true,
        },
        {
          timestamp: "2026-08-14T02:14:00.000Z",
          role: "assistant",
          text: "hello",
          isExact: true,
        },
        {
          timestamp: "2026-08-13T23:00:00.000Z",
          role: "user",
          text: "earlier",
          isExact: true,
        },
      ],
    },
  ]);
  const byKey = new Map(
    buckets.map((bucket) => [`${bucket.day}T${bucket.hour}`, bucket.value]),
  );
  assert.equal(byKey.get("2026-08-14T2"), 2);
  assert.equal(byKey.get("2026-08-13T23"), 1);
});
