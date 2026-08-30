import { redirect } from "next/navigation";

import { BrandIcon } from "@/components/Brand";
import { getSession } from "@/lib/auth/server";
import { loginStartHref } from "@/lib/auth/urls";
import { getDeviceLoginByUserCode } from "@/lib/host-sync/device";
import { resolveActiveOrg } from "@/lib/orgs/data";

import { AllowLinuxHostForm } from "./AllowLinuxHostForm";

function Card({
  title,
  detail,
  children,
}: {
  title: string;
  detail: string;
  children?: React.ReactNode;
}) {
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-6">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-8">
        <BrandIcon className="mx-auto" />
        <h1 className="mt-4 text-center text-lg font-semibold text-foreground">
          {title}
        </h1>
        <p className="mt-2 text-center text-sm text-muted">{detail}</p>
        {children}
      </div>
    </main>
  );
}

export default async function LinuxSyncDevicePage({
  searchParams,
}: {
  searchParams: Promise<{ code?: string }>;
}) {
  const { code } = await searchParams;
  const returnTo = code
    ? `/device/linux-sync?code=${encodeURIComponent(code)}`
    : "/device/linux-sync";

  const session = await getSession();
  if (!session) {
    redirect(loginStartHref(returnTo));
  }

  if (!code?.trim()) {
    return (
      <Card
        title="Missing code"
        detail="Open the URL printed by penopta-sync login on your Linux box."
      />
    );
  }

  const login = await getDeviceLoginByUserCode(code);
  if (!login || login.kind !== "device") {
    return (
      <Card
        title="Unknown code"
        detail="That code is invalid or has expired. Run penopta-sync login again on the box."
      />
    );
  }

  if (login.expiresAt <= new Date()) {
    return (
      <Card
        title="Code expired"
        detail="Codes last 10 minutes. Run penopta-sync login again on the Linux box."
      />
    );
  }

  if (login.status === "consumed") {
    return (
      <Card
        title="Already used"
        detail="This machine is already confirmed. You can close this tab."
      />
    );
  }

  const { activeOrg } = await resolveActiveOrg(session.user.id);
  const hostname = login.hostname?.trim() || "linux";

  if (login.status === "approved") {
    return (
      <Card
        title="Linux host allowed"
        detail={`${hostname} can finish login now. Leave this tab open until the CLI says it’s done.`}
      />
    );
  }

  return (
    <Card
      title="Allow this Linux host"
      detail={`Signed in as ${session.user.email}. Confirm ${hostname} for ${activeOrg.name}.`}
    >
      <div className="mt-6 rounded-xl border border-border bg-background p-4">
        <p className="text-sm font-medium text-foreground">{hostname}</p>
        <p className="mt-1 text-xs text-muted">
          Code {login.userCode}. This mints a 90-day host token for your
          active org. It can only upload agent sessions — not MCP.
        </p>
      </div>
      <AllowLinuxHostForm userCode={login.userCode} hostname={hostname} />
    </Card>
  );
}
