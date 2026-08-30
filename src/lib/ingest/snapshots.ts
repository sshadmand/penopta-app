import type { SourceActivityItem } from "@/lib/db/schema";

/** True when two transcripts are the same JSON payload (skip redundant snapshots). */
export function sourceActivityEqual(
  left: SourceActivityItem[] | null | undefined,
  right: SourceActivityItem[] | null | undefined,
): boolean {
  return JSON.stringify(left ?? []) === JSON.stringify(right ?? []);
}

/** First sync always snapshots; later syncs skip when the transcript is unchanged. */
export function shouldWriteThreadSnapshot(
  previous: SourceActivityItem[] | undefined,
  next: SourceActivityItem[],
): boolean {
  if (previous === undefined) return true;
  return !sourceActivityEqual(previous, next);
}
