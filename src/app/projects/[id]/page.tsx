import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { AgentBrandIcon } from "@/components/AgentBrandIcon";
import { BrandLogo } from "@/components/Brand";
import { DeleteProjectButton } from "@/components/DeleteProjectButton";
import { DownloadMacAppLink } from "@/components/DownloadMacAppLink";
import { GroupedThreadList } from "@/components/GroupedThreadList";
import { LocaleTime } from "@/components/LocalTime";
import { ManageProjectThreads } from "@/components/ManageProjectThreads";
import { OrgSwitcher } from "@/components/OrgSwitcher";
import { ProjectActivityPreview } from "@/components/ProjectActivityPreview";
import { ProjectHeader } from "@/components/ProjectHeader";
import {
  ProjectSidebarFrame,
  ProjectSidebarToggle,
} from "@/components/ProjectSidebarFrame";
import { ProjectTimeline } from "@/components/ProjectTimeline";
import { ProjectVisibilityControl } from "@/components/ProjectVisibilityControl";
import { ProjectChromeFallback } from "@/components/RouteFallback";
import { ThreadConversation } from "@/components/ThreadConversation";
import { ThreadHeaderMeta } from "@/components/ThreadHeaderMeta";
import { hasAnyOrgLlmCredential } from "@/lib/ai/credentials";
import { getSession } from "@/lib/auth/server";
import { loginStartHref } from "@/lib/auth/urls";
import { lookupUsers } from "@/lib/auth/users";
import {
  listAvailableProviderProjects,
  listMyAvailableProviderProjects,
} from "@/lib/integrations/provider-projects-data";
import {
  resolveSourceProjectLabel,
  toSourceProjectOption,
} from "@/lib/integrations/provider-projects-view";
import { listOrgMembers, resolveActiveOrg } from "@/lib/orgs/data";
import { toOrgSwitcherItems } from "@/lib/orgs/view";
import { buildProjectActivityFeed } from "@/lib/projects/activity-feed";
import { listProjectChatMessages } from "@/lib/projects/chat-data";
import { getVisibleProject } from "@/lib/projects/data";
import { activityBucketsFromThreads } from "@/lib/stats/preview";
import {
  listExplicitProjectThreadIds,
  listOwnedAgentThreads,
  listProjectSourceProjectIds,
  listProjectThreads,
} from "@/lib/threads/data";
import { threadRecentMessageAt } from "@/lib/threads/group";
import { resolveThreadOwnerNames } from "@/lib/threads/owners";

function parseFocusActivityIndex(raw: string | undefined): number | undefined {
  if (raw == null || raw === "") return undefined;
  const n = Number.parseInt(raw, 10);
  if (!Number.isInteger(n) || n < 0) return undefined;
  return n;
}

export default function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ thread?: string; activity?: string }>;
}) {
  return (
    <Suspense fallback={<ProjectChromeFallback />}>
      <ProjectDetailContent params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function ProjectDetailContent({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ thread?: string; activity?: string }>;
}) {
  const { id } = await params;
  const { thread: threadParam, activity: activityParam } = await searchParams;
  const focusActivityIndex = parseFocusActivityIndex(activityParam);
  const returnPath = threadParam
    ? `/projects/${id}?thread=${threadParam}`
    : `/projects/${id}`;
  const session = await getSession();
  if (!session) redirect(loginStartHref(returnPath));

  const { activeOrg, memberships } = await resolveActiveOrg(session.user.id);

  const [project, members] = await Promise.all([
    getVisibleProject(id, activeOrg.id, session.user.id),
    listOrgMembers(activeOrg.id),
  ]);
  if (!project) notFound();

  const [
    threads,
    myThreads,
    mySources,
    orgSources,
    explicitThreadIds,
    myLinkedSourceIds,
    hasLlmKey,
    chatMessages,
  ] = await Promise.all([
    listProjectThreads(project.id, activeOrg.id),
    listOwnedAgentThreads(session.user.id),
    listMyAvailableProviderProjects(activeOrg.id, session.user.id),
    listAvailableProviderProjects(activeOrg.id),
    listExplicitProjectThreadIds(project.id),
    listProjectSourceProjectIds(project.id, {
      addedByUserId: session.user.id,
    }),
    hasAnyOrgLlmCredential(activeOrg.id),
    listProjectChatMessages(project.id, activeOrg.id),
  ]);

  const [memberNames, ownerNames] = await Promise.all([
    lookupUsers(members.map((m) => m.userId)),
    resolveThreadOwnerNames(threads, session),
  ]);
  const sourceProjects = mySources.map(toSourceProjectOption);
  // Org-wide catalog plus this member's sources (which may live in their
  // personal space) so linked threads still resolve labels.
  const sourceCatalog = [
    ...orgSources.map((source) => ({
      name: source.name,
      projectId: source.projectId,
    })),
    ...mySources
      .filter(
        (source) =>
          !orgSources.some(
            (orgSource) =>
              orgSource.name === source.name &&
              orgSource.projectId === source.projectId,
          ),
      )
      .map((source) => ({
        name: source.name,
        projectId: source.projectId,
      })),
  ];
  const memberLabels = members.map((m) =>
    m.userId === session.user.id
      ? "You"
      : (memberNames.get(m.userId)?.name ?? m.userId),
  );

  const user = session.user;
  const isOwner = project.ownerUserId === user.id;

  const agentCount = new Set(
    threads.map((t) => t.lastAgentName).filter(Boolean),
  ).size;
  const activityLines = buildProjectActivityFeed(threads, sourceCatalog);
  let lastActivityAt = 0;
  let lastActivityAgent = "";
  let lastActivityTitle = "";
  let lastActivityThreadId = "";
  let lastActivityIndex = -1;
  for (const thread of threads) {
    const at = threadRecentMessageAt(thread);
    if (at > lastActivityAt) {
      lastActivityAt = at;
      lastActivityAgent = thread.lastAgentName;
      lastActivityTitle = thread.title || "Untitled thread";
      lastActivityThreadId = thread.id;
      lastActivityIndex = -1;
      for (let i = 0; i < thread.sourceActivity.length; i++) {
        const ts = thread.sourceActivity[i].timestamp;
        if (!ts) continue;
        if (new Date(ts).getTime() === at) lastActivityIndex = i;
      }
    }
  }
  const lastActivityHref =
    lastActivityIndex >= 0
      ? `/projects/${project.id}?thread=${lastActivityThreadId}&activity=${lastActivityIndex}`
      : `/projects/${project.id}?thread=${lastActivityThreadId}`;
  const selectedThread = threadParam
    ? (threads.find((thread) => thread.id === threadParam) ?? null)
    : null;
  const selectedOwnerName = selectedThread
    ? (ownerNames[selectedThread.ownerUserId] ?? selectedThread.ownerUserId)
    : null;
  const selectedSourceProject = selectedThread
    ? resolveSourceProjectLabel(selectedThread.projectContext, sourceCatalog)
    : null;

  return (
    <ProjectSidebarFrame
      sidebar={
        <>
          <div className="shrink-0 border-b border-border py-2.5 pr-12 pl-4 md:px-4">
            <Link href="/">
              <BrandLogo className="h-7" />
            </Link>
          </div>

          <div className="shrink-0 px-3 pt-3">
            <Link
              href="/"
              className="flex h-9 w-full items-center justify-center gap-1.5 rounded-lg border border-border bg-surface text-sm font-medium text-foreground transition hover:bg-background"
            >
              <ArrowLeft aria-hidden className="h-4 w-4" />
              Back
            </Link>
          </div>

          <div className="flex min-h-0 flex-1 flex-col px-4 pt-5">
            <Link
              href={`/projects/${project.id}`}
              aria-current={selectedThread ? undefined : "page"}
              className={`-mx-1 mb-3 block shrink-0 truncate rounded-md px-2 py-1.5 text-sm transition ${
                selectedThread
                  ? "text-foreground hover:bg-foreground/5"
                  : "bg-foreground/10 font-medium text-foreground"
              }`}
            >
              Workgroup home
            </Link>

            <div className="flex shrink-0 items-center justify-between gap-2">
              <p className="text-xs font-semibold tracking-wider text-muted uppercase">
                Agent Threads
              </p>
              <ManageProjectThreads
                projectId={project.id}
                currentUserId={user.id}
                threads={myThreads.map((thread) => ({
                  id: thread.id,
                  title: thread.title,
                  lastAgentName: thread.lastAgentName,
                  status: thread.status,
                  ownerName:
                    ownerNames[thread.ownerUserId] ?? thread.ownerUserId,
                  ownerUserId: thread.ownerUserId,
                }))}
                selectedThreadIds={explicitThreadIds}
                sourceProjects={sourceProjects}
                selectedSourceProjectIds={myLinkedSourceIds}
              />
            </div>
            <GroupedThreadList
              threads={threads}
              catalog={sourceCatalog}
              ownerNames={ownerNames}
              currentUserId={user.id}
              activeThreadId={selectedThread?.id}
              linkTarget={{ kind: "project", projectId: project.id }}
            />

            <div className="mt-auto shrink-0 pb-4">
              <DownloadMacAppLink />
            </div>
          </div>

          <div className="shrink-0 border-t border-border px-4 py-4">
            <OrgSwitcher
              activeOrgId={activeOrg.id}
              orgs={toOrgSwitcherItems(memberships)}
              userEmail={user.email}
            />
          </div>
        </>
      }
    >
      {/* Center: conversation */}
      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <ProjectHeader
          projectId={project.id}
          name={project.name}
          isOwner={isOwner}
          leading={<ProjectSidebarToggle />}
          trailing={
            <ProjectActivityPreview
              projectId={project.id}
              buckets={activityBucketsFromThreads(threads)}
            />
          }
        />

        {selectedThread ? (
          <main className="flex min-h-0 flex-1 flex-col">
            <div className=" flex items-center text-sm justify-between shrink-0 border-b border-border bg-sidebar px-6 py-2">
              <h2 className="truncate tracking-tight">
                {selectedThread.title || "Untitled thread"}
              </h2>
              <ThreadHeaderMeta
                agentName={selectedThread.lastAgentName}
                ownerName={selectedOwnerName ?? selectedThread.ownerUserId}
                projectLabel={selectedSourceProject}
                lastSyncedAt={selectedThread.lastSyncedAt}
              />
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
              <div className="mx-auto w-full max-w-3xl">
                {selectedThread.workingState?.statusSummary ? (
                  <div className="mb-6 rounded-xl border border-border bg-sidebar px-4 py-3 text-sm leading-relaxed text-foreground">
                    <p className="mb-1 text-xs font-semibold tracking-wider text-muted uppercase">
                      Summary
                    </p>
                    {selectedThread.workingState.statusSummary}
                  </div>
                ) : null}

                <ThreadConversation
                  activity={selectedThread.sourceActivity}
                  focusActivityIndex={focusActivityIndex}
                />
              </div>
            </div>
          </main>
        ) : (
          <ProjectTimeline
            key={project.id}
            projectId={project.id}
            activityLines={activityLines}
            initialChatMessages={chatMessages}
            hasLlmKey={hasLlmKey}
            currentUserId={user.id}
            needsAgents={threads.length === 0}
          />
        )}
      </div>

      {/* Right: details */}
      <aside className="hidden h-full w-64 shrink-0 flex-col border-l border-border bg-surface lg:flex">
        <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-5 py-5">
          <p className="text-xs font-semibold tracking-wider text-muted uppercase">
            Details
          </p>

          <section>
            <ProjectVisibilityControl
              projectId={project.id}
              visibility={project.visibility}
              canEdit={isOwner}
            />
          </section>

          <section>
            <p className="text-xs font-semibold tracking-wider text-muted uppercase">
              Agents
            </p>
            {threads.length > 0 ? (
              <p className="mt-3 text-sm text-muted">
                {agentCount} {agentCount === 1 ? "agent" : "agents"}
              </p>
            ) : (
              <Link
                href="/settings/integrations"
                className="mt-3 flex h-9 w-full items-center justify-center rounded-lg border border-border bg-surface text-sm font-medium text-foreground transition hover:bg-background"
              >
                Connect an agent
              </Link>
            )}
          </section>

          <section>
            <p className="text-xs font-semibold tracking-wider text-muted uppercase">
              Members · {activeOrg.name}
            </p>
            {memberLabels.length <= 1 ? (
              <p className="mt-2 text-sm text-muted">Only you</p>
            ) : (
              <ul className="mt-2 space-y-1">
                {memberLabels.map((label, i) => (
                  <li
                    key={members[i].id}
                    className="truncate text-sm text-foreground"
                    title={label}
                  >
                    {label}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section>
            <p className="text-xs font-semibold tracking-wider text-muted uppercase">
              Last Sync Activity
            </p>
            {lastActivityAt > 0 ? (
              <Link
                href={lastActivityHref}
                className="mt-2 block rounded-md transition hover:bg-foreground/5"
              >
                <p className="flex items-center gap-2 text-sm text-foreground">
                  <AgentBrandIcon
                    agentName={lastActivityAgent}
                    className="size-3.5"
                  />
                  <LocaleTime at={lastActivityAt} />
                </p>
                <p
                  className="mt-1 truncate text-xs text-muted"
                  title={lastActivityTitle}
                >
                  {lastActivityTitle}
                </p>
              </Link>
            ) : (
              <p className="mt-2 text-sm text-muted">No recent activity</p>
            )}
          </section>
        </div>

        {isOwner ? (
          <div className="shrink-0 px-5 py-4">
            <DeleteProjectButton projectId={project.id} name={project.name} />
          </div>
        ) : null}
      </aside>
    </ProjectSidebarFrame>
  );
}
