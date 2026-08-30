"use client";

import { formatDistanceToNow } from "date-fns";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { CopyField } from "@/components/CopyField";
import {
  refreshHostTokenAction,
  revokeHostTokenAction,
} from "@/lib/host-sync/actions";

export type LinuxHostDevice = {
  id: string;
  hostname: string;
  label: string | null;
  keyPrefix: string;
  expiresAt: string;
  lastUsedAt: string | null;
  expiresSoon: boolean;
};

export function LinuxHostDeviceList({ devices }: { devices: LinuxHostDevice[] }) {
  if (devices.length === 0) {
    return (
      <p className="mt-4 rounded-md border border-dashed border-border bg-sidebar px-4 py-5 text-sm text-muted">
        No Linux hosts yet. Run the install one-liner, then{" "}
        <span className="font-medium text-foreground">penopta-sync login</span>.
      </p>
    );
  }

  return (
    <ul className="mt-4 divide-y divide-border rounded-md border border-border">
      {devices.map((device) => (
        <LinuxHostDeviceRow key={device.id} device={device} />
      ))}
    </ul>
  );
}

function LinuxHostDeviceRow({ device }: { device: LinuxHostDevice }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [claimCommand, setClaimCommand] = useState<string | null>(null);
  const [confirmRevoke, setConfirmRevoke] = useState(false);

  const expiresAt = new Date(device.expiresAt);
  const lastUsed = device.lastUsedAt ? new Date(device.lastUsedAt) : null;

  function refresh() {
    startTransition(async () => {
      const result = await refreshHostTokenAction(device.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setClaimCommand(result.command ?? null);
      toast.success("Run the command on that machine");
      router.refresh();
    });
  }

  function revoke() {
    startTransition(async () => {
      const result = await revokeHostTokenAction(device.id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(`Revoked ${device.hostname}`);
      setConfirmRevoke(false);
      router.refresh();
    });
  }

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-foreground">
            {device.label || device.hostname}
          </p>
          <p className="mt-0.5 text-xs text-muted">
            {device.hostname} · {device.keyPrefix} · expires{" "}
            {formatDistanceToNow(expiresAt, { addSuffix: true })}
            {lastUsed
              ? ` · last sync ${formatDistanceToNow(lastUsed, { addSuffix: true })}`
              : " · never synced"}
          </p>
          {device.expiresSoon ? (
            <p className="mt-1 text-xs font-medium text-amber-700">
              Refresh within 30 days or hourly sync will stop.
            </p>
          ) : null}
        </div>
        <div className="flex shrink-0 gap-2">
          <button
            type="button"
            onClick={refresh}
            disabled={pending}
            className="inline-flex h-9 items-center rounded-lg border border-border bg-surface px-3 text-sm font-medium text-foreground transition hover:bg-background disabled:opacity-60"
          >
            Refresh
          </button>
          <button
            type="button"
            onClick={() => setConfirmRevoke(true)}
            disabled={pending}
            className="inline-flex h-9 items-center rounded-lg border border-border bg-surface px-3 text-sm font-medium text-danger transition hover:bg-danger/10 disabled:opacity-60"
          >
            Revoke
          </button>
        </div>
      </div>
      {claimCommand ? (
        <div className="mt-3">
          <CopyField
            label="Run on that machine"
            value={claimCommand}
            hint="The code is not the token. It expires in 10 minutes."
          />
        </div>
      ) : null}
      {confirmRevoke ? (
        <div
          className="fixed inset-0 z-20 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Revoke Linux host"
          onClick={() => !pending && setConfirmRevoke(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-border bg-surface p-6 shadow-xl"
          >
            <h2 className="text-lg font-semibold tracking-tight">
              Revoke {device.hostname}?
            </h2>
            <p className="mt-1 text-sm text-muted">
              Hourly sync on that box will 401 until you log in again.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmRevoke(false)}
                disabled={pending}
                className="inline-flex h-10 items-center justify-center rounded-lg border border-border bg-surface px-4 text-sm font-medium text-foreground transition hover:bg-background disabled:opacity-60"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={revoke}
                disabled={pending}
                className="inline-flex h-10 items-center justify-center rounded-lg bg-danger px-4 text-sm font-semibold text-danger-foreground transition hover:opacity-90 disabled:opacity-60"
              >
                {pending ? "Revoking…" : "Revoke"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </li>
  );
}
