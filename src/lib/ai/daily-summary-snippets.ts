import { DAILY_SUMMARY_META_START } from "@/lib/projects/chat-meta";

const MAX_ROLLUP_CHARS = 24_000;

export type DailySummaryPost = {
  text: string;
  meta: string | null;
  createdAt: Date;
};

export type DailySummarySnippet = {
  dayKey: string;
  text: string;
};

/** UTC `YYYY-MM-DD`, preferring the day stamped on the cron meta. */
export function dayKeyFromDailySummary(
  meta: string | null,
  createdAt: Date,
): string {
  if (meta?.startsWith(DAILY_SUMMARY_META_START)) {
    const rest = meta.slice(DAILY_SUMMARY_META_START.length);
    const match = /^(\d{4}-\d{2}-\d{2})/.exec(rest);
    if (match) return match[1]!;
  }
  const y = createdAt.getUTCFullYear();
  const m = String(createdAt.getUTCMonth() + 1).padStart(2, "0");
  const d = String(createdAt.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function snippetsFromDailySummaryPosts(
  posts: DailySummaryPost[],
): DailySummarySnippet[] {
  return posts
    .map((post) => ({
      dayKey: dayKeyFromDailySummary(post.meta, post.createdAt),
      text: post.text.trim(),
    }))
    .filter((snippet) => snippet.text.length > 0);
}

/** Dated daily posts as one prompt block (truncated if huge). */
export function formatDailySummariesForPrompt(
  projectName: string,
  snippets: DailySummarySnippet[],
): { text: string; truncated: boolean } {
  const header = `Workgroup "${projectName}" — daily summaries to roll up.\n\n`;
  const parts: string[] = [];
  let used = header.length;
  let truncated = false;

  for (const snippet of snippets) {
    const block = `[${snippet.dayKey}]\n${snippet.text}\n\n`;
    if (used + block.length > MAX_ROLLUP_CHARS) {
      truncated = true;
      break;
    }
    parts.push(block);
    used += block.length;
  }

  return { text: header + parts.join(""), truncated };
}
