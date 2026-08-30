import type { AgentThreadRow, SourceActivityItem } from "@/lib/db/schema";
import { withoutLeadUp } from "@/lib/threads/lead-up";

/** Parse `/summary` window tokens like `24h`, `7d`, `90m`. Default 24h. */
export function parseSummaryWindow(raw: string | null | undefined): {
  ms: number;
  label: string;
} {
  const trimmed = (raw ?? "24h").trim().toLowerCase() || "24h";
  const match =
    /^(\d+)\s*(m|min|mins|minute|minutes|h|hr|hrs|hour|hours|d|day|days)$/.exec(
      trimmed,
    );
  if (!match) {
    throw new Error(
      `Invalid window "${raw}". Use something like 24h, 7d, or 90m.`,
    );
  }

  const amount = Number(match[1]);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Window must be a positive number.");
  }

  const unit = match[2];
  const maxMs = 14 * 86_400_000;

  let ms: number;
  let label: string;
  if (unit === "m" || unit.startsWith("min")) {
    ms = amount * 60_000;
    label = `${amount}m`;
  } else if (unit.startsWith("h")) {
    ms = amount * 3_600_000;
    label = `${amount}h`;
  } else {
    ms = amount * 86_400_000;
    label = `${amount}d`;
  }

  if (ms > maxMs) {
    throw new Error("Window is too large (max 14 days).");
  }

  return { ms, label };
}

/** Max characters of transcript text fed into the summarizer. */
const MAX_CONTEXT_CHARS = 60_000;
const MESSAGE_WORD_LIMIT = 500;
const MESSAGE_KEEP_EACH = 250;

/** Keep the first and last 250 words of long messages; leave shorter ones intact. */
export function truncateMessageForLlm(text: string): string {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= MESSAGE_WORD_LIMIT) return text;
  const head = words.slice(0, MESSAGE_KEEP_EACH).join(" ");
  const tail = words.slice(-MESSAGE_KEEP_EACH).join(" ");
  return `${head}\n[truncated for brevity]\n${tail}`;
}

export type ThreadWindowSlice = {
  title: string;
  agent: string;
  ownerUserId: string;
  messages: SourceActivityItem[];
  statusSummary: string | null;
};

/**
 * Collect per-thread activity whose message timestamps fall inside
 * `[since, now]`. Lead-up assistant turns are dropped so the summarizer
 * only sees human turns and each run's final reply. Falls back to
 * working-state summary when the thread was synced in-window but has no
 * timestamped turns.
 */
export function collectProjectWindowContext(
  threads: AgentThreadRow[],
  since: Date,
): { slices: ThreadWindowSlice[]; messageCount: number } {
  const slices: ThreadWindowSlice[] = [];
  let messageCount = 0;

  for (const thread of threads) {
    const messages = withoutLeadUp(thread.sourceActivity).filter((item) => {
      if (!item.timestamp) return false;
      const t = new Date(item.timestamp).getTime();
      return Number.isFinite(t) && t >= since.getTime();
    });

    const syncedInWindow = thread.lastSyncedAt.getTime() >= since.getTime();
    const statusSummary =
      messages.length === 0 && syncedInWindow
        ? thread.workingState?.statusSummary?.trim() || null
        : null;

    if (messages.length === 0 && !statusSummary) continue;

    messageCount += messages.length;
    slices.push({
      title: thread.title || "Untitled thread",
      agent: thread.lastAgentName || thread.kind || "agent",
      ownerUserId: thread.ownerUserId,
      messages,
      statusSummary,
    });
  }

  return { slices, messageCount };
}

/** Format collected slices into a prompt-sized transcript block. */
export function formatWindowContextForPrompt(
  projectName: string,
  windowLabel: string,
  slices: ThreadWindowSlice[],
): { text: string; truncated: boolean } {
  const header = `Workgroup "${projectName}" — activity in the last ${windowLabel}.\n\n`;
  const parts: string[] = [];
  let used = header.length;
  let truncated = false;

  for (const slice of slices) {
    const blockLines = [
      `### Thread: ${slice.title} (${slice.agent}; owner ${slice.ownerUserId})`,
      ...(slice.statusSummary
        ? [`Status summary: ${slice.statusSummary}`]
        : []),
      ...slice.messages.map((m) => {
        const when = m.timestamp ?? "unknown time";
        return `[${when}] ${m.role}: ${truncateMessageForLlm(m.text)}`;
      }),
      "",
    ];
    const block = blockLines.join("\n");
    if (used + block.length > MAX_CONTEXT_CHARS) {
      truncated = true;
      const remaining = Math.max(0, MAX_CONTEXT_CHARS - used - 80);
      if (remaining > 0) {
        parts.push(block.slice(0, remaining) + "\n…[truncated]");
      }
      break;
    }
    parts.push(block);
    used += block.length;
  }

  return { text: header + parts.join("\n"), truncated };
}
