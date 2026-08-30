import Link from "next/link";

import { AgentBrandIcon } from "@/components/AgentBrandIcon";
import type { SourceProjectOption } from "@/components/ManageProjectThreads";
import type { AgentThreadRow } from "@/lib/db/schema";
import { threadRecentMessageAt } from "@/lib/threads/group";

export type AgentWorkThread = Pick<
  AgentThreadRow,
  | "id"
  | "title"
  | "projectContext"
  | "threadUpdatedAt"
  | "lastSyncedAt"
  | "workingState"
  | "sourceActivity"
  | "lastAgentName"
  | "status"
  | "ownerUserId"
>;

/** Full catalog of the signed-in user's discovered source projects and threads. */
export function AgentWorkList({
  sourceProjects,
  threads,
}: {
  sourceProjects: SourceProjectOption[];
  threads: AgentWorkThread[];
}) {
  const visibleSources = sourceProjects.filter(
    (project) => !project.sidebarHidden,
  );
  const untrackedSources = visibleSources.filter((project) => !project.tracked);
  const trackedSources = visibleSources.filter((project) => project.tracked);

  return (
    <main className="min-h-0 flex-1 overflow-y-auto p-6 mt-4">
      <div className="mx-auto w-full max-w-200">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Agent feed</h1>
          <p className="mt-1 text-sm text-muted">
            Source projects and conversations available from your connected
            agents.
          </p>
        </div>

        {visibleSources.length > 0 ? (
          <section className="space-y-8" aria-label="Source projects">
            <SourceProjectGroup
              title="Untracked Projects"
              projects={untrackedSources}
              threads={threads}
            />
            <SourceProjectGroup
              title="Tracked Projects"
              projects={trackedSources}
              threads={threads}
            />
          </section>
        ) : (
          <section aria-label="Source projects">
            <h2 className="text-sm font-semibold">Source projects</h2>
            <EmptyRow>
              No source projects yet. Connect an agent to get started.
            </EmptyRow>
          </section>
        )}

        <section className="mt-8" aria-labelledby="threads-heading">
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="threads-heading" className="text-sm font-semibold">
              Tracked Threads
            </h2>
            <span className="text-xs text-muted">{threads.length}</span>
          </div>
          {threads.length > 0 ? (
            <div className="mt-3 space-y-2">
              {threads.map((thread) => (
                <ThreadCard key={thread.id} thread={thread} />
              ))}
            </div>
          ) : (
            <EmptyRow>No threads yet.</EmptyRow>
          )}
        </section>
      </div>
    </main>
  );
}

function SourceProjectGroup({
  title,
  projects,
  threads,
}: {
  title: string;
  projects: SourceProjectOption[];
  threads: AgentWorkThread[];
}) {
  if (projects.length === 0) return null;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <span className="text-xs text-muted">{projects.length}</span>
      </div>
      <div className="mt-3 space-y-2">
        {projects.map((project) => (
          <SourceProjectCard
            key={project.id}
            project={project}
            threads={threads}
          />
        ))}
      </div>
    </div>
  );
}

function SourceProjectCard({
  project,
  threads,
}: {
  project: SourceProjectOption;
  threads: AgentWorkThread[];
}) {
  const latestThread = threads
    .filter(
      (thread) =>
        thread.projectContext === project.projectId ||
        thread.projectContext === project.name,
    )
    .reduce<AgentWorkThread | null>(
      (latest, thread) =>
        !latest || threadRecentMessageAt(thread) > threadRecentMessageAt(latest)
          ? thread
          : latest,
      null,
    );
  const preview = latestThread ? threadPreview(latestThread) : null;
  const updatedAt = latestThread
    ? threadRecentMessageAt(latestThread)
    : project.updatedAt;
  const content = (
    <>
      <div className="flex min-w-0 items-center gap-3">
        {project.provider ? (
          <AgentBrandIcon
            agentName={project.provider}
            className="size-5 shrink-0"
          />
        ) : null}
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {project.name}
          </p>
          <p className="mt-0.5 truncate text-xs text-muted">
            {preview ?? project.providerLabel}
          </p>
        </div>
      </div>
      <time
        className="shrink-0 text-xs text-muted"
        dateTime={toDateTime(updatedAt)}
      >
        {formatUpdatedDate(updatedAt)}
      </time>
    </>
  );
  const className =
    "flex items-center justify-between gap-4 rounded-xl border border-border bg-surface px-4 py-3";

  if (project.tracked) return <div className={className}>{content}</div>;

  return (
    <Link
      href={`/sources/${project.id}`}
      className={`${className} transition hover:bg-background`}
    >
      {content}
    </Link>
  );
}

export function ThreadCard({ thread }: { thread: AgentWorkThread }) {
  const title = thread.title || "Untitled thread";

  return (
    <Link
      href={`/threads/${thread.id}`}
      className="flex items-center gap-3 rounded-xl border border-border bg-surface px-4 py-3 transition hover:bg-background"
    >
      <AgentBrandIcon
        agentName={thread.lastAgentName}
        className="size-5 shrink-0"
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{title}</p>
        <p className="mt-0.5 truncate text-xs text-muted">
          {threadPreview(thread) ?? "No summary available"}
        </p>
      </div>
      <time
        className="shrink-0 text-xs text-muted"
        dateTime={toDateTime(threadRecentMessageAt(thread))}
      >
        {formatUpdatedDate(threadRecentMessageAt(thread))}
      </time>
    </Link>
  );
}

function threadPreview(thread: AgentWorkThread): string | null {
  const summary = thread.workingState?.statusSummary?.trim();
  if (summary) return truncatePreview(summary);

  const latestAgentMessage = [...(thread.sourceActivity ?? [])]
    .reverse()
    .find(
      (item) => !["user", "human"].includes(item.role.trim().toLowerCase()),
    );
  return latestAgentMessage?.text
    ? truncatePreview(latestAgentMessage.text, { fromEnd: true })
    : null;
}

function truncatePreview(
  text: string,
  { fromEnd = false }: { fromEnd?: boolean } = {},
): string {
  const normalized = text
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/[\`*_>#]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (normalized.length <= 180) return normalized;

  const sentences = normalized.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [normalized];
  const preview = (fromEnd ? sentences.slice(-2) : sentences.slice(0, 2))
    .join(" ")
    .trim();
  if (preview.length <= 180) return preview;
  return `${preview.slice(0, 177).trimEnd()}…`;
}

function formatUpdatedDate(value: string | number | null | undefined): string {
  if (value == null || value === 0) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(date);
}

function toDateTime(
  value: string | number | null | undefined,
): string | undefined {
  if (value == null || value === 0) return undefined;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? undefined : date.toISOString();
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-3 rounded-xl border border-dashed border-border px-4 py-5 text-sm text-muted">
      {children}
    </p>
  );
}

function Pulse({ className }: { className: string }) {
  return (
    <div className={`animate-pulse rounded-md bg-skeleton ${className}`} />
  );
}

const PROJECT_CARD_WIDTHS = [
  { title: "w-36", preview: "w-56" },
  { title: "w-48", preview: "w-40" },
  { title: "w-28", preview: "w-64" },
] as const;

const THREAD_CARD_WIDTHS = [
  { title: "w-44", preview: "w-72" },
  { title: "w-32", preview: "w-52" },
  { title: "w-56", preview: "w-40" },
  { title: "w-40", preview: "w-64" },
  { title: "w-24", preview: "w-48" },
  { title: "w-52", preview: "w-36" },
  { title: "w-36", preview: "w-60" },
  { title: "w-48", preview: "w-44" },
] as const;

export function FeedCardSkeleton({
  titleWidth,
  previewWidth,
}: {
  titleWidth: string;
  previewWidth: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-surface px-4 py-3">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Pulse className="size-5 shrink-0 rounded-md" />
        <div className="min-w-0 flex-1">
          <Pulse className={`h-4 ${titleWidth}`} />
          <Pulse className={`mt-1.5 h-3 ${previewWidth} max-w-full`} />
        </div>
      </div>
      <Pulse className="h-3 w-12 shrink-0" />
    </div>
  );
}

function FeedGroupSkeleton({
  title,
  rows,
}: {
  title: string;
  rows: readonly { title: string; preview: string }[];
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold">{title}</h2>
        <Pulse className="h-3 w-5" />
      </div>
      <div className="mt-3 space-y-2">
        {rows.map((row, index) => (
          <FeedCardSkeleton
            key={index}
            titleWidth={row.title}
            previewWidth={row.preview}
          />
        ))}
      </div>
    </div>
  );
}

/** Matches AgentWorkList so the page does not jump when catalog data arrives. */
export function AgentWorkListFallback() {
  return (
    <main className="min-h-0 flex-1 overflow-y-auto p-6 mt-4">
      <span role="status" className="sr-only">
        Loading agent feed
      </span>
      <div className="mx-auto w-full max-w-200" aria-hidden>
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">Agent feed</h1>
          <p className="mt-1 text-sm text-muted">
            Source projects and conversations available from your connected
            agents.
          </p>
        </div>

        <section className="space-y-8" aria-label="Source projects">
          <FeedGroupSkeleton
            title="Untracked Projects"
            rows={PROJECT_CARD_WIDTHS}
          />
          <FeedGroupSkeleton
            title="Tracked Projects"
            rows={PROJECT_CARD_WIDTHS}
          />
        </section>

        <section className="mt-8">
          <FeedGroupSkeleton
            title="Tracked Threads"
            rows={THREAD_CARD_WIDTHS}
          />
        </section>
      </div>
    </main>
  );
}
