"use client";

import { Check, ChevronsUpDown, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";

import { createOrgAction, switchOrgAction } from "@/lib/orgs/actions";

export interface OrgSwitcherItem {
  id: string;
  name: string;
  role: "owner" | "member";
  isPersonal: boolean;
}

/**
 * Footer control: shows the active org and, when clicked, opens an upward
 * popover with the signed-in email, org switcher, create, Account and
 * Settings, and sign out.
 */
export function OrgSwitcher({
  activeOrgId,
  orgs,
  userEmail,
}: {
  activeOrgId: string;
  orgs: OrgSwitcherItem[];
  userEmail: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);

  const active = orgs.find((o) => o.id === activeOrgId) ?? orgs[0];

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (!rootRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  function switchTo(orgId: string) {
    if (orgId === activeOrgId) {
      setOpen(false);
      return;
    }
    startTransition(async () => {
      const result = await switchOrgAction(orgId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setOpen(false);
      router.refresh();
    });
  }

  function submitCreate(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await createOrgAction(name);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Organization created");
      setName("");
      setCreating(false);
      setOpen(false);
      router.refresh();
    });
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        className="mt-2 flex w-full items-center justify-between gap-2 text-sm text-muted transition hover:text-foreground"
      >
        <span className="min-w-0 truncate text-left" title={active?.name}>
          {active?.name ?? "Organization"}
        </span>
        <ChevronsUpDown aria-hidden className="h-3.5 w-3.5 shrink-0" />
      </button>

      {open ? (
        <div
          role="menu"
          className="absolute bottom-full left-0 right-0 z-30 mb-2 rounded-lg border border-border bg-surface p-1 shadow-lg"
        >
          <p
            className="truncate px-2 py-1.5 text-xs text-muted"
            title={userEmail}
          >
            {userEmail}
          </p>
          <div className="my-1 h-px bg-border" />
          <ul className="max-h-60 overflow-y-auto">
            {orgs.map((org) => {
              const isActive = org.id === activeOrgId;
              return (
                <li key={org.id}>
                  <button
                    type="button"
                    onClick={() => switchTo(org.id)}
                    disabled={pending}
                    className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-sm transition hover:bg-background disabled:opacity-60"
                  >
                    <span
                      className="min-w-0 truncate text-foreground"
                      title={org.name}
                    >
                      {org.name}
                    </span>
                    {isActive ? (
                      <Check
                        aria-hidden
                        className="h-4 w-4 shrink-0 text-accent"
                      />
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>

          <div className="my-1 h-px bg-border" />

          {creating ? (
            <form onSubmit={submitCreate} className="p-1">
              <input
                autoFocus
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Organization name"
                className="h-9 w-full rounded-md border border-border bg-background px-2.5 text-sm text-foreground outline-none transition focus:border-accent"
              />
              <div className="mt-2 flex justify-end gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    setCreating(false);
                    setName("");
                  }}
                  disabled={pending}
                  className="inline-flex h-8 items-center rounded-md border border-border px-2.5 text-xs font-medium text-foreground transition hover:bg-background disabled:opacity-60"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={pending || !name.trim()}
                  className="inline-flex h-8 items-center rounded-md bg-accent px-2.5 text-xs font-semibold text-accent-foreground transition hover:opacity-90 disabled:opacity-60"
                >
                  {pending ? "Creating…" : "Create"}
                </button>
              </div>
            </form>
          ) : (
            <button
              type="button"
              onClick={() => setCreating(true)}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-foreground transition hover:bg-background"
            >
              <Plus aria-hidden className="h-4 w-4 text-muted" />
              Create organization
            </button>
          )}

          <div className="my-1 h-px bg-border" />

          <Link
            href="/settings"
            onClick={() => setOpen(false)}
            className="block rounded-md px-2 py-1.5 text-sm text-muted transition hover:bg-background hover:text-foreground"
          >
            Account and Settings
          </Link>

          <div className="my-1 h-px bg-border" />

          <form action="/api/auth/logout" method="post">
            <button
              type="submit"
              className="block w-full rounded-md px-2 py-1.5 text-left text-sm text-muted transition hover:bg-background hover:text-foreground"
            >
              Sign out
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
