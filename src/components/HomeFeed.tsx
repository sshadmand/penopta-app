import Link from "next/link";

import { FeedCardSkeleton, ThreadCard } from "@/components/AgentWorkList";
import { CompactTime } from "@/components/LocalTime";
import { StatsGraphFallback } from "@/components/StatsFallback";
import { SummaryPostFrame } from "@/components/SummaryPostFrame";
import type { AgentThreadRow } from "@/lib/db/schema";
import { INTEGRATIONS_PATH, integrationPath } from "@/lib/integrations/paths";
import type { OrgDailySummary } from "@/lib/projects/chat-data";
import { stripMarkdown } from "@/lib/text/strip-markdown";
import { threadRecentMessageAt } from "@/lib/threads/group";

const emptyHintLinkClass =
  "font-medium text-foreground underline-offset-2 hover:underline";

const LATEST_SUMMARY_COUNT = 3;
const LATEST_THREAD_COUNT = 5;

function SectionHeading({
  id,
  title,
  href,
  hrefLabel,
}: {
  id: string;
  title: string;
  href: string;
  hrefLabel: string;
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <h2 id={id} className="text-sm font-semibold">
        {title}
      </h2>
      <Link
        href={href}
        className="text-xs text-muted transition hover:text-foreground"
      >
        {hrefLabel}
      </Link>
    </div>
  );
}

/** Newest summary per workgroup, then the most recent of those. */
function latestSummariesByProject(
  summaries: OrgDailySummary[],
  limit: number,
): OrgDailySummary[] {
  const seen = new Set<string>();
  const latest: OrgDailySummary[] = [];
  const newestFirst = [...summaries].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
  for (const summary of newestFirst) {
    if (seen.has(summary.projectId)) continue;
    seen.add(summary.projectId);
    latest.push(summary);
    if (latest.length >= limit) break;
  }
  return latest;
}

function SummariesEmptyHint({
  hasLlmKey,
  hasConnectedAgents,
  hasWorkgroups,
}: {
  hasLlmKey: boolean;
  hasConnectedAgents: boolean;
  hasWorkgroups: boolean;
}) {
  if (!hasLlmKey) {
    return (
      <>
        <Link href={integrationPath("ai")} className={emptyHintLinkClass}>
          Connect your LLM key
        </Link>{" "}
        to create updates.
      </>
    );
  }
  if (!hasConnectedAgents) {
    return (
      <Link href={INTEGRATIONS_PATH} className={emptyHintLinkClass}>
        Connect a chat agent or IDE
      </Link>
    );
  }
  if (!hasWorkgroups) {
    return (
      <>
        <Link href="/updates" className={emptyHintLinkClass}>
          Create a workgroup
        </Link>{" "}
        to organize your agent output.
      </>
    );
  }
  return <>No summaries yet.</>;
}

function ThreadsEmptyHint({
  hasConnectedAgents,
  hasWorkgroups,
}: {
  hasConnectedAgents: boolean;
  hasWorkgroups: boolean;
}) {
  if (!hasConnectedAgents) {
    return (
      <Link href={INTEGRATIONS_PATH} className={emptyHintLinkClass}>
        Connect a chat agent or IDE
      </Link>
    );
  }
  if (!hasWorkgroups) {
    return (
      <>
        <Link href="/updates" className={emptyHintLinkClass}>
          Create a workgroup
        </Link>{" "}
        to organize your agent output.
      </>
    );
  }
  return <>No tracked threads yet.</>;
}

/** Newest summaries, one per workgroup — links out to the full thread. */
export function HomeSummaryPreviews({
  summaries,
  hasLlmKey,
  hasConnectedAgents,
  hasWorkgroups,
}: {
  summaries: OrgDailySummary[];
  hasLlmKey: boolean;
  hasConnectedAgents: boolean;
  hasWorkgroups: boolean;
}) {
  const latest = latestSummariesByProject(summaries, LATEST_SUMMARY_COUNT);

  return (
    <section aria-labelledby="home-summaries-heading">
      <SectionHeading
        id="home-summaries-heading"
        title="Latest summaries"
        href="/updates"
        hrefLabel="See all"
      />
      {latest.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          <SummariesEmptyHint
            hasLlmKey={hasLlmKey}
            hasConnectedAgents={hasConnectedAgents}
            hasWorkgroups={hasWorkgroups}
          />
        </p>
      ) : (
        <ul className="mt-3 space-y-3">
          {latest.map((summary) => (
            <li key={summary.id}>
              <SummaryPostFrame
                header={
                  <>
                    <Link
                      href={`/projects/${summary.projectId}`}
                      className="min-w-0 truncate text-sm font-semibold text-foreground hover:underline"
                    >
                      {summary.projectName}
                    </Link>
                    <CompactTime
                      at={summary.createdAt}
                      className="shrink-0 text-xs text-muted"
                    />
                  </>
                }
              >
                <p className="line-clamp-3">{stripMarkdown(summary.text)}</p>
              </SummaryPostFrame>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Tracked threads with the most recent activity. */
export function HomeRecentThreads({
  threads,
  hasConnectedAgents,
  hasWorkgroups,
}: {
  threads: AgentThreadRow[];
  hasConnectedAgents: boolean;
  hasWorkgroups: boolean;
}) {
  const latest = [...threads]
    .sort((a, b) => threadRecentMessageAt(b) - threadRecentMessageAt(a))
    .slice(0, LATEST_THREAD_COUNT);

  return (
    <section aria-labelledby="home-threads-heading">
      <SectionHeading
        id="home-threads-heading"
        title="Recent threads"
        href="/feed"
        hrefLabel="See all"
      />
      {latest.length === 0 ? (
        <p className="mt-3 text-sm text-muted">
          <ThreadsEmptyHint
            hasConnectedAgents={hasConnectedAgents}
            hasWorkgroups={hasWorkgroups}
          />
        </p>
      ) : (
        <div className="mt-3 space-y-2">
          {latest.map((thread) => (
            <ThreadCard key={thread.id} thread={thread} />
          ))}
        </div>
      )}
    </section>
  );
}

function Pulse({ className }: { className: string }) {
  return (
    <div className={`animate-pulse rounded-md bg-skeleton ${className}`} />
  );
}

const HOME_SUMMARY_CARDS = [
  { name: "w-36", lines: ["w-full", "w-11/12", "w-2/3"] },
  { name: "w-28", lines: ["w-full", "w-4/5", "w-1/2"] },
  { name: "w-44", lines: ["w-full", "w-5/6", "w-3/5"] },
] as const;

const HOME_THREAD_CARDS = [
  { title: "w-44", preview: "w-72" },
  { title: "w-32", preview: "w-52" },
  { title: "w-56", preview: "w-40" },
  { title: "w-40", preview: "w-64" },
  { title: "w-24", preview: "w-48" },
] as const;

/** Matches the signed-in home column so the page does not jump when data arrives. */
export function HomePageFallback() {
  return (
    <main className="min-h-0 flex-1 overflow-y-auto">
      <span role="status" className="sr-only">
        Loading home
      </span>
      <div className="mx-auto max-w-4xl px-8 py-10 sm:px-12" aria-hidden>
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome to Penopta
          </h1>
          <p className="mt-1 text-sm text-muted">
            View your agent activity and insights.
          </p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-5 sm:p-6">
          <StatsGraphFallback framed={false} variant="heatmap" />
        </div>

        <div className="mt-10">
          <section>
            <SectionHeading
              id="home-summaries-heading"
              title="Latest summaries"
              href="/updates"
              hrefLabel="See all"
            />
            <ul className="mt-3 space-y-3">
              {HOME_SUMMARY_CARDS.map((card, index) => (
                <li key={index}>
                  <article className="w-full overflow-hidden rounded-lg border border-border bg-surface">
                    <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
                      <Pulse className={`h-4 ${card.name}`} />
                      <Pulse className="h-3 w-14 shrink-0" />
                    </header>
                    <div className="space-y-2 px-3 py-2.5">
                      {card.lines.map((width, line) => (
                        <Pulse key={line} className={`h-3.5 ${width}`} />
                      ))}
                    </div>
                  </article>
                </li>
              ))}
            </ul>
          </section>
        </div>

        <div className="mt-10">
          <section>
            <SectionHeading
              id="home-threads-heading"
              title="Recent threads"
              href="/feed"
              hrefLabel="See all"
            />
            <div className="mt-3 space-y-2">
              {HOME_THREAD_CARDS.map((card, index) => (
                <FeedCardSkeleton
                  key={index}
                  titleWidth={card.title}
                  previewWidth={card.preview}
                />
              ))}
            </div>
          </section>
        </div>
      </div>
    </main>
  );
}
