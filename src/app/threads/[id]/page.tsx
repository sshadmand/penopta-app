import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { WorkspaceChromeFallback } from "@/components/RouteFallback";
import { ThreadConversation } from "@/components/ThreadConversation";
import { ThreadHeaderMeta } from "@/components/ThreadHeaderMeta";
import { WorkspaceShell } from "@/components/WorkspaceShell";
import { getSession } from "@/lib/auth/server";
import { loginStartHref } from "@/lib/auth/urls";
import { listMyAvailableProviderProjects } from "@/lib/integrations/provider-projects-data";
import {
  resolveSourceProjectLabel,
  toSourceProjectOption,
} from "@/lib/integrations/provider-projects-view";
import { resolveActiveOrg } from "@/lib/orgs/data";
import { toOrgSwitcherItems } from "@/lib/orgs/view";
import { listVisibleProjects } from "@/lib/projects/data";
import { getOwnedAgentThread, listOwnedAgentThreads } from "@/lib/threads/data";

export default function ThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<WorkspaceChromeFallback />}>
      <ThreadPageContent params={params} />
    </Suspense>
  );
}

async function ThreadPageContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect(loginStartHref(`/threads/${id}`));

  const { activeOrg, memberships } = await resolveActiveOrg(session.user.id);

  const [threads, thread, projects, availableSources] = await Promise.all([
    listOwnedAgentThreads(session.user.id),
    getOwnedAgentThread(session.user.id, id),
    listVisibleProjects({ orgId: activeOrg.id, viewerUserId: session.user.id }),
    listMyAvailableProviderProjects(activeOrg.id, session.user.id),
  ]);
  if (!thread) notFound();
  // Personal thread pages are owner-only; shared reading happens inside a
  // Workgroup after someone links the thread.
  if (thread.ownerUserId !== session.user.id) notFound();

  const sourceProjectLabel = resolveSourceProjectLabel(
    thread.projectContext,
    availableSources.map((project) => ({
      name: project.name,
      projectId: project.projectId,
    })),
  );
  const sourceProjects = availableSources.map(toSourceProjectOption);

  return (
    <WorkspaceShell
      user={session.user}
      orgs={toOrgSwitcherItems(memberships)}
      activeOrgId={activeOrg.id}
      threads={threads}
      projects={projects}
      sourceProjects={sourceProjects}
      agentWorkActive
    >
      <main className="flex min-h-0 flex-1 flex-col">
        <div className="border-b border-border bg-surface px-6 py-4">
          <h1 className="truncate text-lg font-semibold tracking-tight">
            {thread.title || "Untitled thread"}
          </h1>
          <ThreadHeaderMeta
            agentName={thread.lastAgentName}
            ownerName={session.user.name || session.user.email}
            projectLabel={sourceProjectLabel}
            lastSyncedAt={thread.lastSyncedAt}
          />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-6">
          <div className="mx-auto w-full max-w-3xl">
            {thread.workingState?.statusSummary ? (
              <div className="mb-6 rounded-xl border border-border bg-sidebar px-4 py-3 text-sm leading-relaxed text-foreground">
                <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-muted">
                  Summary
                </p>
                {thread.workingState.statusSummary}
              </div>
            ) : null}

            <ThreadConversation activity={thread.sourceActivity} />
          </div>
        </div>
      </main>
    </WorkspaceShell>
  );
}
