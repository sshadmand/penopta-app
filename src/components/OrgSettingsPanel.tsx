"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  inviteOrgMemberAction,
  listOrgMembersAction,
  removeOrgMemberAction,
  renameOrgAction,
  updateOrgMemberRoleAction,
  type OrgMemberView,
} from "@/lib/orgs/actions";
import type { OrgRole } from "@/lib/orgs/data";

/** Rename the active org and manage its members (invite / role / remove). */
export function OrgSettingsPanel({
  orgId,
  orgName,
  members: initialMembers,
  canManage,
}: {
  orgId: string;
  orgName: string;
  members: OrgMemberView[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(orgName);
  const [members, setMembers] = useState(initialMembers);
  const [inviteEmail, setInviteEmail] = useState("");
  const [inviteRole, setInviteRole] = useState<OrgRole>("member");

  function saveName(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await renameOrgAction(orgId, name);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Organization renamed");
      router.refresh();
    });
  }

  function invite(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const result = await inviteOrgMemberAction(
        orgId,
        inviteEmail,
        inviteRole,
      );
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Member invited");
      setInviteEmail("");
      setInviteRole("member");
      const refreshed = await listOrgMembersAction(orgId);
      if (refreshed.ok) setMembers(refreshed.members);
    });
  }

  function changeRole(userId: string, role: OrgRole) {
    startTransition(async () => {
      const result = await updateOrgMemberRoleAction(orgId, userId, role);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Role updated");
      setMembers((prev) =>
        prev.map((m) => (m.userId === userId ? { ...m, role } : m)),
      );
    });
  }

  function remove(userId: string) {
    startTransition(async () => {
      const result = await removeOrgMemberAction(orgId, userId);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success("Member removed");
      setMembers((prev) => prev.filter((m) => m.userId !== userId));
    });
  }

  return (
    <div className="space-y-6">
      {canManage ? (
        <form onSubmit={saveName}>
          <label
            htmlFor="org-name"
            className="block text-xs font-semibold tracking-wider text-muted uppercase"
          >
            Name
          </label>
          <div className="mt-2 flex gap-2">
            <input
              id="org-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-accent"
            />
            <button
              type="submit"
              disabled={pending || !name.trim() || name.trim() === orgName}
              className="inline-flex h-10 shrink-0 items-center rounded-lg bg-accent px-3 text-sm font-semibold text-accent-foreground transition hover:opacity-90 disabled:opacity-60"
            >
              Save
            </button>
          </div>
        </form>
      ) : null}

      <section>
        <p className="text-xs font-semibold tracking-wider text-muted uppercase">
          Members
        </p>
        {members.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No members yet</p>
        ) : (
          <ul className="mt-2 divide-y divide-border rounded-lg border border-border">
            {members.map((member) => {
              const label =
                member.name ||
                member.email ||
                (member.isYou ? "You" : member.userId);
              return (
                <li
                  key={member.id}
                  className="flex items-center gap-2 px-3 py-2.5"
                >
                  <div className="min-w-0 flex-1">
                    <p
                      className="truncate text-sm text-foreground"
                      title={label}
                    >
                      {label}
                      {member.isYou ? (
                        <span className="text-muted"> · you</span>
                      ) : null}
                    </p>
                    {member.email && member.name ? (
                      <p className="truncate text-xs text-muted">
                        {member.email}
                      </p>
                    ) : null}
                  </div>
                  {canManage ? (
                    <>
                      <select
                        value={member.role}
                        disabled={pending}
                        onChange={(e) =>
                          changeRole(member.userId, e.target.value as OrgRole)
                        }
                        aria-label={`Role for ${label}`}
                        className="h-8 rounded-md border border-border bg-background px-1.5 text-xs text-foreground outline-none focus:border-accent disabled:opacity-60"
                      >
                        <option value="owner">Owner</option>
                        <option value="member">Member</option>
                      </select>
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => remove(member.userId)}
                        className="shrink-0 text-xs font-medium text-muted transition hover:text-foreground disabled:opacity-60"
                      >
                        Remove
                      </button>
                    </>
                  ) : (
                    <span className="text-xs text-muted capitalize">
                      {member.role}
                    </span>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {canManage ? (
        <form onSubmit={invite}>
          <p className="text-xs font-semibold tracking-wider text-muted uppercase">
            Invite
          </p>
          <p className="mt-1 text-xs text-muted">
            They need a Penopta account (sign in once). We&apos;ll email them
            when they&apos;re added.
          </p>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <input
              type="email"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="colleague@company.com"
              className="h-10 min-w-0 flex-1 rounded-lg border border-border bg-background px-3 text-sm text-foreground outline-none transition focus:border-accent"
            />
            <select
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value as OrgRole)}
              aria-label="Invite as"
              className="h-10 rounded-lg border border-border bg-background px-2 text-sm text-foreground outline-none focus:border-accent"
            >
              <option value="member">Member</option>
              <option value="owner">Owner</option>
            </select>
            <button
              type="submit"
              disabled={pending || !inviteEmail.trim()}
              className="inline-flex h-10 shrink-0 items-center justify-center rounded-lg bg-accent px-4 text-sm font-semibold text-accent-foreground transition hover:opacity-90 disabled:opacity-60"
            >
              {pending ? "Inviting…" : "Invite"}
            </button>
          </div>
        </form>
      ) : (
        <p className="text-sm text-muted">
          Ask an owner if you need to invite someone or rename this org.
        </p>
      )}
    </div>
  );
}
