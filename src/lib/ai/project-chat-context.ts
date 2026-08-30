import type {
  AgentThreadRow,
  ProjectRow,
  SourceActivityItem,
} from "@/lib/db/schema";
import type { ProjectChatMessagePublic } from "@/lib/projects/chat-data";
import { withoutLeadUp } from "@/lib/threads/lead-up";

/** Soft caps so free-form chat stays cheap vs dumping full transcripts. */
const MAX_BRIEF_CHARS = 12_000;
const MAX_DETAIL_CHARS = 20_000;
const MAX_CHAT_TURNS = 16;
const MAX_RETRIEVED_THREADS = 3;
const MAX_ACTIVITY_PER_THREAD = 12;

/** Common words we skip when turning a question into search terms. */
const STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "is",
  "are",
  "was",
  "were",
  "be",
  "been",
  "being",
  "am",
  "i",
  "me",
  "my",
  "we",
  "our",
  "you",
  "your",
  "it",
  "its",
  "this",
  "that",
  "these",
  "those",
  "to",
  "of",
  "in",
  "on",
  "for",
  "with",
  "about",
  "and",
  "or",
  "but",
  "if",
  "so",
  "do",
  "does",
  "did",
  "can",
  "could",
  "would",
  "should",
  "what",
  "whats",
  "who",
  "whom",
  "which",
  "when",
  "where",
  "why",
  "how",
  "any",
  "all",
  "some",
  "there",
  "here",
  "please",
  "tell",
  "give",
  "show",
  "explain",
  "summarize",
  "summary",
]);

export type ProjectChatContextBundle = {
  /** Prompt block fed to the model. */
  text: string;
  /** How many threads got detail beyond the brief. */
  retrievedThreadCount: number;
  /** True when either brief or detail hit a char cap. */
  truncated: boolean;
};

/** Split a question into searchable terms (lowercase, stopwords dropped). */
export function extractSearchTerms(question: string): string[] {
  return question
    .toLowerCase()
    .replace(/[^a-z0-9_\-\s]/g, " ")
    .split(/\s+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOPWORDS.has(t));
}

function threadHaystack(row: AgentThreadRow): string {
  const ws = row.workingState;
  return [
    row.title,
    row.projectContext ?? "",
    ws?.objective ?? "",
    ws?.statusSummary ?? "",
    ws?.nextAction ?? "",
    ...(ws?.decisions ?? []),
    ...(ws?.completedWork ?? []),
    ...(ws?.openQuestions ?? []),
    ...withoutLeadUp(row.sourceActivity).map((a) => a.text),
  ]
    .join("\n")
    .toLowerCase();
}

function scoreThread(row: AgentThreadRow, terms: string[]): number {
  if (terms.length === 0) return 0;
  const hay = threadHaystack(row);
  return terms.reduce((acc, term) => (hay.includes(term) ? acc + 1 : acc), 0);
}

function formatWorkingStateLines(row: AgentThreadRow): string[] {
  const ws = row.workingState;
  if (!ws) return ["(no working state yet)"];
  const lines: string[] = [];
  if (ws.objective?.trim()) lines.push(`Objective: ${ws.objective.trim()}`);
  if (ws.statusSummary?.trim())
    lines.push(`Status: ${ws.statusSummary.trim()}`);
  if (ws.nextAction?.trim()) lines.push(`Next: ${ws.nextAction.trim()}`);
  if (ws.decisions?.length) lines.push(`Decisions: ${ws.decisions.join("; ")}`);
  if (ws.completedWork?.length)
    lines.push(`Done: ${ws.completedWork.join("; ")}`);
  if (ws.openQuestions?.length)
    lines.push(`Open: ${ws.openQuestions.join("; ")}`);
  if (ws.artifacts?.length) lines.push(`Artifacts: ${ws.artifacts.join("; ")}`);
  return lines.length > 0 ? lines : ["(empty working state)"];
}

function formatBriefThread(row: AgentThreadRow): string {
  const title = row.title || "Untitled thread";
  const agent = row.lastAgentName || row.kind || "agent";
  return [
    `### ${title} (${agent}, ${row.status})`,
    ...formatWorkingStateLines(row),
    "",
  ].join("\n");
}

function pickActivity(
  items: SourceActivityItem[],
  terms: string[],
): SourceActivityItem[] {
  if (items.length === 0) return [];
  if (terms.length === 0) {
    return items.slice(-MAX_ACTIVITY_PER_THREAD);
  }

  const scored = items
    .map((item, index) => {
      const lower = item.text.toLowerCase();
      const hits = terms.reduce(
        (acc, term) => (lower.includes(term) ? acc + 1 : acc),
        0,
      );
      return { item, index, hits };
    })
    .filter((s) => s.hits > 0)
    .sort((a, b) => {
      if (b.hits !== a.hits) return b.hits - a.hits;
      return b.index - a.index;
    });

  if (scored.length === 0) {
    return items.slice(-MAX_ACTIVITY_PER_THREAD);
  }

  return scored
    .slice(0, MAX_ACTIVITY_PER_THREAD)
    .sort((a, b) => a.index - b.index)
    .map((s) => s.item);
}

function formatDetailThread(row: AgentThreadRow, terms: string[]): string {
  const title = row.title || "Untitled thread";
  const agent = row.lastAgentName || row.kind || "agent";
  const activity = pickActivity(withoutLeadUp(row.sourceActivity), terms);
  const lines = [
    `### Thread detail: ${title} (${agent})`,
    ...formatWorkingStateLines(row),
  ];
  if (row.projectContext?.trim()) {
    lines.push(`Project context: ${row.projectContext.trim()}`);
  }
  if (activity.length > 0) {
    lines.push("Recent / matching turns:");
    for (const m of activity) {
      const when = m.timestamp ?? "unknown time";
      const text = m.text.length > 800 ? `${m.text.slice(0, 797)}…` : m.text;
      lines.push(`[${when}] ${m.role}: ${text}`);
    }
  }
  lines.push("");
  return lines.join("\n");
}

function formatRecentChat(
  messages: ProjectChatMessagePublic[],
  excludeId?: string,
): string {
  const prior = messages
    .filter((m) => m.id !== excludeId && !m.isError)
    .slice(-MAX_CHAT_TURNS);
  if (prior.length === 0) return "(no prior project chat)";
  return prior
    .map((m) => `${m.role === "user" ? "User" : "Assistant"}: ${m.text}`)
    .join("\n");
}

function pushUntilCap(
  parts: string[],
  used: { n: number },
  block: string,
  max: number,
): boolean {
  if (used.n + block.length > max) {
    const remaining = Math.max(0, max - used.n - 80);
    if (remaining > 0) {
      parts.push(block.slice(0, remaining) + "\n…[truncated]");
      used.n = max;
    }
    return true;
  }
  parts.push(block);
  used.n += block.length;
  return false;
}

/**
 * Build a layered prompt context for free-form project chat:
 * 1) Always: project + condensed workingState per thread + recent chat
 * 2) When present: latest continue-work brief (human objectives + next prompt)
 * 3) When the question matches threads: a few capped activity excerpts
 *    (lead-up assistant turns omitted)
 */
export function buildProjectChatContext(opts: {
  project: Pick<ProjectRow, "name" | "summary">;
  threads: AgentThreadRow[];
  recentChat: ProjectChatMessagePublic[];
  question: string;
  /** Skip the just-persisted user turn so it isn't duplicated in history. */
  excludeChatMessageId?: string;
  /** Latest continue-work brief, if one has been posted. */
  continueWork?: string | null;
}): ProjectChatContextBundle {
  const terms = extractSearchTerms(opts.question);
  const header = [
    `Workgroup "${opts.project.name}".`,
    opts.project.summary?.trim()
      ? `Project summary: ${opts.project.summary.trim()}`
      : null,
    `${opts.threads.length} linked thread${opts.threads.length === 1 ? "" : "s"}.`,
    "",
  ]
    .filter((line) => line != null)
    .join("\n");

  const briefParts: string[] = [header];
  const usedBrief = { n: header.length };
  let truncated = false;

  const continueText = opts.continueWork?.trim();
  if (continueText) {
    const continueBlock = [
      "## Continue work (human objectives + next prompt)",
      continueText,
      "",
    ].join("\n");
    if (pushUntilCap(briefParts, usedBrief, continueBlock, MAX_BRIEF_CHARS)) {
      truncated = true;
    }
  }

  const threadHeader = "## Thread briefs (working state only)\n\n";
  if (pushUntilCap(briefParts, usedBrief, threadHeader, MAX_BRIEF_CHARS)) {
    truncated = true;
  }

  for (const thread of opts.threads) {
    if (
      pushUntilCap(
        briefParts,
        usedBrief,
        formatBriefThread(thread),
        MAX_BRIEF_CHARS,
      )
    ) {
      truncated = true;
      break;
    }
  }

  const chatBlock = [
    "## Recent project chat",
    formatRecentChat(opts.recentChat, opts.excludeChatMessageId),
    "",
  ].join("\n");
  briefParts.push(chatBlock);

  const scored = opts.threads
    .map((row) => ({ row, score: scoreThread(row, terms) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.row.lastSyncedAt.getTime() - a.row.lastSyncedAt.getTime();
    })
    .slice(0, MAX_RETRIEVED_THREADS);

  let retrievedThreadCount = 0;
  const detailParts: string[] = [];
  if (scored.length > 0) {
    detailParts.push(
      "## Retrieved thread detail (matched to the question)",
      "",
    );
    const usedDetail = { n: detailParts.join("\n").length };
    for (const { row } of scored) {
      if (
        pushUntilCap(
          detailParts,
          usedDetail,
          formatDetailThread(row, terms),
          MAX_DETAIL_CHARS,
        )
      ) {
        truncated = true;
        retrievedThreadCount += 1;
        break;
      }
      retrievedThreadCount += 1;
    }
  }

  return {
    text: [...briefParts, ...detailParts].join("\n"),
    retrievedThreadCount,
    truncated,
  };
}
