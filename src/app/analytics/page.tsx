import { redirect } from "next/navigation";
import { Suspense } from "react";

import { ContributionGraph } from "@/components/ContributionGraph";
import { AnalyticsChrome, AnalyticsFallback } from "@/components/StatsFallback";
import { WorkspaceChromeFallback } from "@/components/RouteFallback";
import { StatsChat } from "@/components/StatsChat";
import { WorkspaceShell } from "@/components/WorkspaceShell";
import { hasAnyOrgLlmCredential } from "@/lib/ai/credentials";
import { getSession } from "@/lib/auth/server";
import { loginStartHref } from "@/lib/auth/urls";
import { listMyAvailableProviderProjects } from "@/lib/integrations/provider-projects-data";
import { toSourceProjectOption } from "@/lib/integrations/provider-projects-view";
import { resolveActiveOrg } from "@/lib/orgs/data";
import { toOrgSwitcherItems } from "@/lib/orgs/view";
import { listVisibleProjects } from "@/lib/projects/data";
import { listStatsChatMessages } from "@/lib/stats/chat-data";
import { loadOrgActivityStats } from "@/lib/stats/data";
import { listOwnedAgentThreads } from "@/lib/threads/data";
import { resolveThreadOwnerNames } from "@/lib/threads/owners";

export default function AnalyticsPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  return (
    <Suspense
      fallback={
        <WorkspaceChromeFallback activeNav="analytics">
          <AnalyticsFallback />
        </WorkspaceChromeFallback>
      }
    >
      <AnalyticsPageContent searchParams={searchParams} />
    </Suspense>
  );
}

async function AnalyticsPageContent({
  searchParams,
}: {
  searchParams: Promise<{ project?: string }>;
}) {
  const { project: projectParam } = await searchParams;
  const session = await getSession();
  const returnPath = projectParam
    ? `/analytics?project=${encodeURIComponent(projectParam)}`
    : "/analytics";
  if (!session) redirect(loginStartHref(returnPath));

  const { activeOrg, memberships } = await resolveActiveOrg(session.user.id);
  const [threads, projects, availableSources, stats, hasLlmKey, chatMessages] =
    await Promise.all([
      listOwnedAgentThreads(session.user.id),
      listVisibleProjects({
        orgId: activeOrg.id,
        viewerUserId: session.user.id,
      }),
      listMyAvailableProviderProjects(activeOrg.id, session.user.id),
      loadOrgActivityStats(activeOrg.id, session.user),
      hasAnyOrgLlmCredential(activeOrg.id),
      listStatsChatMessages(activeOrg.id, session.user.id),
    ]);
  const ownerNames = await resolveThreadOwnerNames(threads, session);

  return (
    <WorkspaceShell
      user={session.user}
      orgs={toOrgSwitcherItems(memberships)}
      activeOrgId={activeOrg.id}
      threads={threads}
      projects={projects}
      sourceProjects={availableSources.map(toSourceProjectOption)}
      ownerNames={ownerNames}
      analyticsActive
    >
      <div className="min-h-0 flex-1 overflow-y-auto">
        <AnalyticsChrome>
          <div className="mt-8 rounded-xl border border-border bg-surface p-5 sm:p-6">
            {stats.slices.length === 0 ? (
              <p className="text-sm text-muted">
                No captured transcripts yet. Once agents sync, turns, prompts,
                and estimated tokens show up here.
              </p>
            ) : (
              <ContributionGraph
                slices={stats.slices}
                people={stats.people}
                agents={stats.agents}
                projects={stats.projects}
                planTurns={stats.planTurns}
                threadProjects={stats.threadProjects}
                initialPenoptaProjectId={projectParam}
              />
            )}
          </div>
          <StatsChat
            initialMessages={chatMessages}
            hasLlmKey={hasLlmKey}
            currentUserId={session.user.id}
          />
        </AnalyticsChrome>
      </div>
    </WorkspaceShell>
  );
}
