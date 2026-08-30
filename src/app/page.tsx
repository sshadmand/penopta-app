import Link from "next/link";
import { Suspense } from "react";

import { ContributionGraph } from "@/components/ContributionGraph";
import {
  HomePageFallback,
  HomeRecentThreads,
  HomeSummaryPreviews,
} from "@/components/HomeFeed";
import { WorkspaceChromeFallback } from "@/components/RouteFallback";
import { SignInCard } from "@/components/SignInCard";
import { WelcomeOnboardingModal } from "@/components/WelcomeOnboardingModal";
import { WorkspaceShell } from "@/components/WorkspaceShell";
import { hasAnyOrgLlmCredential } from "@/lib/ai/credentials";
import { getSession } from "@/lib/auth/server";
import { listMyAvailableProviderProjects } from "@/lib/integrations/provider-projects-data";
import { toSourceProjectOption } from "@/lib/integrations/provider-projects-view";
import { isWelcomeOnboardingEnabled } from "@/lib/onboarding/flag";
import { resolveActiveOrg } from "@/lib/orgs/data";
import { toOrgSwitcherItems } from "@/lib/orgs/view";
import { listVisibleDailySummaries } from "@/lib/projects/chat-data";
import { listVisibleProjects } from "@/lib/projects/data";
import { loadOrgActivityStats } from "@/lib/stats/data";
import { listOwnedAgentThreads } from "@/lib/threads/data";
import { resolveThreadOwnerNames } from "@/lib/threads/owners";

const ERROR_MESSAGES: Record<string, string> = {
  access_denied: "Sign-in was cancelled. Please try again.",
  unable_to_create_user: "Couldn't create your account. Please try again.",
  unable_to_link_account:
    "Couldn't link that sign-in method. Please try again.",
  email_does_not_match:
    "That email doesn't match this account. Try another sign-in method.",
};

export default function HomePage({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    returnTo?: string;
    macos_sign_in?: string;
  }>;
}) {
  return (
    <Suspense
      fallback={
        <WorkspaceChromeFallback activeNav="home">
          <HomePageFallback />
        </WorkspaceChromeFallback>
      }
    >
      <HomePageContent searchParams={searchParams} />
    </Suspense>
  );
}

async function HomePageContent({
  searchParams,
}: {
  searchParams: Promise<{
    error?: string;
    returnTo?: string;
    macos_sign_in?: string;
  }>;
}) {
  const session = await getSession();
  const { error, returnTo, macos_sign_in: forceMacSignIn } = await searchParams;

  if (!session || forceMacSignIn === "1") {
    const errorMessage = error
      ? (ERROR_MESSAGES[error] ?? "Sign-in failed. Please try again.")
      : null;
    const safeReturnTo =
      returnTo && returnTo.startsWith("/") && !returnTo.startsWith("//")
        ? returnTo
        : undefined;

    return <SignInCard returnTo={safeReturnTo} errorMessage={errorMessage} />;
  }

  const { activeOrg, memberships } = await resolveActiveOrg(session.user.id);

  const [threads, projects, availableSources, summaries, stats, hasLlmKey] =
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
      loadOrgActivityStats(activeOrg.id, session.user),
      hasAnyOrgLlmCredential(activeOrg.id),
    ]);
  const ownerNames = await resolveThreadOwnerNames(threads, session);
  const hasConnectedAgents = threads.length > 0 || availableSources.length > 0;
  const hasWorkgroups = projects.length > 0;

  return (
    <WorkspaceShell
      user={session.user}
      orgs={toOrgSwitcherItems(memberships)}
      activeOrgId={activeOrg.id}
      threads={threads}
      projects={projects}
      sourceProjects={availableSources.map(toSourceProjectOption)}
      ownerNames={ownerNames}
      homeActive
    >
      {isWelcomeOnboardingEnabled() ? <WelcomeOnboardingModal /> : null}
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-4xl px-8 py-10 sm:px-12">
          <div className="mb-8">
            <h1 className="text-2xl font-semibold tracking-tight">
              Welcome to Penopta
            </h1>
            <p className="mt-1 text-sm text-muted">
              View your agent activity and insights.
            </p>
          </div>
          <Link
            href="/analytics"
            aria-label="View analytics"
            className="block rounded-xl border border-border bg-surface p-5 transition hover:bg-foreground/5 sm:p-6"
          >
            {stats.slices.length === 0 ? (
              <p className="text-sm text-muted">
                No captured transcripts yet. Once agents sync, activity shows up
                here.
              </p>
            ) : (
              <ContributionGraph
                slices={stats.slices}
                people={[]}
                agents={[]}
                projects={[]}
                variant="heatmap"
              />
            )}
          </Link>

          <div className="mt-10">
            <HomeSummaryPreviews
              summaries={summaries}
              hasLlmKey={hasLlmKey}
              hasConnectedAgents={hasConnectedAgents}
              hasWorkgroups={hasWorkgroups}
            />
          </div>

          <div className="mt-10">
            <HomeRecentThreads
              threads={threads}
              hasConnectedAgents={hasConnectedAgents}
              hasWorkgroups={hasWorkgroups}
            />
          </div>
        </div>
      </main>
    </WorkspaceShell>
  );
}
