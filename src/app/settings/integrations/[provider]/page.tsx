import { formatDistanceToNow } from "date-fns";
import { AlertTriangle, CheckCircle2, ChevronDown, Lock } from "lucide-react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { AvailableProjectsPanel } from "@/components/AvailableProjectsPanel";
import { CopyField } from "@/components/CopyField";
import { CopyStepsButton } from "@/components/CopyStepsButton";
import { MacosProviderSyncCallout } from "@/components/MacosProviderSyncCallout";
import { McpDiagnosePanel } from "@/components/McpDiagnosePanel";
import { getSession } from "@/lib/auth/server";
import { loginStartHref } from "@/lib/auth/urls";
import { getMcpConnectionHealth } from "@/lib/integrations/diagnose";
import { getPenoptaSyncStatusForProvider } from "@/lib/integrations/macos";
import { INTEGRATIONS_PATH, integrationPath } from "@/lib/integrations/paths";
import { asProviderProjectProvider } from "@/lib/integrations/provider-projects";
import {
  ensureCatalogFromAgentThreads,
  listAvailableProviderProjects,
} from "@/lib/integrations/provider-projects-data";
import {
  CLAUDE_CHROME_EXTENSION_HREF,
  CLAUDE_SYNC_SKILL_NAME,
  claudeScheduleInstructions,
  claudeSkillInstructions,
  getIntegrationProvider,
  getPublicAppUrl,
  mcpConnectorUrl,
  syncRoutineInstructions,
  VERIFY_CHAT_COMMAND,
} from "@/lib/integrations/providers";
import {
  composeSyncSkill,
  isSyncSkillProvider,
} from "@/lib/integrations/skill";
import { getSyncSkillSighting } from "@/lib/integrations/skill-sightings";
import { SYNC_SKILL_VERSION } from "@/lib/integrations/skill-version";
import { getLatestMcpVerification } from "@/lib/oauth/tokens";
import { resolveActiveOrg } from "@/lib/orgs/data";

/** Render step copy with `**bold**`, `__underline__`, and `[label](url)`. */
function renderStepText(step: string) {
  return step
    .split(/(\*\*[^*]+\*\*|__[^_]+__|\[[^\]]+\]\([^)]+\))/g)
    .map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={i} className="font-semibold">
            {part.slice(2, -2)}
          </strong>
        );
      }
      if (part.startsWith("__") && part.endsWith("__")) {
        return (
          <span key={i} className="underline underline-offset-4">
            {part.slice(2, -2)}
          </span>
        );
      }
      const linkMatch = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
      if (linkMatch) {
        return (
          <a
            key={i}
            href={linkMatch[2]}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-foreground underline underline-offset-2 hover:text-foreground"
          >
            {linkMatch[1]}
          </a>
        );
      }
      return part;
    });
}

export default async function IntegrationSetupPage({
  params,
  searchParams,
}: {
  params: Promise<{ provider: string }>;
  searchParams: Promise<{ previewSync?: string }>;
}) {
  const { provider: providerId } = await params;
  const { previewSync: previewSyncParam } = await searchParams;
  const session = await getSession();
  if (!session) {
    redirect(loginStartHref(integrationPath(providerId)));
  }

  const provider = getIntegrationProvider(providerId);
  if (!provider) notFound();

  const { activeOrg } = await resolveActiveOrg(session.user.id);
  const catalogProvider = asProviderProjectProvider(provider.id);
  await ensureCatalogFromAgentThreads(
    session.user.id,
    activeOrg.id,
    catalogProvider,
  );
  const [availableProjects, macSync, skillSighting, mcpHealth] =
    await Promise.all([
      listAvailableProviderProjects(activeOrg.id, catalogProvider),
      getPenoptaSyncStatusForProvider(activeOrg.id, catalogProvider),
      getSyncSkillSighting(activeOrg.id, catalogProvider),
      getMcpConnectionHealth(session.user.id, activeOrg.id, {
        agentName: catalogProvider ?? undefined,
      }),
    ]);

  const ProviderIcon = provider.icon;
  const mcpVerification = await getLatestMcpVerification(session.user.id);
  const mcpVerified = Boolean(mcpVerification);
  /** Local/dev only: `?previewSync=1` unlocks sync setup without MCP verify. */
  const allowSyncPreview = process.env.NODE_ENV === "development";
  const previewSync =
    allowSyncPreview &&
    (previewSyncParam === "1" || previewSyncParam === "true");
  const syncUnlocked = mcpVerified || previewSync;
  const appUrl = getPublicAppUrl();
  const target =
    provider.id === "chatgpt"
      ? "ChatGPT scheduled task"
      : provider.id === "cursor"
        ? "Penopta Sync"
        : "Claude scheduled task";
  const skillBody = isSyncSkillProvider(provider.id)
    ? await composeSyncSkill(provider.id)
    : "";
  const instructions =
    provider.id === "claude" && skillBody
      ? claudeScheduleInstructions(SYNC_SKILL_VERSION)
      : skillBody
        ? syncRoutineInstructions(skillBody, SYNC_SKILL_VERSION)
        : "";
  const claudeSkillBody =
    provider.id === "claude" && skillBody
      ? claudeSkillInstructions(skillBody)
      : "";
  const mcpUrl = mcpConnectorUrl(appUrl);

  const hasAvailableProjects = availableProjects.length > 0;
  const skillNeedsUpdate = Boolean(skillSighting && skillSighting.skill.stale);
  const skillVersionLabel =
    skillSighting?.lastSkillVersion != null
      ? `v${skillSighting.lastSkillVersion}`
      : "an unknown version";

  /** Shown expanded before verification, and behind a disclosure after. */
  const mcpSetupInstructions = (
    <>
      <div>
        <h2 className="text-sm font-semibold tracking-wide text-foreground uppercase">
          Chat with Penopta in {provider.name} (MCP)
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Add Penopta as an MCP server in {provider.name}. It signs in with
          Penopta (OAuth) and can then pull your project and thread context on
          demand while you chat. No key to paste.
        </p>
      </div>
      <div>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">
            Steps
          </h3>
          <CopyStepsButton steps={provider.mcpSteps} />
        </div>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-foreground">
          {provider.mcpSteps.map((step) => (
            <li key={step}>{renderStepText(step)}</li>
          ))}
        </ol>
      </div>
      <CopyField
        label="MCP server URL"
        value={mcpUrl}
        hint="Paste this into the URL field, then save and approve the Penopta sign-in prompt."
      />
    </>
  );

  /** Shown expanded until projects exist, then behind a disclosure. */
  const syncSetupInstructions = (
    <>
      <div>
        <h2 className="text-sm font-semibold tracking-wide text-foreground uppercase">
          Sync your conversations to Penopta automatically
        </h2>
        <p className="mt-2 mb-3 max-w-2xl text-sm leading-relaxed text-muted">
          {provider.id === "claude"
            ? "Optional: install Claude in Chrome, save the sync as a Skill, then schedule an hourly task that runs that skill."
            : "Optional: also push a periodic snapshot of your conversations into Penopta on a schedule."}
        </p>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">
            Steps
          </h3>
          <CopyStepsButton steps={provider.steps} />
        </div>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-foreground">
          {provider.steps.map((step) => (
            <li key={step}>{renderStepText(step)}</li>
          ))}
        </ol>
        {provider.id === "claude" ? (
          <p className="mt-3 text-sm text-muted">
            Chrome extension:{" "}
            <a
              href={CLAUDE_CHROME_EXTENSION_HREF}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium text-muted no-underline decoration-muted transition hover:text-foreground"
            >
              Install Claude in Chrome
            </a>
          </p>
        ) : null}
      </div>
      {provider.id === "claude" ? (
        <>
          <CopyField
            label="Skill instructions"
            value={claudeSkillBody}
            multiline
            rows={1}
            hint={`Paste into Settings → Skills → Add → Write skill instructions (name it "${CLAUDE_SYNC_SKILL_NAME}").`}
          />
          <CopyField
            label="Scheduled task instructions"
            value={instructions}
            multiline
            rows={1}
            hint="Paste into the scheduled task Instructions field — references your skill; do not paste the full skill again."
          />
        </>
      ) : (
        <CopyField
          label="Copy & Paste these instructions"
          value={instructions}
          multiline
          rows={1}
          hint={`Paste into your ${target}. Delivery runs through the Penopta MCP connector — no key or token included.`}
        />
      )}
      {provider.troubleHelp ? (
        <p className="text-sm text-muted">
          {provider.troubleHelp.text}{" "}
          <a
            href={provider.troubleHelp.href}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-muted no-underline decoration-muted transition hover:text-foreground"
          >
            {provider.troubleHelp.linkLabel}
          </a>
        </p>
      ) : null}
    </>
  );

  const macosOnlySetup = (
    <>
      <div>
        <h2 className="text-sm font-semibold tracking-wide text-foreground uppercase">
          Sync Cursor chats with Penopta Sync
        </h2>
        <p className="mt-2 mb-3 max-w-2xl text-sm leading-relaxed text-muted">
          Cursor agent transcripts aren’t reachable over MCP yet. Use the macOS
          app to upload local sessions from{" "}
          <code className="rounded bg-sidebar px-1 py-0.5 text-xs">
            ~/.cursor
          </code>
          .
        </p>
        <div className="flex items-center justify-between gap-2">
          <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">
            Steps
          </h3>
          <CopyStepsButton steps={provider.steps} />
        </div>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-foreground">
          {provider.steps.map((step) => (
            <li key={step}>{renderStepText(step)}</li>
          ))}
        </ol>
      </div>
    </>
  );

  return (
    <main className="px-8 py-10 sm:px-12 mx-auto max-w-2xl">
      <Link
        href={INTEGRATIONS_PATH}
        className="text-sm font-medium text-muted transition hover:text-foreground"
      >
        ← Agents/IDEs
      </Link>

      <div className="mt-6 flex items-center gap-3">
        <span
          aria-hidden
          className={`grid h-10 w-10 place-items-center rounded-full text-white ${provider.iconBg}`}
        >
          <ProviderIcon className="size-5" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {provider.setupTitle}
          </h1>
          <p className="text-sm text-muted">{provider.byline}</p>
        </div>
      </div>

      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted">
        {provider.intro}
      </p>

      {provider.macosOnly ? (
        <>
          {macSync.installed ? (
            <section className="mt-8 max-w-2xl">
              <details className="group rounded-md bg-success-bg px-3 py-2 text-success">
                <summary className="flex cursor-pointer list-none items-center gap-2 text-sm [&::-webkit-details-marker]:hidden">
                  <CheckCircle2 className="size-4 shrink-0" aria-hidden />
                  <span>
                    Cursor sync is set up via the macOS app — expand for steps.
                  </span>
                  <ChevronDown
                    aria-hidden
                    className="ml-auto size-4 shrink-0 transition group-open:rotate-180"
                  />
                  <span className="sr-only">Show setup instructions</span>
                </summary>
                <div className="mt-3 space-y-4 border-t border-success/30 pt-3 text-foreground">
                  {macosOnlySetup}
                </div>
              </details>
            </section>
          ) : (
            <section className="mt-8 max-w-2xl space-y-4">
              {macosOnlySetup}
            </section>
          )}
          <MacosProviderSyncCallout syncing={macSync.installed} />
          {provider.notes?.length ? (
            <section className="mt-8 max-w-2xl">
              <ul className="space-y-1 text-xs text-muted">
                {provider.notes.map((note) => (
                  <li key={note}>• {note}</li>
                ))}
              </ul>
            </section>
          ) : null}
          <AvailableProjectsPanel
            providerId={provider.id}
            projects={availableProjects}
          />
        </>
      ) : (
        <>
          {skillNeedsUpdate && skillSighting ? (
            <section className="mt-6 max-w-2xl rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-amber-950">
              <div className="flex items-start gap-2">
                <AlertTriangle
                  className="mt-0.5 size-4 shrink-0 text-amber-700"
                  aria-hidden
                />
                <div className="min-w-0 text-sm leading-relaxed">
                  <p className="font-medium">
                    Scheduled sync skill is out of date
                  </p>
                  <p className="mt-1 text-amber-900/80">
                    Last sync reported {skillVersionLabel}; current is v
                    {SYNC_SKILL_VERSION}
                    {skillSighting.lastSeenAt
                      ? ` · seen ${formatDistanceToNow(skillSighting.lastSeenAt, { addSuffix: true })}`
                      : ""}
                    . Re-copy the Instructions below into your {target}, then
                    run it once.
                  </p>
                </div>
              </div>
            </section>
          ) : null}

          {mcpVerified && mcpVerification ? (
            <section className="mt-8 max-w-2xl">
              <details className="group rounded-md bg-success-bg px-3 py-2 text-success">
                <summary className="flex cursor-pointer list-none items-center gap-2 text-sm [&::-webkit-details-marker]:hidden">
                  <CheckCircle2 className="size-4 shrink-0" aria-hidden />
                  <span>
                    MCP connection verified
                    {mcpVerification.agent
                      ? ` via ${mcpVerification.agent}`
                      : ""}{" "}
                    {formatDistanceToNow(mcpVerification.verifiedAt, {
                      addSuffix: true,
                    })}
                    .
                  </span>
                  <ChevronDown
                    aria-hidden
                    className="ml-auto size-4 shrink-0 transition group-open:rotate-180"
                  />
                  <span className="sr-only">Show setup instructions</span>
                </summary>
                <div className="mt-3 space-y-4 border-t border-success/30 pt-3 text-foreground">
                  {mcpSetupInstructions}
                </div>
              </details>
              <McpDiagnosePanel
                providerName={provider.name}
                agentHint={provider.id}
                diagnoseHref={provider.diagnoseHref}
                health={mcpHealth}
              />
            </section>
          ) : (
            <section className="mt-8 max-w-2xl space-y-4">
              {mcpSetupInstructions}
            </section>
          )}

          {!mcpVerified ? (
            <section className="mt-8 max-w-2xl rounded-lg border border-dashed border-border bg-sidebar px-5 py-6">
              <div className="flex items-center gap-2">
                <Lock className="size-4 text-muted" aria-hidden />
                <h2 className="text-sm font-semibold tracking-wide text-foreground uppercase">
                  Verify the MCP connection
                </h2>
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">
                To sync context for your agents, we need to verify the MCP
                connection in {provider.name}. Once verified, the scheduled sync
                setup below unlocks.
              </p>
              <div className="mt-4">
                <CopyField
                  label={`Run this command in ${provider.name} chat`}
                  value={VERIFY_CHAT_COMMAND}
                  action={
                    provider.verifyHref
                      ? { label: "Run", href: provider.verifyHref }
                      : undefined
                  }
                  reloadAction={{ label: "Refresh" }}
                  hint={`Run opens ${provider.name} with the command prefilled. Reload this page once it confirms.`}
                />
              </div>
              {provider.mcpTroubleHelp ? (
                <p className="mt-4 text-sm text-muted">
                  {provider.mcpTroubleHelp.text}{" "}
                  <a
                    href={provider.mcpTroubleHelp.href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-muted no-underline decoration-muted transition hover:text-foreground"
                  >
                    {provider.mcpTroubleHelp.linkLabel}
                  </a>
                </p>
              ) : null}
              <McpDiagnosePanel
                providerName={provider.name}
                agentHint={provider.id}
                diagnoseHref={provider.diagnoseHref}
                health={mcpHealth}
              />
            </section>
          ) : null}

          {!syncUnlocked ? (
            <section className="mt-8 max-w-2xl">
              <div
                className="rounded-md bg-sidebar px-3 py-2 text-muted"
                aria-disabled="true"
              >
                <div className="flex items-center gap-2 text-sm">
                  <Lock className="size-4 shrink-0" aria-hidden />
                  <span className="min-w-0 flex-1">
                    Sync your conversations automatically — unlocks after MCP is
                    verified.
                  </span>
                  {allowSyncPreview ? (
                    <Link
                      href={`${integrationPath(provider.id)}?previewSync=1`}
                      className="shrink-0 text-xs font-medium text-muted underline-offset-2 hover:text-foreground hover:underline"
                    >
                      preview
                    </Link>
                  ) : (
                    <ChevronDown
                      aria-hidden
                      className="ml-auto size-4 shrink-0 opacity-40"
                    />
                  )}
                </div>
              </div>
            </section>
          ) : (
            <>
              {previewSync && !mcpVerified ? (
                <p className="mt-8 max-w-2xl text-xs text-amber-800">
                  Dev preview — sync setup unlocked without MCP verify.{" "}
                  <Link
                    href={integrationPath(provider.id)}
                    className="font-medium underline-offset-2 hover:underline"
                  >
                    Turn off
                  </Link>
                </p>
              ) : null}
              {hasAvailableProjects && skillNeedsUpdate ? (
                <section className="mt-8 max-w-2xl space-y-4">
                  {syncSetupInstructions}
                </section>
              ) : hasAvailableProjects ? (
                <section className="mt-8 max-w-2xl">
                  <details
                    className="group rounded-md bg-success-bg px-3 py-2 text-success"
                    open={previewSync && !mcpVerified ? true : undefined}
                  >
                    <summary className="flex cursor-pointer list-none items-center gap-2 text-sm [&::-webkit-details-marker]:hidden">
                      <CheckCircle2 className="size-4 shrink-0" aria-hidden />
                      <span>
                        Conversation sync is set up — expand to edit
                        instructions.
                      </span>
                      <ChevronDown
                        aria-hidden
                        className="ml-auto size-4 shrink-0 transition group-open:rotate-180"
                      />
                      <span className="sr-only">
                        Show sync setup instructions
                      </span>
                    </summary>
                    <div className="mt-3 space-y-4 border-t border-success/30 pt-3 text-foreground">
                      {syncSetupInstructions}
                    </div>
                  </details>
                </section>
              ) : (
                <section
                  className={
                    previewSync && !mcpVerified
                      ? "mt-3 max-w-2xl space-y-4"
                      : "mt-8 max-w-2xl space-y-4"
                  }
                >
                  {syncSetupInstructions}
                </section>
              )}
            </>
          )}

          {provider.notes?.length ? (
            <section className="mt-8 max-w-2xl">
              <ul className="space-y-1 text-xs text-muted">
                {provider.notes.map((note) => (
                  <li key={note}>• {note}</li>
                ))}
              </ul>
            </section>
          ) : null}
          <MacosProviderSyncCallout syncing={macSync.installed} />
          <AvailableProjectsPanel
            providerId={provider.id}
            projects={availableProjects}
          />
        </>
      )}
    </main>
  );
}
