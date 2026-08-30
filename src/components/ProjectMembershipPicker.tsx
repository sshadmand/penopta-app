"use client";

import { Search } from "lucide-react";

import type {
  SourceProjectOption,
  ThreadOption,
} from "@/components/ManageProjectThreads";

export type MembershipTab = "threads" | "projects";

function matchesQuery(haystack: string, query: string): boolean {
  return haystack.toLowerCase().includes(query);
}

/** Filter agent threads by title, agent, or status. */
export function filterThreads(
  threads: ThreadOption[],
  query: string,
): ThreadOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return threads;
  return threads.filter((thread) =>
    matchesQuery(`${thread.title} ${thread.lastAgentName} ${thread.status}`, q),
  );
}

/** Filter source projects by name or provider. */
export function filterSourceProjects(
  projects: SourceProjectOption[],
  query: string,
): SourceProjectOption[] {
  const q = query.trim().toLowerCase();
  if (!q) return projects;
  return projects.filter((project) =>
    matchesQuery(`${project.name} ${project.providerLabel}`, q),
  );
}

/** Threads / source-project tab switcher for workgroup membership pickers. */
export function MembershipTabBar({
  tab,
  onChange,
  threadCount,
  projectCount,
}: {
  tab: MembershipTab;
  onChange: (tab: MembershipTab) => void;
  threadCount: number;
  projectCount: number;
}) {
  return (
    <div
      role="tablist"
      aria-label="Membership"
      className="flex gap-1 rounded-lg border border-border bg-background p-1"
    >
      {(
        [
          { id: "threads", label: "Threads", count: threadCount },
          { id: "projects", label: "Source projects", count: projectCount },
        ] as const
      ).map((item) => {
        const selected = tab === item.id;
        return (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={selected}
            onClick={() => onChange(item.id)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition ${
              selected
                ? "bg-surface text-foreground shadow-sm"
                : "text-muted hover:text-foreground"
            }`}
          >
            {item.label}
            <span className="ml-1.5 tabular-nums text-muted">{item.count}</span>
          </button>
        );
      })}
    </div>
  );
}

/** Search box for filtering the active membership list. */
export function MembershipFilterInput({
  value,
  onChange,
  placeholder,
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder: string;
}) {
  return (
    <label className="relative block">
      <span className="sr-only">Filter</span>
      <Search
        aria-hidden
        className="pointer-events-none absolute top-1/2 left-3 h-3.5 w-3.5 -translate-y-1/2 text-muted"
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="h-9 w-full rounded-lg border border-border bg-background pr-3 pl-9 text-sm text-foreground outline-none transition placeholder:text-muted focus:border-accent"
      />
    </label>
  );
}

/** Checkbox list for agent threads. */
export function ThreadMembershipList({
  threads,
  selected,
  onToggle,
  emptyMessage,
}: {
  threads: ThreadOption[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  emptyMessage: string;
}) {
  if (threads.length === 0) {
    return (
      <p className="px-1 py-6 text-center text-sm text-muted">{emptyMessage}</p>
    );
  }

  return (
    <ul className="space-y-0.5">
      {threads.map((thread) => {
        const checked = selected.has(thread.id);
        return (
          <li key={thread.id}>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 transition hover:bg-background">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(thread.id)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
              />
              <span className="min-w-0">
                <span className="block truncate text-sm text-foreground">
                  {thread.title || "Untitled thread"}
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted">
                  {thread.lastAgentName} · {thread.status}
                </span>
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

/** Checkbox list for source (provider) projects. */
export function SourceProjectMembershipList({
  projects,
  selected,
  onToggle,
  emptyMessage,
}: {
  projects: SourceProjectOption[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  emptyMessage: string;
}) {
  if (projects.length === 0) {
    return (
      <p className="px-1 py-6 text-center text-sm text-muted">{emptyMessage}</p>
    );
  }

  return (
    <ul className="space-y-0.5">
      {projects.map((project) => {
        const checked = selected.has(project.id);
        return (
          <li key={project.id}>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg px-2 py-2 transition hover:bg-background">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(project.id)}
                className="mt-0.5 h-4 w-4 shrink-0 accent-accent"
              />
              <span className="min-w-0">
                <span className="block truncate text-sm text-foreground">
                  {project.name}
                </span>
                <span className="mt-0.5 block truncate text-xs text-muted">
                  {project.providerLabel}
                </span>
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}
