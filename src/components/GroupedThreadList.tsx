"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

import {
  AgentBrandIcon,
  formatAgentDisplayName,
} from "@/components/AgentBrandIcon";
import { PendingActiveLabel } from "@/components/PendingNavLink";
import {
  groupThreadsByProjectAndAgent,
  projectRecentMessageAt,
  type GroupableThread,
} from "@/lib/threads/group";

type SourceCatalogEntry = { name: string; projectId: string };

/** Where sidebar thread links should go (serializable — no function props). */
export type ThreadListLinkTarget =
  { kind: "thread" } | { kind: "project"; projectId: string };

const INITIAL_VISIBLE = 4;
const STALE_PROJECT_MS = 5 * 24 * 60 * 60 * 1000;

function agentGroupKey(
  projectLabel: string,
  ownerUserId: string,
  agent: string,
): string {
  return `${projectLabel}:${ownerUserId}:${agent}`;
}

function firstName(name: string): string {
  const base = name.trim() || "?";
  return base.split(/\s+/).at(0) || "?";
}

function ownerLabel(
  ownerUserId: string,
  ownerNames: Record<string, string>,
  currentUserId?: string,
): string {
  if (currentUserId && ownerUserId === currentUserId) return "You";
  return firstName(ownerNames[ownerUserId] ?? ownerUserId);
}

function hrefForThread(target: ThreadListLinkTarget, threadId: string): string {
  if (target.kind === "project") {
    return `/projects/${target.projectId}?thread=${threadId}`;
  }
  return `/threads/${threadId}`;
}

function isActiveStatus(status: string): boolean {
  return status.trim().toLowerCase() === "active";
}

/** Sidebar thread list grouped by source project, then owner, then agent. */
export function GroupedThreadList({
  threads,
  catalog = [],
  ownerNames = {},
  currentUserId,
  activeThreadId,
  linkTarget,
}: {
  threads: GroupableThread[];
  catalog?: SourceCatalogEntry[];
  ownerNames?: Record<string, string>;
  currentUserId?: string;
  activeThreadId?: string | null;
  linkTarget: ThreadListLinkTarget;
}) {
  const groups = useMemo(
    () => groupThreadsByProjectAndAgent(threads, catalog),
    [threads, catalog],
  );

  const [now] = useState(() => Date.now());
  const staleByDefault = useMemo(() => {
    const cutoff = now - STALE_PROJECT_MS;
    const labels = new Set<string>();
    for (const group of groups) {
      if (projectRecentMessageAt(group) < cutoff) {
        labels.add(group.projectLabel);
      }
    }
    return labels;
  }, [groups, now]);

  // User overrides of the 7-day default (explicit expand / collapse).
  const [userExpanded, setUserExpanded] = useState<Set<string>>(
    () => new Set(),
  );
  const [userCollapsed, setUserCollapsed] = useState<Set<string>>(
    () => new Set(),
  );
  const [loadMoreExpanded, setLoadMoreExpanded] = useState<Set<string>>(
    () => new Set(),
  );
  const [revealedThreadId, setRevealedThreadId] = useState<string | null>(
    activeThreadId ?? null,
  );

  function isProjectOpen(projectLabel: string): boolean {
    if (userExpanded.has(projectLabel)) return true;
    if (userCollapsed.has(projectLabel)) return false;
    return !staleByDefault.has(projectLabel);
  }

  // When the selected thread changes, open its project / load-more window.
  if (activeThreadId && activeThreadId !== revealedThreadId) {
    setRevealedThreadId(activeThreadId);
    for (const group of groups) {
      for (const ownerGroup of group.owners) {
        for (const agentGroup of ownerGroup.agents) {
          const index = agentGroup.threads.findIndex(
            (thread) => thread.id === activeThreadId,
          );
          if (index < 0) continue;
          if (!isProjectOpen(group.projectLabel)) {
            setUserExpanded((prev) => {
              const next = new Set(prev);
              next.add(group.projectLabel);
              return next;
            });
            setUserCollapsed((prev) => {
              if (!prev.has(group.projectLabel)) return prev;
              const next = new Set(prev);
              next.delete(group.projectLabel);
              return next;
            });
          }
          if (index >= INITIAL_VISIBLE) {
            const key = agentGroupKey(
              group.projectLabel,
              ownerGroup.ownerUserId,
              agentGroup.agent,
            );
            if (!loadMoreExpanded.has(key)) {
              setLoadMoreExpanded((prev) => {
                const next = new Set(prev);
                next.add(key);
                return next;
              });
            }
          }
        }
      }
    }
  }

  const revealLoadMoreForActive = useMemo(() => {
    const agentKeys = new Set<string>();
    if (!activeThreadId) return agentKeys;
    for (const group of groups) {
      for (const ownerGroup of group.owners) {
        for (const agentGroup of ownerGroup.agents) {
          const index = agentGroup.threads.findIndex(
            (thread) => thread.id === activeThreadId,
          );
          if (index >= INITIAL_VISIBLE) {
            agentKeys.add(
              agentGroupKey(
                group.projectLabel,
                ownerGroup.ownerUserId,
                agentGroup.agent,
              ),
            );
          }
        }
      }
    }
    return agentKeys;
  }, [activeThreadId, groups]);

  if (threads.length === 0) {
    return <p className="mt-2 text-sm text-muted">No threads yet</p>;
  }

  function toggleProject(projectLabel: string) {
    if (isProjectOpen(projectLabel)) {
      setUserExpanded((prev) => {
        if (!prev.has(projectLabel)) return prev;
        const next = new Set(prev);
        next.delete(projectLabel);
        return next;
      });
      setUserCollapsed((prev) => {
        const next = new Set(prev);
        next.add(projectLabel);
        return next;
      });
    } else {
      setUserCollapsed((prev) => {
        if (!prev.has(projectLabel)) return prev;
        const next = new Set(prev);
        next.delete(projectLabel);
        return next;
      });
      setUserExpanded((prev) => {
        const next = new Set(prev);
        next.add(projectLabel);
        return next;
      });
    }
  }

  function toggleLoadMore(key: string) {
    setLoadMoreExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  return (
    <div className="-mx-1 mt-2 min-h-0 flex-1 space-y-3 overflow-y-auto">
      {groups.map((group) => {
        const projectOpen = isProjectOpen(group.projectLabel);
        const Chevron = projectOpen ? ChevronDown : ChevronRight;

        return (
          <div key={group.projectLabel}>
            <button
              type="button"
              onClick={() => toggleProject(group.projectLabel)}
              aria-expanded={projectOpen}
              className="flex w-full items-center justify-between gap-2 rounded-md bg-sidebar px-2 py-1 text-left text-xs font-semibold text-muted transition hover:bg-foreground/10 hover:text-foreground"
              title={group.projectLabel}
            >
              <span className="min-w-0 truncate">{group.projectLabel}</span>
              <Chevron
                aria-hidden
                className="size-3 shrink-0"
                strokeWidth={2}
              />
            </button>

            {projectOpen ? (
              <div className="mt-1 space-y-2">
                {group.owners.map((ownerGroup) => {
                  const label = ownerLabel(
                    ownerGroup.ownerUserId,
                    ownerNames,
                    currentUserId,
                  );

                  return (
                    <div key={ownerGroup.ownerUserId}>
                      <p
                        className="truncate rounded-md bg-sidebar px-2 py-1 text-xs font-semibold text-muted"
                        title={ownerNames[ownerGroup.ownerUserId] ?? label}
                      >
                        {label}
                      </p>
                      <div className="mt-1 space-y-2">
                        {ownerGroup.agents.map((agentGroup) => {
                          const key = agentGroupKey(
                            group.projectLabel,
                            ownerGroup.ownerUserId,
                            agentGroup.agent,
                          );
                          const isExpanded =
                            loadMoreExpanded.has(key) ||
                            revealLoadMoreForActive.has(key);
                          const visible = isExpanded
                            ? agentGroup.threads
                            : agentGroup.threads.slice(0, INITIAL_VISIBLE);
                          const hiddenCount =
                            agentGroup.threads.length - visible.length;

                          return (
                            <div key={key}>
                              <p
                                className="flex items-center gap-1.5 truncate px-2 text-xs font-medium text-muted"
                                title={formatAgentDisplayName(agentGroup.agent)}
                              >
                                <AgentBrandIcon
                                  agentName={agentGroup.agent}
                                  className="size-3 shrink-0 opacity-50"
                                />
                                <span className="min-w-0 truncate">
                                  {formatAgentDisplayName(agentGroup.agent)}
                                </span>
                              </p>
                              <ul className="mt-0.5 space-y-0.5">
                                {visible.map((thread) => (
                                  <ThreadRow
                                    key={thread.id}
                                    thread={thread}
                                    selected={thread.id === activeThreadId}
                                    href={hrefForThread(linkTarget, thread.id)}
                                  />
                                ))}
                              </ul>
                              {hiddenCount > 0 ? (
                                <button
                                  type="button"
                                  onClick={() => toggleLoadMore(key)}
                                  className="mt-0.5 w-full rounded-md px-2 py-1 text-left text-xs font-medium text-muted transition hover:bg-foreground/5 hover:text-foreground"
                                >
                                  Load more ({hiddenCount})
                                </button>
                              ) : agentGroup.threads.length > INITIAL_VISIBLE ? (
                                <button
                                  type="button"
                                  onClick={() => toggleLoadMore(key)}
                                  className="mt-0.5 w-full rounded-md px-2 py-1 text-left text-xs font-medium text-muted transition hover:bg-foreground/5 hover:text-foreground"
                                >
                                  Show less
                                </button>
                              ) : null}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

function ThreadRow({
  thread,
  selected,
  href,
}: {
  thread: GroupableThread;
  selected: boolean;
  href: string;
}) {
  const title = thread.title || "Untitled thread";
  const showActiveDot = isActiveStatus(thread.status);

  return (
    <li>
      <Link href={href} aria-current={selected ? "page" : undefined}>
        <PendingActiveLabel
          active={selected}
          className="flex items-center gap-2 rounded-md px-2 py-1.5 transition hover:bg-foreground/5"
          activeClassName="flex items-center gap-2 rounded-md bg-foreground/10 px-2 py-1.5"
        >
          <span
            className="min-w-0 flex-1 truncate text-sm text-foreground"
            title={title}
          >
            {title}
          </span>
          {showActiveDot ? (
            <span
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-success"
              title={thread.status}
              aria-label={thread.status}
            />
          ) : (
            <span
              className="h-1.5 w-1.5 shrink-0"
              title={thread.status}
              aria-label={thread.status}
            />
          )}
        </PendingActiveLabel>
      </Link>
    </li>
  );
}
