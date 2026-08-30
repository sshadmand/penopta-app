import { createHash } from "node:crypto";

import type { ActivitySlice } from "@/lib/stats/activity";
import type { AttributedTurn } from "@/lib/stats/effort";
import { attributeThreadPlans } from "@/lib/stats/plan-spans";
import { fillMissingTimestamps, utcDayHour } from "@/lib/stats/timestamps";
import { estimateTokens } from "@/lib/stats/tokens";
import { isHumanRole } from "@/lib/threads/lead-up";

/** Enough of a turn to match `*_PLAN.md` mentions; tokens use the full text. */
export const PLAN_TEXT_LIMIT = 1200;

/** Current thread row sorts ahead of snapshots when dedupe keys tie. */
export const SOURCE_RANK_CURRENT = 0;
export const SOURCE_RANK_SNAPSHOT = 1;

export type RollupActivityItem = {
  timestamp?: string | null;
  role?: string | null;
  text?: string | null;
};

export type RollupSource = {
  threadId: string;
  ownerUserId: string;
  agentName: string;
  agentModel: string;
  projectContext: string | null;
  threadUpdatedAt: string | Date | null;
  sourceActivity: RollupActivityItem[];
  sourceRank: number;
};

type ExplodedTurn = {
  threadId: string;
  ownerUserId: string;
  agentName: string;
  agentModel: string;
  projectContext: string | null;
  threadUpdatedAt: string | Date | null;
  ordinality: number;
  ts: string | null;
  role: string;
  text: string;
  sourceRank: number;
};

export type ActivityTurn = {
  day: string;
  hour: number;
  ownerUserId: string;
  agentName: string;
  agentModel: string;
  projectContext: string | null;
  threadId: string;
  ts: string;
  role: string;
  text: string;
  tokens: number;
};

export type ThreadSourceMeta = {
  activityHash: string;
  projectContext: string;
  agentName: string;
  agentModel: string;
  snapshotCount: number;
  snapshotMaxAt: string;
};

/** Compact watermark so we recompute only when source data actually changed. */
export function threadSourceFingerprint(meta: ThreadSourceMeta): string {
  return JSON.stringify([
    meta.activityHash,
    meta.projectContext,
    meta.agentName,
    meta.agentModel,
    meta.snapshotCount,
    meta.snapshotMaxAt,
  ]);
}

/** Contribution graph window: ~53 weeks, matching the heatmap. */
export function statsSinceDay(now = new Date()): string {
  const since = new Date(now);
  since.setUTCDate(since.getUTCDate() - 53 * 7 - 2);
  return since.toISOString().slice(0, 10);
}

export function asIso(value: unknown): string | null {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value.toISOString();
  }
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function md5Hex(text: string): string {
  return createHash("md5").update(text).digest("hex");
}

function tsKey(ts: string | null): string {
  return (ts ?? "").slice(0, 19);
}

function explodeSource(source: RollupSource): ExplodedTurn[] {
  const rows: ExplodedTurn[] = [];
  source.sourceActivity.forEach((item, index) => {
    const text = item.text ?? "";
    if (text === "") return;
    const rawTs = item.timestamp?.trim() || "";
    rows.push({
      threadId: source.threadId,
      ownerUserId: source.ownerUserId,
      agentName: source.agentName,
      agentModel: source.agentModel,
      projectContext: source.projectContext,
      threadUpdatedAt: source.threadUpdatedAt,
      ordinality: index + 1,
      ts: rawTs || null,
      role: (item.role ?? "").toLowerCase(),
      text,
      sourceRank: source.sourceRank,
    });
  });
  return rows;
}

/**
 * Same grain as the previous SQL `DISTINCT ON (thread, role, md5(text), ts19)`.
 * Current-thread rows win ties so a later project/agent rename sticks.
 */
export function dedupeExplodedTurns(rows: ExplodedTurn[]): ExplodedTurn[] {
  const sorted = [...rows].sort((a, b) => {
    if (a.threadId !== b.threadId) return a.threadId.localeCompare(b.threadId);
    if (a.role !== b.role) return a.role.localeCompare(b.role);
    const aHash = md5Hex(a.text);
    const bHash = md5Hex(b.text);
    if (aHash !== bHash) return aHash.localeCompare(bHash);
    const aTs = tsKey(a.ts);
    const bTs = tsKey(b.ts);
    if (aTs !== bTs) return aTs.localeCompare(bTs);
    const aHasTs = a.ts ? 0 : 1;
    const bHasTs = b.ts ? 0 : 1;
    if (aHasTs !== bHasTs) return aHasTs - bHasTs;
    if (a.ordinality !== b.ordinality) return a.ordinality - b.ordinality;
    return a.sourceRank - b.sourceRank;
  });

  const seen = new Set<string>();
  const out: ExplodedTurn[] = [];
  for (const row of sorted) {
    const key = `${row.threadId}\0${row.role}\0${md5Hex(row.text)}\0${tsKey(row.ts)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }

  out.sort((a, b) => {
    if (a.threadId !== b.threadId) return a.threadId.localeCompare(b.threadId);
    if (a.ordinality !== b.ordinality) return a.ordinality - b.ordinality;
    return (a.ts ?? "").localeCompare(b.ts ?? "");
  });
  return out;
}

function finalizeActivityTurns(rows: ExplodedTurn[]): ActivityTurn[] {
  const byThread = new Map<string, ExplodedTurn[]>();
  for (const row of rows) {
    const list = byThread.get(row.threadId);
    if (list) list.push(row);
    else byThread.set(row.threadId, [row]);
  }

  const turns: ActivityTurn[] = [];
  for (const threadRows of byThread.values()) {
    const fallback = asIso(threadRows[0]?.threadUpdatedAt);
    const stamps = fillMissingTimestamps(
      threadRows.map((row) => row.ts),
      fallback,
    );
    threadRows.forEach((row, index) => {
      const ts = stamps[index] ?? "";
      const bucket = utcDayHour(ts);
      if (!bucket) return;
      const text = row.text ?? "";
      turns.push({
        day: bucket.day,
        hour: bucket.hour,
        ownerUserId: String(row.ownerUserId),
        agentName: (row.agentName ?? "").trim() || "unknown",
        agentModel: (row.agentModel ?? "").trim() || "unknown",
        projectContext: row.projectContext?.trim() || null,
        threadId: String(row.threadId ?? ""),
        ts,
        role: String(row.role ?? ""),
        text: text.slice(0, PLAN_TEXT_LIMIT),
        tokens: estimateTokens(text),
      });
    });
  }
  return turns;
}

/** Deduped, timestamp-filled turns for one thread's current row + snapshots. */
export function activityTurnsFromSources(
  sources: RollupSource[],
): ActivityTurn[] {
  const exploded = sources.flatMap(explodeSource);
  return finalizeActivityTurns(dedupeExplodedTurns(exploded));
}

export function toActivitySlices(turns: ActivityTurn[]): ActivitySlice[] {
  const map = new Map<string, ActivitySlice>();
  for (const turn of turns) {
    const key = [
      turn.day,
      turn.hour,
      turn.ownerUserId,
      turn.agentName,
      turn.agentModel,
      turn.projectContext ?? "",
      turn.threadId,
    ].join("\0");
    let slice = map.get(key);
    if (!slice) {
      slice = {
        day: turn.day,
        hour: turn.hour,
        ownerUserId: turn.ownerUserId,
        agentName: turn.agentName,
        agentModel: turn.agentModel,
        projectContext: turn.projectContext,
        threadId: turn.threadId,
        turns: 0,
        prompts: 0,
        tokens: 0,
      };
      map.set(key, slice);
    }
    slice.turns += 1;
    if (isHumanRole(turn.role)) slice.prompts += 1;
    slice.tokens += turn.tokens;
  }
  return [...map.values()];
}

/**
 * Plan attribution over the full thread, then hour-bucketed. Effort lenses
 * only sum these fields, so collapsing same-hour turns is lossless.
 */
export function toPlanSlices(turns: ActivityTurn[]): AttributedTurn[] {
  const byThread = new Map<string, ActivityTurn[]>();
  for (const turn of turns) {
    const list = byThread.get(turn.threadId);
    if (list) list.push(turn);
    else byThread.set(turn.threadId, [turn]);
  }

  const map = new Map<string, AttributedTurn>();
  for (const threadRows of byThread.values()) {
    const plans = attributeThreadPlans(
      threadRows.map((row) => ({
        role: row.role,
        text: row.text,
        timestamp: row.ts,
      })),
    );
    threadRows.forEach((row, index) => {
      const plan = plans[index] ?? null;
      if (!plan) return;
      const attributed: AttributedTurn = {
        day: row.day,
        hour: row.hour,
        ownerUserId: row.ownerUserId,
        agentName: row.agentName,
        projectContext: row.projectContext,
        threadId: row.threadId,
        tokens: row.tokens,
        prompts: isHumanRole(row.role) ? 1 : 0,
        turns: 1,
        planKey: plan.key,
        planFileName: plan.fileName,
        attribution: plan.source,
      };
      const key = [
        attributed.day,
        String(attributed.hour),
        attributed.ownerUserId,
        attributed.agentName,
        attributed.projectContext ?? "",
        attributed.threadId,
        attributed.planKey ?? "",
        attributed.planFileName ?? "",
        attributed.attribution ?? "",
      ].join("\0");
      const existing = map.get(key);
      if (!existing) {
        map.set(key, attributed);
        return;
      }
      existing.tokens += attributed.tokens;
      existing.prompts += attributed.prompts;
      existing.turns += attributed.turns;
    });
  }
  return [...map.values()];
}

export function filterSinceDay<T extends { day: string }>(
  rows: T[],
  sinceDay: string,
): T[] {
  return rows.filter((row) => row.day >= sinceDay);
}

export function rollupFromSources(sources: RollupSource[]): {
  slices: ActivitySlice[];
  planSlices: AttributedTurn[];
} {
  const turns = activityTurnsFromSources(sources);
  return {
    slices: toActivitySlices(turns),
    planSlices: toPlanSlices(turns),
  };
}
