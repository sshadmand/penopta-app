"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import { ThemeToggle } from "@/components/ThemeToggle";
import type { AccountSettingsView } from "@/lib/auth/account-actions";
import { authClient } from "@/lib/auth/client";

function deviceLabelFromUserAgent(): string {
  if (typeof navigator === "undefined") return "device";
  const ua = navigator.userAgent;
  if (/iPhone/i.test(ua)) return "iPhone";
  if (/iPad/i.test(ua)) return "iPad";
  if (/Mac/i.test(ua)) return "Mac";
  if (/Android/i.test(ua)) return "Android";
  if (/Windows/i.test(ua)) return "Windows PC";
  return "device";
}

function firstNameFromDisplayName(
  name: string | null | undefined,
): string | null {
  const first = name?.trim().split(/\s+/)[0];
  return first || null;
}

/** e.g. "Sean's Mac" when a first name is available. */
function defaultPasskeyName(displayName?: string | null): string {
  const device = deviceLabelFromUserAgent();
  const first = firstNameFromDisplayName(displayName);
  if (!first) return device === "device" ? "This device" : device;
  const possessive =
    first.endsWith("s") || first.endsWith("S") ? `${first}'` : `${first}'s`;
  return `${possessive} ${device}`;
}

function IdRow({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      toast.success("Copied");
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Couldn't copy — select and copy manually");
    }
  }

  return (
    <div>
      <p className="text-xs font-semibold tracking-wider text-muted uppercase">
        {label}
      </p>
      <div className="mt-1 flex items-center gap-3">
        <p
          className="min-w-0 truncate font-mono text-sm text-foreground"
          title={value}
        >
          {value}
        </p>
        <button
          type="button"
          onClick={copy}
          className="shrink-0 text-xs font-medium text-muted transition hover:text-foreground"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
    </div>
  );
}

/** Profile details, sign-in providers, and passkey management. */
export function AccountSettingsPanel({
  account,
}: {
  account: AccountSettingsView;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  function addPasskey() {
    const name = defaultPasskeyName(account.name);
    startTransition(async () => {
      const { error } = await authClient.passkey.addPasskey({ name });
      if (error) {
        toast.error(error.message || "Couldn't add a passkey.");
        return;
      }
      toast.success("Passkey added. You can use it next time you sign in.");
      router.refresh();
    });
  }

  function removePasskey(id: string, label: string) {
    const confirmed = window.confirm(
      `Remove passkey “${label}”? You won’t be able to sign in with it anymore.`,
    );
    if (!confirmed) return;

    startTransition(async () => {
      const { error } = await authClient.passkey.deletePasskey({ id });
      if (error) {
        toast.error(error.message || "Couldn't remove that passkey.");
        return;
      }
      toast.success("Passkey removed.");
      if (editingId === id) {
        setEditingId(null);
        setEditingName("");
      }
      router.refresh();
    });
  }

  function startRename(id: string, label: string) {
    setEditingId(id);
    setEditingName(label === "Passkey" ? "" : label);
  }

  function cancelRename() {
    setEditingId(null);
    setEditingName("");
  }

  function saveRename(e: React.FormEvent) {
    e.preventDefault();
    if (!editingId) return;
    const name = editingName.trim();
    if (!name) {
      toast.error("Give this passkey a name.");
      return;
    }
    if (name.length > 64) {
      toast.error("Keep the name under 64 characters.");
      return;
    }

    const id = editingId;
    startTransition(async () => {
      const { error } = await authClient.passkey.updatePasskey({ id, name });
      if (error) {
        toast.error(error.message || "Couldn't rename that passkey.");
        return;
      }
      toast.success("Passkey renamed.");
      setEditingId(null);
      setEditingName("");
      router.refresh();
    });
  }

  const providerLabel =
    account.providers.map((p) => p.label).join(", ") || "None";

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs font-semibold tracking-wider text-muted uppercase">
          Appearance
        </p>
        <div className="mt-2">
          <ThemeToggle />
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold tracking-wider text-muted uppercase">
          Name
        </p>
        <p className="mt-1 text-sm text-foreground">{account.name}</p>
      </div>

      <div>
        <p className="text-xs font-semibold tracking-wider text-muted uppercase">
          Email
        </p>
        <p
          className="mt-1 truncate text-sm text-foreground"
          title={account.email}
        >
          {account.email}
        </p>
      </div>

      <div>
        <p className="text-xs font-semibold tracking-wider text-muted uppercase">
          Sign-in provider
        </p>
        <p className="mt-1 text-sm text-foreground">{providerLabel}</p>
      </div>

      <IdRow label="Account ID" value={account.id} />
      <IdRow label="Organization ID" value={account.orgId} />

      <section>
        <p className="text-xs font-semibold tracking-wider text-muted uppercase">
          Passkeys
        </p>
        {account.passkeys.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            No passkeys yet. Add one to sign in without Google or GitHub next
            time.
          </p>
        ) : (
          <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
            {account.passkeys.map((item) => {
              const label = item.name?.trim() || "Passkey";
              const isEditing = editingId === item.id;
              return (
                <li key={item.id} className="px-3 py-2">
                  {isEditing ? (
                    <form
                      onSubmit={saveRename}
                      className="flex flex-col gap-2 sm:flex-row sm:items-center"
                    >
                      <input
                        autoFocus
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        maxLength={64}
                        aria-label="Passkey name"
                        className="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 text-sm text-foreground outline-none transition focus:border-accent"
                      />
                      <div className="flex shrink-0 gap-2">
                        <button
                          type="submit"
                          disabled={pending || !editingName.trim()}
                          className="text-xs font-medium text-foreground transition hover:opacity-80 disabled:opacity-60"
                        >
                          Save
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={cancelRename}
                          className="text-xs font-medium text-muted transition hover:text-foreground disabled:opacity-60"
                        >
                          Cancel
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate text-sm text-foreground">
                        {label}
                      </span>
                      <div className="flex shrink-0 gap-3">
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => startRename(item.id, label)}
                          className="text-xs font-medium text-muted transition hover:text-foreground disabled:opacity-60"
                        >
                          Rename
                        </button>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => removePasskey(item.id, label)}
                          className="text-xs font-medium text-muted transition hover:text-danger disabled:opacity-60"
                        >
                          Remove
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <button
          type="button"
          disabled={pending}
          onClick={addPasskey}
          className="mt-3 inline-flex h-10 items-center rounded-lg border border-border bg-background px-3 text-sm font-medium text-foreground transition hover:bg-surface disabled:opacity-60"
        >
          {pending ? "Working…" : "Add new Passkey"}
        </button>
      </section>
    </div>
  );
}
