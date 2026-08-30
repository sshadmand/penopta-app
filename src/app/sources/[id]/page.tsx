import { notFound, redirect } from "next/navigation";
import { Suspense } from "react";

import { WorkspaceChromeFallback } from "@/components/RouteFallback";
import { StartTrackingEmpty } from "@/components/StartTrackingEmpty";
import { WorkspaceShell } from "@/components/WorkspaceShell";
import { getSession } from "@/lib/auth/server";
import { loginStartHref } from "@/lib/auth/urls";
import {
  listMyAvailableProviderProjects,
  markProviderProjectsTracked,
} from "@/lib/integrations/provider-projects-data";
import { toSourceProjectOption } from "@/lib/integrations/provider-projects-view";
import { resolveActiveOrg } from "@/lib/orgs/data";
import { toOrgSwitcherItems } from "@/lib/orgs/view";
import { listVisibleProjects } from "@/lib/projects/data";
import {
  findVisibleProjectIdForSource,
  listOwnedAgentThreads,
} from "@/lib/threads/data";
import { resolveThreadOwnerNames } from "@/lib/threads/owners";

export default function UntrackedSourcePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense fallback={<WorkspaceChromeFallback />}>
      <UntrackedSourceContent params={params} />
    </Suspense>
  );
}

async function UntrackedSourceContent({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getSession();
  if (!session) redirect(loginStartHref(`/sources/${id}`));

  const { activeOrg, memberships } = await resolveActiveOrg(session.user.id);

  const [threads, projects, availableSources, linkedProjectId] =
    await Promise.all([
      listOwnedAgentThreads(session.user.id),
      listVisibleProjects({
        orgId: activeOrg.id,
        viewerUserId: session.user.id,
      }),
      listMyAvailableProviderProjects(activeOrg.id, session.user.id),
      findVisibleProjectIdForSource({
        sourceId: id,
        orgId: activeOrg.id,
        viewerUserId: session.user.id,
      }),
    ]);

  const source = availableSources.find((item) => item.id === id);
  if (!source) notFound();

  if (linkedProjectId) {
    if (!source.tracked) {
      await markProviderProjectsTracked([source.id]);
    }
    redirect(`/projects/${linkedProjectId}`);
  }
  if (source.tracked) redirect("/");
  if (source.sidebarHidden) redirect("/");

  const ownerNames = await resolveThreadOwnerNames(threads, session);
  const sourceProjects = availableSources.map(toSourceProjectOption);
  const sourceOption = toSourceProjectOption(source);

  return (
    <WorkspaceShell
      user={session.user}
      orgs={toOrgSwitcherItems(memberships)}
      activeOrgId={activeOrg.id}
      threads={threads}
      projects={projects}
      sourceProjects={sourceProjects}
      ownerNames={ownerNames}
      agentWorkActive
    >
      <main className="flex min-h-0 flex-1 items-center justify-center overflow-hidden p-6">
        <StartTrackingEmpty
          source={sourceOption}
          projects={projects.map((project) => ({
            id: project.id,
            name: project.name,
          }))}
        />
      </main>
    </WorkspaceShell>
  );
}
