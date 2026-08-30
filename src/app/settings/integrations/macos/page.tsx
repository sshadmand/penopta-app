import { formatDistanceToNow } from "date-fns";
import { CheckCircle2, ChevronDown, Download } from "lucide-react";
import Link from "next/link";
import { redirect } from "next/navigation";

import { ChatHelpMenu } from "@/components/ChatHelpMenu";
import Apple from "@/components/icons/Apple";
import { getSession } from "@/lib/auth/server";
import { loginStartHref } from "@/lib/auth/urls";
import {
  chatgptMacosInstallHelpHref,
  claudeMacosInstallHelpHref,
  getPenoptaSyncDownloadUrl,
  getPenoptaSyncInstallStatus,
  getPenoptaSyncRelease,
  macosIntegration,
} from "@/lib/integrations/macos";
import { INTEGRATIONS_PATH, integrationPath } from "@/lib/integrations/paths";
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

export default async function MacosIntegrationPage() {
  const session = await getSession();
  if (!session) {
    redirect(loginStartHref(integrationPath("macos")));
  }

  const { activeOrg } = await resolveActiveOrg(session.user.id);
  const [status, release] = await Promise.all([
    getPenoptaSyncInstallStatus(activeOrg.id),
    getPenoptaSyncRelease(),
  ]);
  const downloadUrl = getPenoptaSyncDownloadUrl(release);
  const downloadLabel = release
    ? `Download MacOS App (v${release.version})`
    : "Download MacOS App";

  const installInstructions = (
    <>
      <div>
        <h2 className="text-sm font-semibold tracking-wide text-foreground uppercase">
          Why the macOS app
        </h2>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          {macosIntegration.description}
        </p>
      </div>

      <div>
        <h3 className="text-xs font-semibold tracking-wide text-muted uppercase">
          Steps
        </h3>
        <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-foreground">
          {macosIntegration.steps.map((step) => (
            <li key={step}>{renderStepText(step)}</li>
          ))}
        </ol>
      </div>

      <a
        href={downloadUrl}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-foreground px-4 text-sm font-medium text-background transition hover:opacity-90"
      >
        <Download className="size-4" aria-hidden />
        {downloadLabel}
      </a>

      <ChatHelpMenu
        options={[
          {
            label: "Ask Claude",
            href: claudeMacosInstallHelpHref(),
            provider: "claude",
          },
          {
            label: "Ask ChatGPT",
            href: chatgptMacosInstallHelpHref(),
            provider: "chatgpt",
          },
        ]}
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
          className={`grid h-10 w-10 place-items-center rounded-full text-white ${macosIntegration.iconBg}`}
        >
          <Apple className="size-5" />
        </span>
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {macosIntegration.setupTitle}
          </h1>
          <p className="text-sm text-muted">{macosIntegration.byline}</p>
        </div>
      </div>

      <p className="mt-4 max-w-2xl text-sm leading-relaxed text-muted">
        {macosIntegration.intro}
      </p>

      {status.installed && status.lastSyncedAt ? (
        <section className="mt-8 max-w-2xl">
          <details className="group rounded-md bg-success-bg px-3 py-2 text-success">
            <summary className="flex cursor-pointer list-none items-center gap-2 text-sm [&::-webkit-details-marker]:hidden">
              <CheckCircle2 className="size-4 shrink-0" aria-hidden />
              <span>
                Installed — last sync
                {status.lastAgentName ? ` (${status.lastAgentName})` : ""}{" "}
                {formatDistanceToNow(status.lastSyncedAt, {
                  addSuffix: true,
                })}
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

      {macosIntegration.notes.length ? (
        <section className="mt-8 max-w-2xl">
          <ul className="space-y-1 text-xs text-muted">
            {macosIntegration.notes.map((note) => (
              <li key={note}>• {note}</li>
            ))}
          </ul>
        </section>
      ) : null}
    </main>
  );
}
