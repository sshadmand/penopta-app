"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth/server";
import { lookupUsers, resolveUser } from "@/lib/auth/users";
import { sendOrgInviteEmail } from "@/lib/email/org-invite";
import {
  AlreadyMemberError,
  addOrgMember,
  createOrg,
  getMembershipRole,
  getOrgById,
  LastOwnerError,
  listOrgMembers,
  OrgNotFoundError,
  removeOrgMember,
  renameOrg,
  setActiveOrg,
  updateOrgMemberRole,
  type OrgRole,
} from "@/lib/orgs/data";

export type OrgActionState =
  | { ok: true; id: string }
  | { ok: false; error: string };

export type OrgMemberView = {
  id: string;
  userId: string;
  role: OrgRole;
  name: string | null;
  email: string | null;
  isYou: boolean;
};

function revalidateOrgs() {
  revalidatePath("/", "layout");
}

async function requireOwner(orgId: string, userId: string) {
  const role = await getMembershipRole(orgId, userId);
  if (!role) return { ok: false as const, error: "You're not a member of that org." };
  if (role !== "owner") {
    return { ok: false as const, error: "Only owners can manage this org." };
  }
  return { ok: true as const };
}

/** Create an organization and switch the current user into it. */
export async function createOrgAction(name: string): Promise<OrgActionState> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in to create an org." };

  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Give your org a name." };
  if (trimmed.length > 80) {
    return { ok: false, error: "Keep the name under 80 characters." };
  }

  try {
    const org = await createOrg(trimmed, session.user.id);
    await setActiveOrg(session.user.id, org.id);
    revalidateOrgs();
    return { ok: true, id: org.id };
  } catch (err) {
    console.error("createOrgAction", err);
    return { ok: false, error: "Couldn't create the org. Try again." };
  }
}

/** Switch the current user's active org (must be a member). */
export async function switchOrgAction(orgId: string): Promise<OrgActionState> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in to switch orgs." };

  try {
    const role = await getMembershipRole(orgId, session.user.id);
    if (!role) return { ok: false, error: "You're not a member of that org." };

    await setActiveOrg(session.user.id, orgId);
    revalidateOrgs();
    return { ok: true, id: orgId };
  } catch (err) {
    console.error("switchOrgAction", err);
    return { ok: false, error: "Couldn't switch orgs. Try again." };
  }
}

/** Rename the active org (owners only). */
export async function renameOrgAction(
  orgId: string,
  name: string,
): Promise<OrgActionState> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in to rename an org." };

  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Give your org a name." };
  if (trimmed.length > 80) {
    return { ok: false, error: "Keep the name under 80 characters." };
  }

  const gate = await requireOwner(orgId, session.user.id);
  if (!gate.ok) return gate;

  try {
    const org = await renameOrg(orgId, trimmed);
    revalidateOrgs();
    return { ok: true, id: org.id };
  } catch (err) {
    if (err instanceof OrgNotFoundError) {
      return { ok: false, error: "Organization not found." };
    }
    console.error("renameOrgAction", err);
    return { ok: false, error: "Couldn't rename the org. Try again." };
  }
}

/**
 * Invite a Penopta user by email (or user id) into the org with the chosen role.
 * Owners only. The person must already have signed in to Penopta once.
 */
export async function inviteOrgMemberAction(
  orgId: string,
  emailOrId: string,
  role: OrgRole,
): Promise<OrgActionState> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in to invite someone." };

  const gate = await requireOwner(orgId, session.user.id);
  if (!gate.ok) return gate;

  const trimmed = emailOrId.trim();
  if (!trimmed) return { ok: false, error: "Enter an email address." };
  if (role !== "owner" && role !== "member") {
    return { ok: false, error: "Pick owner or member." };
  }

  try {
    const invitee = await resolveUser(trimmed);
    if (!invitee) {
      return {
        ok: false,
        error:
          "No Penopta account found for that email. They need to sign in once first.",
      };
    }
    if (invitee.id === session.user.id) {
      return { ok: false, error: "You're already in this org." };
    }

    const org = await getOrgById(orgId);
    if (!org) return { ok: false, error: "Organization not found." };

    await addOrgMember(orgId, invitee.id, role);
    revalidateOrgs();

    const inviteEmail = invitee.email?.trim();
    if (inviteEmail) {
      try {
        await sendOrgInviteEmail({
          to: inviteEmail,
          orgName: org.name,
          role,
          invitedByName:
            session.user.name?.trim() ||
            session.user.email ||
            "A teammate",
        });
      } catch (err) {
        // Membership already succeeded — don't roll back on mail failure.
        console.error("inviteOrgMemberAction: email failed", err);
      }
    }

    return { ok: true, id: invitee.id };
  } catch (err) {
    if (err instanceof AlreadyMemberError) {
      return { ok: false, error: "They're already a member of this org." };
    }
    console.error("inviteOrgMemberAction", err);
    return { ok: false, error: "Couldn't invite them. Try again." };
  }
}

/** Change a member's role (owners only). */
export async function updateOrgMemberRoleAction(
  orgId: string,
  userId: string,
  role: OrgRole,
): Promise<OrgActionState> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in to change roles." };

  const gate = await requireOwner(orgId, session.user.id);
  if (!gate.ok) return gate;

  if (role !== "owner" && role !== "member") {
    return { ok: false, error: "Pick owner or member." };
  }

  try {
    await updateOrgMemberRole(orgId, userId, role);
    revalidateOrgs();
    return { ok: true, id: userId };
  } catch (err) {
    if (err instanceof LastOwnerError) {
      return { ok: false, error: err.message };
    }
    if (err instanceof OrgNotFoundError) {
      return { ok: false, error: "Member not found." };
    }
    console.error("updateOrgMemberRoleAction", err);
    return { ok: false, error: "Couldn't update the role. Try again." };
  }
}

/** Remove a member (owners only). */
export async function removeOrgMemberAction(
  orgId: string,
  userId: string,
): Promise<OrgActionState> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in to remove a member." };

  const gate = await requireOwner(orgId, session.user.id);
  if (!gate.ok) return gate;

  try {
    await removeOrgMember(orgId, userId);
    revalidateOrgs();
    return { ok: true, id: userId };
  } catch (err) {
    if (err instanceof LastOwnerError) {
      return { ok: false, error: err.message };
    }
    if (err instanceof OrgNotFoundError) {
      return { ok: false, error: "Member not found." };
    }
    console.error("removeOrgMemberAction", err);
    return { ok: false, error: "Couldn't remove the member. Try again." };
  }
}

/** Load the member list for organization settings. */
export async function listOrgMembersAction(
  orgId: string,
): Promise<
  | { ok: true; members: OrgMemberView[]; canManage: boolean }
  | { ok: false; error: string }
> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in to view members." };

  const role = await getMembershipRole(orgId, session.user.id);
  if (!role) return { ok: false, error: "You're not a member of that org." };

  try {
    const rows = await listOrgMembers(orgId);
    const directory = await lookupUsers(rows.map((r) => r.userId));

    const members: OrgMemberView[] = rows.map((r) => {
      const directoryUser = directory.get(r.userId);
      const isYou = r.userId === session.user.id;
      return {
        id: r.id,
        userId: r.userId,
        role: r.role as OrgRole,
        name: isYou
          ? session.user.name || session.user.email
          : (directoryUser?.name ?? null),
        email: isYou ? session.user.email : (directoryUser?.email ?? null),
        isYou,
      };
    });

    return { ok: true, members, canManage: role === "owner" };
  } catch (err) {
    console.error("listOrgMembersAction", err);
    return { ok: false, error: "Couldn't load members. Try again." };
  }
}
