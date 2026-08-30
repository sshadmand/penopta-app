import { Suspense } from "react";
import { redirect } from "next/navigation";

import { AiKeysPanel } from "@/components/AiKeysPanel";
import { DailySummaryRoutineToggle } from "@/components/DailySummaryRoutineToggle";
import { WeeklyDigestRoutineToggle } from "@/components/WeeklyDigestRoutineToggle";
import { isEmailConfigured } from "@/lib/email/emailer";
import { SettingsBodyFallback } from "@/components/RouteFallback";
import { listOrgLlmCredentials } from "@/lib/ai/credentials";
import { getSession } from "@/lib/auth/server";
import { loginStartHref } from "@/lib/auth/urls";
import { integrationPath } from "@/lib/integrations/paths";
import { resolveActiveOrg } from "@/lib/orgs/data";

export default function AiIntegrationsPage() {
  return (
    <main className="mx-auto max-w-3xl px-8 py-10 sm:px-12">
      <h1 className="text-2xl font-semibold tracking-tight">LLM Keys</h1>
      <p className="mt-1 text-sm text-muted">
        Bring your own Claude, Gemini, or ChatGPT API key for this organization.
        Keys stay encrypted at rest and are only used server-side — for project
        chat, <span className="font-medium text-foreground">/summary</span>, and{" "}
        <span className="font-medium text-foreground">/continue</span>. Chat
        subscriptions (Plus/Pro) do not cover API keys. New keys are checked
        live before they are saved.
      </p>
      <Suspense fallback={<SettingsBodyFallback />}>
        <AiIntegrationsBody />
      </Suspense>
    </main>
  );
}

async function AiIntegrationsBody() {
  const session = await getSession();
  if (!session) redirect(loginStartHref(integrationPath("ai")));

  const { activeOrg, role } = await resolveActiveOrg(session.user.id);
  const credentials = await listOrgLlmCredentials(activeOrg.id);
  const hasValidatedKey = credentials.length > 0;

  return (
    <>
      <AiKeysPanel credentials={credentials} canManage={role === "owner"} />

      {hasValidatedKey ? (
        <div className="mt-10">
          <h2 className="text-xs font-semibold tracking-wider text-muted uppercase">
            Agent Routines
          </h2>
          <DailySummaryRoutineToggle
            enabled={activeOrg.dailySummaryEnabled}
            hasAiKey={hasValidatedKey}
            canManage={role === "owner"}
          />
          {!activeOrg.isPersonal ? (
            <WeeklyDigestRoutineToggle
              enabled={activeOrg.weeklyDigestEnabled}
              hasAiKey={hasValidatedKey}
              canManage={role === "owner"}
              emailConfigured={isEmailConfigured()}
            />
          ) : null}
        </div>
      ) : null}
    </>
  );
}
