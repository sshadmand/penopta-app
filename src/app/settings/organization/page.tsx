import { Suspense } from "react";
import { redirect } from "next/navigation";

import { OrgSettingsPanel } from "@/components/OrgSettingsPanel";
import { SettingsBodyFallback } from "@/components/RouteFallback";
import { getSession } from "@/lib/auth/server";
import { loginStartHref } from "@/lib/auth/urls";
import { listOrgMembersAction } from "@/lib/orgs/actions";
import { resolveActiveOrg } from "@/lib/orgs/data";

export default function OrganizationSettingsPage() {
  return (
    <main className="mx-auto max-w-3xl px-8 py-10 sm:px-12">
      <h1 className="text-2xl font-semibold tracking-tight">Organization</h1>
      <Suspense fallback={<SettingsBodyFallback />}>
        <OrganizationSettingsBody />
      </Suspense>
    </main>
  );
}

async function OrganizationSettingsBody() {
  const session = await getSession();
  if (!session) redirect(loginStartHref("/settings/organization"));

  const { activeOrg } = await resolveActiveOrg(session.user.id);
  const result = await listOrgMembersAction(activeOrg.id);

  return (
    <>
      <p className="mt-1 truncate text-sm text-muted" title={activeOrg.name}>
        {activeOrg.name}
      </p>
      <div className="mt-8">
        {!result.ok ? (
          <p className="text-sm text-muted">{result.error}</p>
        ) : (
          <OrgSettingsPanel
            key={activeOrg.id}
            orgId={activeOrg.id}
            orgName={activeOrg.name}
            members={result.members}
            canManage={result.canManage}
          />
        )}
      </div>
    </>
  );
}
