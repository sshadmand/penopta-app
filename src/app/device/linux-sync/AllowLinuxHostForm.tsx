"use client";

import { useActionState } from "react";

import {
  approveLinuxHostAction,
  type HostSyncActionState,
} from "@/lib/host-sync/actions";

const initial: HostSyncActionState = { ok: false, error: "" };

export function AllowLinuxHostForm({
  userCode,
  hostname,
}: {
  userCode: string;
  hostname: string;
}) {
  const [state, formAction, pending] = useActionState(
    async (): Promise<HostSyncActionState> => approveLinuxHostAction(userCode),
    initial,
  );

  if (state.ok) {
    return (
      <p className="mt-6 text-center text-sm text-success">
        Allowed. The CLI on {hostname} should finish in a few seconds — you
        can close this tab.
      </p>
    );
  }

  return (
    <form action={formAction} className="mt-6">
      {"error" in state && state.error ? (
        <p className="mb-3 text-sm text-danger">{state.error}</p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="w-full rounded-lg bg-foreground px-4 py-2.5 text-sm font-medium text-background transition hover:opacity-90 disabled:opacity-60"
      >
        {pending ? "Allowing…" : `Allow ${hostname}`}
      </button>
    </form>
  );
}
