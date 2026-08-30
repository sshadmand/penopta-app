import { formatDistanceToNow } from "date-fns";
import { CheckCircle2, ChevronDown } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { CopyField } from "@/components/CopyField";
import Linux from "@/components/icons/Linux";
import { LinuxHostDeviceList } from "@/components/LinuxHostDeviceList";
import { getSession } from "@/lib/auth/server";
import { loginStartHref } from "@/lib/auth/urls";
import {
  getLinuxSyncInstallStatus,
  linuxInstallCommand,
  linuxIntegration,
} from "@/lib/host-sync/linux";
import { hostTokenExpiresSoon, listHostTokens } from "@/lib/host-sync/tokens";
import { INTEGRATIONS_PATH, integrationPath } from "@/lib/integrations/paths";
import { getPublicAppUrl } from "@/lib/integrations/providers";
import { resolveActiveOrg } from "@/lib/orgs/data";

function renderStepText(step: string) {
  return step.split(/(\*\*[^*]+\*\*)/g).map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={i} className="font-semibold">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return part;
  });
}

export default async function LinuxIntegrationPage() {
  const session = await getSession();
  if (!session) {
    redirect(loginStartHref(integrationPath("linux")));
  }

  const { activeOrg } = await resolveActiveOrg(session.user.id);
  const [status, tokens] = await Promise.all([
    getLinuxSyncInstallStatus(activeOrg.id),
    listHostTokens(session.user.id, activeOrg.id),
  ]);
  const installCommand = linuxInstallCommand();
  const appUrl = getPublicAppUrl();

  const devices = tokens.map((row) => ({
    id: row.id,
    hostname: row.hostname,
    label: row.label,
    keyPrefix: row.keyPrefix,
    expiresAt: row.expiresAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    expiresSoon: hostTokenExpiresSoon(row),
  }));

  const installInstructions = (
    <>
      <div>
        <h2 className="text-sm font-semibold tracking-wide text-foreground uppercase">
          Why Linux host sync
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {linuxIntegration.description}
        </p>
      </div>

      <div>
        <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">
          Steps
        </h3>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-foreground">
          {linuxIntegration.steps.map((step) => (
            <li key={step}>{renderStepText(step)}</li>
          ))}
        </ol>
      </div>

      <CopyField
        label="Install on the Linux box"
        value={installCommand}
        hint={`Puts penopta-sync in ~/.local/bin. Then run penopta-sync login and open the URL (this workspace is ${appUrl}).`}
      />
    </>
  );

  return (
    <main className="mx-auto max-w-2xl px-8 py-10 sm:px-12">
      <Link
        href={`${INTEGRATIONS_PATH}?section=applications`}
        className="text-sm font-medium text-muted transition hover:text-foreground"
      >
        ← Applications
      </Link>

      <div className="mt-6 flex items-center gap-3">
        <span
          aria-hidden
          className={`grid h-10 w-10 place-items-center rounded-full text-white ${linuxIntegration.iconBg}`}
        >
          <Linux className="size-5" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {linuxIntegration.setupTitle}
          </h1>
          <p className="text-sm text-muted">{linuxIntegration.byline}</p>
        </div>
      </div>

      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted">
        {linuxIntegration.intro}
      </p>

      {status.installed ? (
        <section className="mt-8 max-w-2xl">
          <details className="group rounded-md bg-success-bg px-3 py-2 text-success">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm [&::-webkit-details-marker]:hidden">
              <CheckCircle2 className="size-4 shrink-0" aria-hidden />
              <span>
                Installed
                {status.lastSyncedAt
                  ? ` — last sync${status.lastAgentName ? ` (${status.lastAgentName})` : ""} ${formatDistanceToNow(status.lastSyncedAt, { addSuffix: true })}`
                  : " — host token issued, waiting for first sync"}
                .
              </span>
              <ChevronDown
                aria-hidden
                className="ml-auto size-4 shrink-0 transition group-open:rotate-180"
              />
              <span className="sr-only">Show install instructions</span>
            </summary>
            <div className="mt-3 space-y-4 border-t border-success/30 pt-3 text-foreground">
              {installInstructions}
            </div>
          </details>
        </section>
      ) : (
        <section className="mt-8 max-w-2xl space-y-4">
          {installInstructions}
        </section>
      )}

      <section className="mt-8 max-w-2xl">
        <h2 className="text-sm font-semibold tracking-wide text-foreground uppercase">
          Linux hosts
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Refresh mints a 10-minute code. Run the command on that box — the new
          token lands automatically. Revoke anytime.
        </p>
        <LinuxHostDeviceList devices={devices} />
      </section>

      {linuxIntegration.notes.length ? (
        <section className="mt-8 max-w-2xl">
          <ul className="space-y-1 text-xs text-muted">
            {linuxIntegration.notes.map((note) => (
              <li key={note}>• {note}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
