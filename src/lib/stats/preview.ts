import type { SourceActivityItem } from "@/lib/db/schema";
import {
  type ActivityBucket,
  mergeActivityBuckets,
} from "@/lib/stats/activity";
import { fillMissingTimestamps, utcDayHour } from "@/lib/stats/timestamps";

type PreviewThread = {
  sourceActivity: SourceActivityItem[];
  threadUpdatedAt?: Date | string | null;
};

function asIso(value: Date | string | null | undefined): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

/** UTC hour buckets from current thread transcripts (one count per turn). */
export function activityBucketsFromThreads(
  threads: PreviewThread[],
): ActivityBucket[] {
  const buckets: ActivityBucket[] = [];
  for (const thread of threads) {
    const stamps = fillMissingTimestamps(
      thread.sourceActivity.map((item) => item.timestamp),
      asIso(thread.threadUpdatedAt),
    );
    for (const ts of stamps) {
      const bucket = utcDayHour(ts);
      if (!bucket) continue;
      buckets.push({ day: bucket.day, hour: bucket.hour, value: 1 });
    }
  }
  return mergeActivityBuckets(buckets);
}
