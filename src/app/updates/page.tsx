import { redirect } from "next/navigation";
import { Suspense } from "react";

import { AddAgentsHelper } from "@/components/AddAgentsHelper";
import { AddDataHelper } from "@/components/AddDataHelper";
import {
  HomeSummariesThread,
  HomeSummariesThreadFallback,
} from "@/components/HomeSummariesThread";
import { WorkspaceChromeFallback } from "@/components/RouteFallback";
import { WorkspaceEmpty } from "@/components/WorkspaceEmpty";
import { WorkspaceShell } from "@/components/WorkspaceShell";
import { getSession } from "@/lib/auth/server";
import { loginStartHref } from "@/lib/auth/urls";
import { listMyAvailableProviderProjects } from "@/lib/integrations/provider-projects-data";
import { toSourceProjectOption } from "@/lib/integrations/provider-projects-view";
import { resolveActiveOrg } from "@/lib/orgs/data";
import { toOrgSwitcherItems } from "@/lib/orgs/view";
import { listVisibleDailySummaries } from "@/lib/projects/chat-data";
import { listVisibleProjects } from "@/lib/projects/data";
import { listOwnedAgentThreads, orgHasLinkedAgents } from "@/lib/threads/data";
import { resolveThreadOwnerNames } from "@/lib/threads/owners";

export default function UpdatesPage() {
  return (
    <Suspense
      fallback={
        <WorkspaceChromeFallback activeNav="updates">
          <HomeSummariesThreadFallback />
        </WorkspaceChromeFallback>
      }
    >
      <UpdatesContent />
    </Suspense>
  );
}

async function UpdatesContent() {
  const session = await getSession();
  if (!session) redirect(loginStartHref("/updates"));

  const { activeOrg, memberships } = await resolveActiveOrg(session.user.id);

  const [threads, projects, availableSources, summaries, hasLinkedAgents] =
    await Promise.all([
      listOwnedAgentThreads(session.user.id),
      listVisibleProjects({
        orgId: activeOrg.id,
        viewerUserId: session.user.id,
      }),
      listMyAvailableProviderProjects(activeOrg.id, session.user.id),
      listVisibleDailySummaries({
        orgId: activeOrg.id,
        viewerUserId: session.user.id,
      }),
      orgHasLinkedAgents(activeOrg.id),
    ]);
  const ownerNames = await resolveThreadOwnerNames(threads, session);
  const sourceProjects = availableSources.map(toSourceProjectOption);
  const orgs = toOrgSwitcherItems(memberships);
  const hasCatalogData = threads.length > 0 || sourceProjects.length > 0;

  if (projects.length === 0 && hasCatalogData) {
    return (
      <WorkspaceEmpty
        user={session.user}
        orgs={orgs}
        activeOrgId={activeOrg.id}
        threads={threads}
        projects={projects}
        sourceProjects={sourceProjects}
        ownerNames={ownerNames}
      />
    );
  }

  return (
    <WorkspaceShell
      user={session.user}
      orgs={orgs}
      activeOrgId={activeOrg.id}
      threads={threads}
      projects={projects}
      sourceProjects={sourceProjects}
      ownerNames={ownerNames}
      workgroupUpdatesActive
    >
      {hasLinkedAgents || summaries.length > 0 ? (
        <HomeSummariesThread
          summaries={summaries}
          projects={projects.map((project) => ({
            id: project.id,
            name: project.name,
          }))}
        />
      ) : (
        <main className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-6">
          {projects.length > 0 ? (
            <AddDataHelper
              projects={projects.map((project) => ({
                id: project.id,
                name: project.name,
              }))}
              threads={threads
                .filter((thread) => thread.ownerUserId === session.user.id)
                .map((thread) => ({
                  id: thread.id,
                  title: thread.title,
                  lastAgentName: thread.lastAgentName,
                  status: thread.status,
                  ownerName:
                    ownerNames[thread.ownerUserId] ?? thread.ownerUserId,
                  ownerUserId: thread.ownerUserId,
                }))}
              sourceProjects={sourceProjects}
              currentUserId={session.user.id}
            />
          ) : (
            <AddAgentsHelper />
          )}
        </main>
      )}
    </WorkspaceShell>
  );
}
