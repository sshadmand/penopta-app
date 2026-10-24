import type {
  AgentThreadRow,
  ProjectSkillRow,
  SourceActivityItem,
} from "@/lib/db/schema";
import { isAgentRole, isHumanRole, withoutLeadUp } from "@/lib/threads/lead-up";

/** Soft cap so one distill run stays affordable on the org's key. */
const MAX_CONTEXT_CHARS = 48_000;
const MAX_THREADS = 40;
const MAX_HUMAN_TURNS_PER_THREAD = 12;
const MAX_TURN_CHARS = 700;
const MAX_LIST_ITEMS = 8;

/**
 * Human turns that push back on the agent. These are the strongest signal for
 * a rule or skill ("no, use the raw body", "that's wrong because…").
 */
const CORRECTION_PATTERN =
  /^(?:no\b|nope\b|wrong\b|actually\b|stop\b|wait\b)|\b(?:don't|do not|never|always|instead|that's wrong|not what|should(?:n't)? have|you (?:missed|forgot)|make sure|remember to|from now on)\b/i;

export function isCorrectionTurn(text: string): boolean {
  return CORRECTION_PATTERN.test(text.trim());
}

function clip(text: string, max = MAX_TURN_CHARS): string {
  const t = text.trim().replace(/\s+\n/g, "\n");
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}

/** Threads synced after the watermark, oldest first so a capped run resumes cleanly. */
export function threadsSinceWatermark(
  threads: AgentThreadRow[],
  watermark: Date | null,
): AgentThreadRow[] {
  return threads
    .filter((t) => !watermark || t.lastSyncedAt > watermark)
    .sort((a, b) => a.lastSyncedAt.getTime() - b.lastSyncedAt.getTime());
}

function formatThread(ref: string, thread: AgentThreadRow): string {
  const title = thread.title || "Untitled thread";
  const agent = thread.lastAgentName || thread.kind || "agent";
  const ws = thread.workingState;
  const lines = [`### ${ref}: ${title} (${agent}, ${thread.status})`];

  if (ws?.objective?.trim()) lines.push(`Objective: ${clip(ws.objective)}`);
  if (ws?.decisions?.length) {
    lines.push(
      `Decisions: ${ws.decisions
        .slice(0, MAX_LIST_ITEMS)
        .map((d) => clip(d, 240))
        .join("; ")}`,
    );
  }
  if (ws?.completedWork?.length) {
    lines.push(
      `Completed: ${ws.completedWork
        .slice(0, MAX_LIST_ITEMS)
        .map((d) => clip(d, 240))
        .join("; ")}`,
    );
  }

  const activity = withoutLeadUp(thread.sourceActivity);
  const picked: { item: SourceActivityItem; correction: boolean }[] = [];
  for (let i = 0; i < activity.length; i++) {
    const item = activity[i];
    if (!isHumanRole(item.role)) continue;
    const correction = isCorrectionTurn(item.text);
    // Keep the agent reply a correction pushed back on, for context.
    if (correction && i > 0 && isAgentRole(activity[i - 1].role)) {
      picked.push({ item: activity[i - 1], correction: false });
    }
    picked.push({ item, correction });
  }
  const turns = picked.slice(-MAX_HUMAN_TURNS_PER_THREAD * 2);
  if (turns.length > 0) {
    lines.push("Turns (lead-up omitted):");
    for (const { item, correction } of turns) {
      const tag = correction ? " [correction]" : "";
      lines.push(
        `[${item.timestamp ?? "unknown time"}] ${item.role}${tag}: ${clip(item.text)}`,
      );
    }
  }

  const last = [...activity].reverse().find((item) => isAgentRole(item.role));
  if (last) {
    lines.push(
      `Final agent reply: [${last.timestamp ?? "unknown time"}] ${clip(last.text)}`,
    );
  }

  lines.push("");
  return lines.join("\n");
}

export function formatExistingSkills(skills: ProjectSkillRow[]): string {
  if (skills.length === 0) return "(none yet)";
  return skills
    .map((s) => {
      const flags = [
        s.status === "off" ? "turned off — do not recreate" : null,
        s.humanEdited ? "edited by a person — do not update" : null,
      ].filter(Boolean);
      const note = flags.length ? ` (${flags.join("; ")})` : "";
      return s.kind === "rule"
        ? `- rule ${s.slug}${note}: ${clip(s.body, 240)}`
        : `- skill ${s.slug}${note}: ${s.title} — ${clip(s.description, 240)}`;
    })
    .join("\n");
}

export type DistillContextBundle = {
  text: string;
  /** Prompt ref (`T1`…) → agent_thread row. */
  threadRefs: Map<string, AgentThreadRow>;
  threadCount: number;
  truncated: boolean;
  /** Latest `lastSyncedAt` included — the next watermark. */
  includedThrough: Date | null;
};

/**
 * Build distill input from new threads. Weighted toward human corrections,
 * working-state decisions, and each run's final reply — not full transcripts.
 */
export function buildDistillContext(opts: {
  projectName: string;
  threads: AgentThreadRow[];
}): DistillContextBundle {
  const header = `Workgroup "${opts.projectName}". Threads are labeled T1, T2…\n\n`;
  const parts = [header];
  let used = header.length;
  const threadRefs = new Map<string, AgentThreadRow>();
  let includedThrough: Date | null = null;
  let truncated = opts.threads.length > MAX_THREADS;

  for (const thread of opts.threads.slice(0, MAX_THREADS)) {
    const ref = `T${threadRefs.size + 1}`;
    const block = formatThread(ref, thread);
    if (used + block.length > MAX_CONTEXT_CHARS) {
      truncated = true;
      break;
    }
    parts.push(block);
    used += block.length;
    threadRefs.set(ref, thread);
    includedThrough = thread.lastSyncedAt;
  }

  return {
    text: parts.join("\n"),
    threadRefs,
    threadCount: threadRefs.size,
    truncated,
    includedThrough,
  };
}
