"use client";

import { ChevronDown, MessageSquare } from "lucide-react";
import Link from "next/link";
import { useEffect, useId, useMemo, useRef, useState } from "react";

import { ClampedChatMarkdown } from "@/components/ClampedChatMarkdown";
import { CompactTime, TimelineDayDivider } from "@/components/LocalTime";
import { ScrollToBottomOnMount } from "@/components/ScrollToBottomOnMount";
import { SummaryPostFrame } from "@/components/SummaryPostFrame";
import { dayKey } from "@/lib/projects/activity-feed";
import type { OrgDailySummary } from "@/lib/projects/chat-data";
import { useIsHydrated } from "@/lib/use-hydrated";

export type HomeSummaryProject = {
  id: string;
  name: string;
};

type ThreadBlock =
  | { kind: "day"; key: string; at: number }
  | { kind: "summary"; key: string; summary: OrgDailySummary };

function buildBlocks(summaries: OrgDailySummary[]): ThreadBlock[] {
  const blocks: ThreadBlock[] = [];
  let lastDay = "";

  for (const summary of summaries) {
    const at = new Date(summary.createdAt).getTime();
    const key = Number.isNaN(at) ? "" : dayKey(at);
    if (key && key !== lastDay) {
      lastDay = key;
      blocks.push({ kind: "day", key: `day-${key}`, at });
    }
    blocks.push({ kind: "summary", key: summary.id, summary });
  }

  return blocks;
}

function filterLabel(
  projects: HomeSummaryProject[],
  selected: Set<string>,
): string {
  if (selected.size === 0 || selected.size === projects.length) {
    return "All projects";
  }
  if (selected.size === 1) {
    const id = selected.values().next().value;
    return projects.find((project) => project.id === id)?.name ?? "1 project";
  }
  return `${selected.size} projects`;
}

function ProjectFilterPopover({
  projects,
  selected,
  onToggle,
}: {
  projects: HomeSummaryProject[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const menuId = useId();
  const label = filterLabel(projects, selected);

  useEffect(() => {
    if (!open) return;
    function onPointerDown(event: MouseEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  if (projects.length === 0) {
    return <p className="shrink-0 text-muted">All projects</p>;
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        type="button"
        className="inline-flex max-w-56 items-center gap-1 text-muted transition hover:text-foreground"
        aria-expanded={open}
        aria-haspopup="true"
        aria-controls={menuId}
        onClick={() => setOpen((value) => !value)}
      >
        <span className="truncate">{label}</span>
        <ChevronDown
          className={`size-3.5 shrink-0 transition ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open ? (
        <div
          id={menuId}
          role="group"
          aria-label="Filter by project"
          className="absolute top-full right-0 z-20 mt-2 min-w-56 overflow-hidden rounded-lg border border-border bg-surface py-1 shadow-lg"
        >
          <ul className="max-h-72 overflow-y-auto p-1">
            {projects.map((project) => {
              const checked = selected.has(project.id);
              const lastChecked = checked && selected.size === 1;
              return (
                <li key={project.id}>
                  <label className="flex cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 transition hover:bg-background">
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={lastChecked}
                      onChange={() => onToggle(project.id)}
                      className="h-4 w-4 shrink-0 accent-accent"
                    />
                    <span
                      className="min-w-0 truncate text-sm text-foreground"
                      title={project.name}
                    >
                      {project.name}
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

/** Cross-project thread of `/summary` posts and cron daily summaries. */
export function HomeSummariesThread({
  summaries,
  projects,
}: {
  summaries: OrgDailySummary[];
  projects: HomeSummaryProject[];
}) {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(projects.map((project) => project.id)),
  );

  function toggleProject(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        if (next.size <= 1) return prev;
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const hydrated = useIsHydrated();
  const showingAll = selected.size === 0 || selected.size === projects.length;
  const visible = useMemo(
    () =>
      showingAll
        ? summaries
        : summaries.filter((summary) => selected.has(summary.projectId)),
    [summaries, selected, showingAll],
  );
  const blocks = useMemo(
    () =>
      hydrated
        ? buildBlocks(visible)
        : visible.map((summary) => ({
            kind: "summary" as const,
            key: summary.id,
            summary,
          })),
    [visible, hydrated],
  );
  const last = visible[visible.length - 1];
  const scrollKey = last
    ? `${last.id}:${last.createdAt}:${[...selected].sort().join(",")}`
    : `empty:${[...selected].sort().join(",")}`;

  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-sidebar px-6 py-3 text-sm">
        <h1 className="truncate tracking-tight">Daily summaries</h1>
        <ProjectFilterPopover
          projects={projects}
          selected={selected}
          onToggle={toggleProject}
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-6">
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col">
          {summaries.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center px-4 pb-6 text-center">
              <span className="grid h-12 w-12 place-items-center rounded-full bg-skeleton text-muted">
                <MessageSquare
                  aria-hidden
                  className="h-5 w-5"
                  strokeWidth={1.5}
                />
              </span>
              <p className="mt-4 text-sm font-medium text-foreground">
                No summaries yet
              </p>
              <p className="mt-1 text-sm text-muted">
                Run /summary on a project, or wait for the daily routine — they
                show up here.
              </p>
            </div>
          ) : visible.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center px-4 pb-6 text-center">
              <p className="text-sm font-medium text-foreground">
                No summaries for the selected projects
              </p>
              <p className="mt-1 text-sm text-muted">
                Choose a different project in the filter, or run /summary on one
                of these.
              </p>
            </div>
          ) : (
            <ul className="flex flex-col gap-1.5 px-4 pb-4">
              {blocks.map((block) => {
                if (block.kind === "day") {
                  return <TimelineDayDivider key={block.key} at={block.at} />;
                }

                const { summary } = block;

                return (
                  <li
                    key={block.key}
                    className="group/msg my-2 flex flex-col items-start last:mb-0"
                  >
                    <SummaryPostFrame
                      header={
                        <>
                          <Link
                            href={`/projects/${summary.projectId}`}
                            className="min-w-0 truncate text-lg font-semibold text-foreground hover:underline"
                          >
                            {summary.projectName}
                          </Link>
                          <CompactTime
                            at={summary.createdAt}
                            className="shrink-0 text-xs text-muted"
                          />
                        </>
                      }
                      meta={summary.meta}
                    >
                      <ClampedChatMarkdown>{summary.text}</ClampedChatMarkdown>
                    </SummaryPostFrame>
                  </li>
                );
              })}
            </ul>
          )}
          <ScrollToBottomOnMount triggerKey={scrollKey} />
        </div>
      </div>
    </main>
  );
}

function Pulse({ className }: { className: string }) {
  return (
    <div className={`animate-pulse rounded-md bg-skeleton ${className}`} />
  );
}

function SummaryCardSkeleton({
  nameWidth,
  lines,
}: {
  nameWidth: string;
  lines: string[];
}) {
  return (
    <li className="group/msg my-2 flex flex-col items-start last:mb-0">
      <article className="w-full overflow-hidden rounded-lg border border-border bg-surface">
        <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
          <Pulse className={`h-6 ${nameWidth}`} />
          <Pulse className="h-3 w-14 shrink-0" />
        </header>
        <div className="space-y-2 px-3 py-2.5">
          {lines.map((width, index) => (
            <Pulse key={index} className={`h-3.5 ${width}`} />
          ))}
        </div>
      </article>
    </li>
  );
}

function DayDividerSkeleton() {
  return (
    <li className="my-3 flex items-center gap-3 first:mt-0">
      <span className="h-px flex-1 bg-border" aria-hidden />
      <Pulse className="h-3 w-16" />
      <span className="h-px flex-1 bg-border" aria-hidden />
    </li>
  );
}

/** Matches HomeSummariesThread so the page does not jump when summaries arrive. */
export function HomeSummariesThreadFallback() {
  return (
    <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <span role="status" className="sr-only">
        Loading daily summaries
      </span>
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-sidebar px-6 py-3 text-sm">
        <h1 className="truncate tracking-tight">Daily summaries</h1>
        <p className="inline-flex max-w-56 items-center gap-1 text-muted">
          All projects
          <ChevronDown className="size-3.5 shrink-0" aria-hidden />
        </p>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-6 pt-6" aria-hidden>
        <div className="mx-auto flex min-h-full w-full max-w-3xl flex-col">
          <ul className="flex flex-col gap-1.5 px-4 pb-4">
            <DayDividerSkeleton />
            <SummaryCardSkeleton
              nameWidth="w-40"
              lines={["w-full", "w-11/12", "w-4/5", "w-full", "w-2/3"]}
            />
            <SummaryCardSkeleton
              nameWidth="w-28"
              lines={["w-full", "w-5/6", "w-3/4", "w-1/2"]}
            />
            <DayDividerSkeleton />
            <SummaryCardSkeleton
              nameWidth="w-48"
              lines={["w-full", "w-full", "w-10/12", "w-4/5", "w-2/5"]}
            />
            <SummaryCardSkeleton
              nameWidth="w-36"
              lines={["w-full", "w-3/4", "w-5/6"]}
            />
          </ul>
        </div>
      </div>
    </main>
  );
}
