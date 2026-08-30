import { Suspense } from "react";
import { redirect } from "next/navigation";

import { AccountSettingsPanel } from "@/components/AccountSettingsPanel";
import { SettingsBodyFallback } from "@/components/RouteFallback";
import { getAccountSettingsAction } from "@/lib/auth/account-actions";
import { getSession } from "@/lib/auth/server";
import { loginStartHref } from "@/lib/auth/urls";

export default function AccountSettingsPage() {
  return (
    <main className="mx-auto max-w-3xl px-8 py-10 sm:px-12">
      <h1 className="text-2xl font-semibold tracking-tight">Account</h1>
      <p className="mt-1 text-sm text-muted">
        Your profile, appearance, and sign-in methods
      </p>
      <Suspense fallback={<SettingsBodyFallback />}>
        <AccountSettingsBody />
      </Suspense>
    </main>
  );
}

async function AccountSettingsBody() {
  const session = await getSession();
  if (!session) redirect(loginStartHref("/settings"));

  const result = await getAccountSettingsAction();
  if (!result.ok) {
    return <p className="mt-8 text-sm text-muted">{result.error}</p>;
  }

  return (
    <div className="mt-8">
      <AccountSettingsPanel account={result.account} />
    </div>
  );
}
