"use client";

import { useEffect, useLayoutEffect, useState } from "react";

import { ChatMarkdown } from "@/components/ChatMarkdown";
import { LocaleTime } from "@/components/LocalTime";
import { ScrollToBottomOnMount } from "@/components/ScrollToBottomOnMount";
import type { SourceActivityItem } from "@/lib/db/schema";
import { isHumanRole, leadUpFlags } from "@/lib/threads/lead-up";

/** Show a duration footer when a collapsed agent run spans longer than this. */
const WORKED_FOOTER_MIN_MS = 5 * 60 * 1000;
/** Clamp human bubbles taller than this many lines. */
const HUMAN_CLAMP_LINES = 10;

function toMillis(ts: string | null): number | null {
  if (!ts) return null;
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return null;
  return d.getTime();
}

function roleLabel(role: string): string {
  const r = role.trim().toLowerCase();
  if (r === "user" || r === "human") return "You";
  if (r === "assistant" || r === "ai" || r === "agent") return "Agent";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function isMine(role: string): boolean {
  return isHumanRole(role);
}

function activityScrollKey(activity: SourceActivityItem[]): string {
  const last = activity[activity.length - 1];
  return `${activity.length}:${last?.timestamp ?? ""}:${last?.text.length ?? 0}`;
}

function activityItemDomId(index: number): string {
  return `activity-${index}`;
}

/** Human duration for an agent run footer (`Worked for 6 minutes`). */
function formatWorkedDuration(ms: number): string {
  const totalMinutes = Math.max(1, Math.round(ms / 60_000));
  if (totalMinutes < 60) {
    return `Worked for ${totalMinutes} minute${totalMinutes === 1 ? "" : "s"}`;
  }
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const hourPart = `${hours} hour${hours === 1 ? "" : "s"}`;
  if (minutes === 0) return `Worked for ${hourPart}`;
  return `Worked for ${hourPart} ${minutes} minute${minutes === 1 ? "" : "s"}`;
}

/** Per-step duration: seconds up to 60, then minutes. */
function formatStepWorked(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds <= 60) {
    return `Worked for ${seconds} second${seconds === 1 ? "" : "s"}`;
  }
  return formatWorkedDuration(ms);
}

type ActivityGroup = {
  items: SourceActivityItem[];
  /** Index of the first activity item in the flat list (stable keys). */
  startIndex: number;
  workedLabel: string | null;
  /** True when this agent run has play-by-play before the final reply. */
  hasLeadUp: boolean;
};

/**
 * One visual run per human turn, or per consecutive agent run (lead-up +
 * final reply). Time gaps do not split an agent run — only a human turn does.
 */
function groupActivity(activity: SourceActivityItem[]): ActivityGroup[] {
  const flags = leadUpFlags(activity);
  const groups: ActivityGroup[] = [];

  for (let i = 0; i < activity.length; i++) {
    const item = activity[i];
    const prevGroup = groups[groups.length - 1];
    const prev = prevGroup?.items[prevGroup.items.length - 1];

    const continueAgentRun =
      prev != null && !isMine(prev.role) && !isMine(item.role);

    if (continueAgentRun && prevGroup) {
      prevGroup.items.push(item);
      continue;
    }

    groups.push({
      items: [item],
      startIndex: i,
      workedLabel: null,
      hasLeadUp: false,
    });
  }

  for (const group of groups) {
    if (isMine(group.items[0].role)) continue;
    group.hasLeadUp = group.items.some(
      (_, j) => flags[group.startIndex + j] === true,
    );
    const times = group.items
      .map((item) => toMillis(item.timestamp))
      .filter((t): t is number => t != null);
    if (times.length < 2) continue;
    const span = Math.max(...times) - Math.min(...times);
    if (span > WORKED_FOOTER_MIN_MS) {
      group.workedLabel = formatWorkedDuration(span);
    }
  }

  return groups;
}

function lineCount(text: string): number {
  if (!text) return 0;
  return text.split("\n").length;
}

/** Human bubble — clamps past 10 lines with Show more / Show less. */
function HumanMessageBubble({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const needsClamp = lineCount(text) > HUMAN_CLAMP_LINES;

  return (
    <div className="w-[min(100%,20rem)] max-w-[80%] rounded-2xl bg-skeleton px-4 py-2.5 text-sm leading-relaxed text-foreground sm:w-[80%]">
      <div
        className={`wrap-anywhere whitespace-pre-wrap ${
          needsClamp && !expanded ? "line-clamp-10" : ""
        }`}
      >
        {text}
      </div>
      {needsClamp ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-1.5 text-xs font-medium text-muted transition hover:text-foreground"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      ) : null}
    </div>
  );
}

function AgentRun({
  group,
  focusActivityIndex,
}: {
  group: ActivityGroup;
  focusActivityIndex?: number;
}) {
  const lastIndex = group.startIndex + group.items.length - 1;
  const focusInHiddenLeadUp =
    focusActivityIndex != null &&
    group.hasLeadUp &&
    focusActivityIndex >= group.startIndex &&
    focusActivityIndex < lastIndex;
  const [showAll, setShowAll] = useState(focusInHiddenLeadUp);
  const first = group.items[0];
  const hasLeadUp = group.hasLeadUp;
  const visibleItems =
    hasLeadUp && !showAll ? group.items.slice(-1) : group.items;
  const visibleOffset = group.items.length - visibleItems.length;
  const anyParaphrased = group.items.some((item) => !item.isExact);

  return (
    <div className="flex flex-col items-start">
      <div className="mb-1 flex items-center gap-2 px-1 text-xs text-muted">
        <span className="font-medium">{roleLabel(first.role)}</span>
        {first.timestamp ? <LocaleTime at={first.timestamp} /> : null}
        <span aria-hidden>-</span>
        {group.workedLabel ? <span>{group.workedLabel}</span> : null}
        {first.timestamp || hasLeadUp ? (
          <span className="flex items-center gap-1">
            {hasLeadUp ? (
              <>
                <button
                  type="button"
                  aria-expanded={showAll}
                  onClick={() => setShowAll((v) => !v)}
                  className="font-medium text-muted transition hover:text-foreground"
                >
                  {showAll ? "show less" : "show all"}
                </button>
              </>
            ) : null}
          </span>
        ) : null}
        {anyParaphrased ? (
          <span
            title="Reconstructed from summary, not an exact transcript"
            className="rounded bg-skeleton px-1 py-0.5 text-3xs uppercase tracking-wide"
          >
            paraphrased
          </span>
        ) : null}
      </div>
      <div className="flex w-full flex-col items-start gap-2">
        {visibleItems.map((item, i) => {
          const startMs = toMillis(item.timestamp);
          const endMs = toMillis(visibleItems[i + 1]?.timestamp ?? null);
          const workedMs =
            startMs != null && endMs != null ? endMs - startMs : null;

          const activityIndex = group.startIndex + visibleOffset + i;
          const focused = focusActivityIndex === activityIndex;

          return (
            <div
              id={activityItemDomId(activityIndex)}
              key={activityIndex}
              className={`scroll-mt-8 w-full rounded-2xl px-1 text-sm leading-relaxed text-foreground ${
                focused ? "bg-yellow-100" : ""
              }`}
            >
              {workedMs != null ? (
                <span className="text-2xs text-muted">
                  {formatStepWorked(workedMs)}
                </span>
              ) : null}

              <ChatMarkdown>{item.text}</ChatMarkdown>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** Renders a thread's captured source activity as a chat conversation. */
export function ThreadConversation({
  activity,
  focusActivityIndex,
}: {
  activity: SourceActivityItem[];
  /** Scroll this activity item into view instead of jumping to the bottom. */
  focusActivityIndex?: number;
}) {
  const [dismissedIndex, setDismissedIndex] = useState<number>();
  const highlightIndex =
    focusActivityIndex != null && dismissedIndex === focusActivityIndex
      ? undefined
      : focusActivityIndex;

  useLayoutEffect(() => {
    if (focusActivityIndex == null) return;
    const el = document.getElementById(activityItemDomId(focusActivityIndex));
    el?.scrollIntoView({ block: "center" });
  }, [focusActivityIndex, activity.length]);

  useEffect(() => {
    if (highlightIndex == null) return;
    const focusedId = activityItemDomId(highlightIndex);

    function onPointerDown(event: PointerEvent) {
      const el = document.getElementById(focusedId);
      if (el?.contains(event.target as Node)) return;
      setDismissedIndex(highlightIndex);
    }

    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [highlightIndex]);

  if (activity.length === 0) {
    return (
      <p className="text-sm text-muted">
        No conversation was captured for this thread.
      </p>
    );
  }

  const groups = groupActivity(activity);

  return (
    <div className="flex flex-col gap-4">
      {groups.map((group) =>
        isMine(group.items[0].role) ? (
          <div key={group.startIndex} className="flex flex-col items-end">
            <div className="mb-1 flex items-center gap-2 px-1 text-xs text-muted">
              <span className="font-medium">
                {roleLabel(group.items[0].role)}
              </span>
              {group.items[0].timestamp ? (
                <LocaleTime at={group.items[0].timestamp} />
              ) : null}
            </div>
            <div className="flex w-full flex-col items-end gap-2">
              {group.items.map((item, i) => {
                const activityIndex = group.startIndex + i;
                const focused = highlightIndex === activityIndex;
                return (
                  <div
                    id={activityItemDomId(activityIndex)}
                    key={activityIndex}
                    className={`scroll-mt-8 ${focused ? "rounded-md bg-yellow-100" : ""}`}
                  >
                    <HumanMessageBubble text={item.text} />
                  </div>
                );
              })}
            </div>
          </div>
        ) : (
          <AgentRun
            key={group.startIndex}
            group={group}
            focusActivityIndex={highlightIndex}
          />
        ),
      )}
      {focusActivityIndex == null ? (
        <ScrollToBottomOnMount triggerKey={activityScrollKey(activity)} />
      ) : (
        <div aria-hidden className="h-[30vh] w-full shrink-0" />
      )}
    </div>
  );
}
