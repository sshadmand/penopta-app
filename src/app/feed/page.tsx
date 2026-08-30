import { redirect } from "next/navigation";
import { Suspense } from "react";

import {
  AgentWorkList,
  AgentWorkListFallback,
} from "@/components/AgentWorkList";
import { WorkspaceChromeFallback } from "@/components/RouteFallback";
import { WorkspaceShell } from "@/components/WorkspaceShell";
import { getSession } from "@/lib/auth/server";
import { loginStartHref } from "@/lib/auth/urls";
import { listMyAvailableProviderProjects } from "@/lib/integrations/provider-projects-data";
import { toSourceProjectOption } from "@/lib/integrations/provider-projects-view";
import { resolveActiveOrg } from "@/lib/orgs/data";
import { toOrgSwitcherItems } from "@/lib/orgs/view";
import { listVisibleProjects } from "@/lib/projects/data";
import { listOwnedAgentThreads } from "@/lib/threads/data";
import { resolveThreadOwnerNames } from "@/lib/threads/owners";

export default function AgentFeedPage() {
  return (
    <Suspense
      fallback={
        <WorkspaceChromeFallback activeNav="feed">
          <AgentWorkListFallback />
        </WorkspaceChromeFallback>
      }
    >
      <AgentFeedContent />
    </Suspense>
  );
}

async function AgentFeedContent() {
  const session = await getSession();
  if (!session) redirect(loginStartHref("/feed"));

  const { activeOrg, memberships } = await resolveActiveOrg(session.user.id);
  const [threads, projects, availableSources] = await Promise.all([
    listOwnedAgentThreads(session.user.id),
    listVisibleProjects({ orgId: activeOrg.id, viewerUserId: session.user.id }),
    listMyAvailableProviderProjects(activeOrg.id, session.user.id),
  ]);
  const sourceProjects = availableSources.map(toSourceProjectOption);
  const ownerNames = await resolveThreadOwnerNames(threads, session);

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
      <AgentWorkList sourceProjects={sourceProjects} threads={threads} />
    </WorkspaceShell>
  );
}
