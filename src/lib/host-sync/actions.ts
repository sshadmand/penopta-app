"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth/server";
import {
  approveDeviceLogin,
  createClaimLogin,
} from "@/lib/host-sync/device";
import {
  getHostToken,
  revokeHostToken,
  updateHostTokenLabel,
} from "@/lib/host-sync/tokens";
import { integrationPath } from "@/lib/integrations/paths";
import { resolveActiveOrg } from "@/lib/orgs/data";

export type HostSyncActionState =
  | { ok: true; hostname?: string; command?: string; expiresIn?: number }
  | { ok: false; error: string };

function revalidateLinux() {
  revalidatePath(integrationPath("linux"));
  revalidatePath("/device/linux-sync");
}

export async function approveLinuxHostAction(
  userCode: string,
): Promise<HostSyncActionState> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in to allow this Linux host." };

  try {
    const { activeOrg } = await resolveActiveOrg(session.user.id);
    const result = await approveDeviceLogin({
      userCode,
      ownerUserId: session.user.id,
      orgId: activeOrg.id,
    });
    if (!result.ok) return result;
    revalidateLinux();
    return { ok: true, hostname: result.hostname };
  } catch (err) {
    console.error("approveLinuxHostAction", err);
    return { ok: false, error: "Couldn't confirm this machine. Try again." };
  }
}

export async function refreshHostTokenAction(
  tokenId: string,
): Promise<HostSyncActionState> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in to refresh this host." };

  try {
    const { activeOrg } = await resolveActiveOrg(session.user.id);
    const token = await getHostToken(tokenId, session.user.id, activeOrg.id);
    if (!token || token.revokedAt) {
      return { ok: false, error: "That Linux host was not found." };
    }
    const claim = await createClaimLogin({
      ownerUserId: session.user.id,
      orgId: activeOrg.id,
      hostname: token.hostname,
      tokenId: token.id,
    });
    revalidateLinux();
    return {
      ok: true,
      command: claim.command,
      expiresIn: claim.expiresIn,
      hostname: token.hostname,
    };
  } catch (err) {
    console.error("refreshHostTokenAction", err);
    return { ok: false, error: "Couldn't mint a refresh code. Try again." };
  }
}

export async function revokeHostTokenAction(
  tokenId: string,
): Promise<HostSyncActionState> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in to revoke this host." };

  try {
    const { activeOrg } = await resolveActiveOrg(session.user.id);
    const row = await revokeHostToken(tokenId, session.user.id, activeOrg.id);
    if (!row) return { ok: false, error: "That Linux host was not found." };
    revalidateLinux();
    return { ok: true, hostname: row.hostname };
  } catch (err) {
    console.error("revokeHostTokenAction", err);
    return { ok: false, error: "Couldn't revoke this host. Try again." };
  }
}

export async function updateHostTokenLabelAction(
  tokenId: string,
  label: string,
): Promise<HostSyncActionState> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in to rename this host." };

  try {
    const { activeOrg } = await resolveActiveOrg(session.user.id);
    const row = await updateHostTokenLabel(
      tokenId,
      session.user.id,
      activeOrg.id,
      label,
    );
    if (!row) return { ok: false, error: "That Linux host was not found." };
    revalidateLinux();
    return { ok: true, hostname: row.hostname };
  } catch (err) {
    console.error("updateHostTokenLabelAction", err);
    return { ok: false, error: "Couldn't update the label. Try again." };
  }
}
