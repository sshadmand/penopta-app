import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";

import Apple from "@/components/icons/Apple";
import Linux from "@/components/icons/Linux";
import { IntegrationsGridFallback } from "@/components/RouteFallback";
import { getSession } from "@/lib/auth/server";
import { loginStartHref } from "@/lib/auth/urls";
import {
  getLinuxSyncInstallStatus,
  linuxIntegration,
} from "@/lib/host-sync/linux";
import {
  getPenoptaSyncInstallStatus,
  macosIntegration,
} from "@/lib/integrations/macos";
import { INTEGRATIONS_PATH, integrationPath } from "@/lib/integrations/paths";
import { listIntegrationProviders } from "@/lib/integrations/providers";
import { listSyncSkillSightings } from "@/lib/integrations/skill-sightings";
import { resolveActiveOrg } from "@/lib/orgs/data";
import { listSyncedAgentNames } from "@/lib/threads/data";

type IntegrationSectionId = "agents" | "applications";

function resolveIntegrationSection(
  value: string | string[] | undefined,
): IntegrationSectionId {
  return value === "applications" ? "applications" : "agents";
}

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams: Promise<{ section?: string | string[] }>;
}) {
  const section = resolveIntegrationSection((await searchParams).section);
  const title = section === "agents" ? "Agents/IDEs" : "Applications";
  const description =
    section === "agents"
      ? "Connect and manage the agents and IDEs in your workspace."
      : "Install and manage Penopta applications for your devices.";

  return (
    <main className="mx-auto max-w-3xl px-8 py-10 sm:px-12">
      <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
      <p className="mt-1 text-sm text-muted">{description}</p>
      <Suspense fallback={<IntegrationsGridFallback />}>
        <IntegrationsGrid section={section} />
      </Suspense>
    </main>
  );
}

async function IntegrationsGrid({
  section,
}: {
  section: IntegrationSectionId;
}) {
  const session = await getSession();
  if (!session) redirect(loginStartHref(INTEGRATIONS_PATH));

  const providers = listIntegrationProviders();
  const { activeOrg } = await resolveActiveOrg(session.user.id);
  const [syncedAgents, macStatus, linuxStatus, skillSightings] =
    await Promise.all([
      listSyncedAgentNames(activeOrg.id),
      getPenoptaSyncInstallStatus(activeOrg.id),
      getLinuxSyncInstallStatus(activeOrg.id),
      listSyncSkillSightings(activeOrg.id),
    ]);
  const connectedIds = new Set(
    syncedAgents.map((name) => {
      const n = name.trim().toLowerCase();
      if (n === "claude-code" || n === "anthropic") return "claude";
      if (n === "openai" || n === "codex") return "chatgpt";
      return n;
    }),
  );
  const staleSkillByProvider = new Set(
    skillSightings.filter((s) => s.skill.stale).map((s) => s.provider),
  );

  const providerCards = providers.map((provider) => {
    const Icon = provider.icon;
    const connected = connectedIds.has(provider.id);
    const skillStale = staleSkillByProvider.has(provider.id);
    return (
      <div
        key={provider.id}
        className="flex flex-col rounded-xl border border-border bg-surface p-5"
      >
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className={`grid h-9 w-9 place-items-center rounded-full text-white ${provider.iconBg}`}
          >
            <Icon className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-foreground">{provider.name}</p>
              {connected ? (
                <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-success">
                  Connected
                </span>
              ) : null}
              {skillStale ? (
                <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-amber-700">
                  Update skill
                </span>
              ) : null}
            </div>
            <p className="text-sm text-muted">{provider.byline}</p>
          </div>
        </div>
        <p className="mt-4 flex-1 text-sm leading-relaxed text-muted">
          {provider.description}
        </p>
        <Link
          href={integrationPath(provider.id)}
          className="mt-5 flex h-10 w-full items-center justify-center rounded-lg border border-border text-sm font-medium text-foreground transition hover:bg-background"
        >
          {connected ? "Manage" : "Connect"}
        </Link>
      </div>
    );
  });

  return (
    <div className="mt-8 max-w-3xl space-y-10">
      {section === "agents" ? (
        <IntegrationSection title="Agents/IDEs">
          {providerCards}
        </IntegrationSection>
      ) : null}

      {section === "applications" ? (
        <IntegrationSection title="Applications">
          <div className="flex flex-col rounded-xl border border-border bg-surface p-5">
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className={`grid h-9 w-9 place-items-center rounded-full text-white ${macosIntegration.iconBg}`}
              >
                <Apple className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-foreground">
                    {macosIntegration.name}
                  </p>
                  {macStatus.installed ? (
                    <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-success">
                      Installed
                    </span>
                  ) : null}
                </div>
                <p className="text-sm text-muted">{macosIntegration.byline}</p>
              </div>
            </div>
            <p className="mt-4 flex-1 text-sm leading-relaxed text-muted">
              {macosIntegration.description}
            </p>
            <Link
              href={integrationPath(macosIntegration.id)}
              className="mt-5 flex h-10 w-full items-center justify-center rounded-lg border border-border text-sm font-medium text-foreground transition hover:bg-background"
            >
              {macStatus.installed ? "Manage" : "Install"}
            </Link>
          </div>

          <div className="flex flex-col rounded-xl border border-border bg-surface p-5">
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className={`grid h-9 w-9 place-items-center rounded-full text-white ${linuxIntegration.iconBg}`}
              >
                <Linux className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="font-semibold text-foreground">
                    {linuxIntegration.name}
                  </p>
                  {linuxStatus.installed ? (
                    <span className="shrink-0 text-xs font-medium uppercase tracking-wide text-success">
                      Installed
                    </span>
                  ) : null}
                </div>
                <p className="text-sm text-muted">{linuxIntegration.byline}</p>
              </div>
            </div>
            <p className="mt-4 flex-1 text-sm leading-relaxed text-muted">
              {linuxIntegration.description}
            </p>
            <Link
              href={integrationPath(linuxIntegration.id)}
              className="mt-5 flex h-10 w-full items-center justify-center rounded-lg border border-border text-sm font-medium text-foreground transition hover:bg-background"
            >
              {linuxStatus.installed ? "Manage" : "Install"}
            </Link>
          </div>
        </IntegrationSection>
      ) : null}
    </div>
  );
}

function IntegrationSection({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <h2 className="text-xs font-semibold tracking-wider text-muted uppercase">
        {title}
      </h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">{children}</div>
    </section>
  );
}
