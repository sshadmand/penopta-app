/** Parse an ISO (or Date-parseable) timestamp to epoch ms. */
export function parseTimestampMs(
  raw: string | null | undefined,
): number | null {
  if (!raw?.trim()) return null;
  const ms = Date.parse(raw.trim());
  return Number.isNaN(ms) ? null : ms;
}

export function toIsoTimestamp(ms: number): string {
  return new Date(ms).toISOString();
}

/** UTC calendar day + hour for heatmap buckets. */
export function utcDayHour(
  iso: string,
): { day: string; hour: number } | null {
  const ms = parseTimestampMs(iso);
  if (ms == null) return null;
  const date = new Date(ms);
  return {
    day: date.toISOString().slice(0, 10),
    hour: date.getUTCHours(),
  };
}

/**
 * Fill blank timestamps in transcript order.
 * Missing turns inherit the previous stamp + 1s (so they do not collapse
 * in `thread + timestamp + role` dedupe). Leading blanks walk back 1s
 * from the next known stamp. A thread-level fallback covers a file with
 * no stamps at all.
 */
export function fillMissingTimestamps(
  timestamps: Array<string | null | undefined>,
  fallback: string | null | undefined,
): string[] {
  const count = timestamps.length;
  const filled: Array<number | null> = timestamps.map(parseTimestampMs);

  let last: number | null = null;
  let seq = 0;
  for (let i = 0; i < count; i++) {
    const current = filled[i];
    if (current != null) {
      last = current;
      seq = 0;
    } else if (last != null) {
      seq += 1;
      filled[i] = last + seq * 1000;
    }
  }

  let next: number | null = null;
  for (let i = count - 1; i >= 0; i--) {
    const current = filled[i];
    if (current != null) {
      next = current;
    } else if (next != null) {
      next -= 1000;
      filled[i] = next;
    }
  }

  const fallbackMs = parseTimestampMs(fallback);
  if (fallbackMs != null) {
    let fallbackSeq = 0;
    for (let i = 0; i < count; i++) {
      if (filled[i] == null) {
        filled[i] = fallbackMs + fallbackSeq * 1000;
        fallbackSeq += 1;
      }
    }
  }

  return filled.map((ms, i) => {
    if (ms != null) return toIsoTimestamp(ms);
    return timestamps[i]?.trim() || "";
  });
}
