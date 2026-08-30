import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  hostSyncDeviceLogins,
  type HostSyncDeviceLoginRow,
} from "@/lib/db/schema";
import {
  normalizeUserCode,
  randomSecret,
  randomUserCode,
  sha256Hex,
} from "@/lib/host-sync/crypto";
import { getPublicAppUrl } from "@/lib/integrations/providers";
import {
  findHostTokenByHostname,
  mintHostToken,
} from "@/lib/host-sync/tokens";

export const DEVICE_LOGIN_TTL_MS = 1000 * 60 * 10; // 10 minutes

export type DeviceLoginKind = "device" | "claim";

export function linuxSyncDeviceUrl(userCode: string): string {
  return `${getPublicAppUrl()}/device/linux-sync?code=${encodeURIComponent(userCode)}`;
}

export function linuxSyncIntegrationsUrl(): string {
  return `${getPublicAppUrl()}/settings/integrations/linux`;
}

async function insertLogin(params: {
  kind: DeviceLoginKind;
  /** Device flow: hash of the secret device_code. Claim flow: omit (hashed from user_code). */
  deviceCodeHash?: string;
  hostname?: string | null;
  tokenId?: string | null;
  ownerUserId?: string | null;
  orgId?: string | null;
  status: "pending" | "approved";
}): Promise<{ row: HostSyncDeviceLoginRow; userCode: string }> {
  const expiresAt = new Date(Date.now() + DEVICE_LOGIN_TTL_MS);
  for (let attempt = 0; attempt < 8; attempt++) {
    const userCode = randomUserCode();
    const deviceCodeHash =
      params.deviceCodeHash ?? sha256Hex(`claim:${userCode}`);
    try {
      const [row] = await db
        .insert(hostSyncDeviceLogins)
        .values({
          userCode,
          deviceCodeHash,
          kind: params.kind,
          hostname: params.hostname?.trim() || null,
          tokenId: params.tokenId ?? null,
          ownerUserId: params.ownerUserId ?? null,
          orgId: params.orgId ?? null,
          status: params.status,
          expiresAt,
        })
        .returning();
      if (row) return { row, userCode };
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (
        (message.includes("host_sync_device_login_user_code") ||
          message.includes("host_sync_device_login_device_code_hash")) &&
        attempt < 7
      ) {
        continue;
      }
      throw err;
    }
  }
  throw new Error("Failed to mint a unique device code");
}

function isExpired(row: HostSyncDeviceLoginRow, now = new Date()): boolean {
  return row.expiresAt <= now;
}

export async function getDeviceLoginByUserCode(
  userCode: string,
): Promise<HostSyncDeviceLoginRow | null> {
  const code = normalizeUserCode(userCode);
  const [row] = await db
    .select()
    .from(hostSyncDeviceLogins)
    .where(eq(hostSyncDeviceLogins.userCode, code))
    .limit(1);
  return row ?? null;
}

/**
 * CLI `penopta-sync login`: create a pending device-code login.
 * Returns the plaintext `device_code` once (hashed at rest).
 */
export async function createDeviceLogin(hostname: string): Promise<{
  userCode: string;
  deviceCode: string;
  verificationUrl: string;
  expiresIn: number;
}> {
  const deviceCode = randomSecret(32);
  const { userCode } = await insertLogin({
    kind: "device",
    deviceCodeHash: sha256Hex(deviceCode),
    hostname,
    status: "pending",
  });
  return {
    userCode,
    deviceCode,
    verificationUrl: linuxSyncDeviceUrl(userCode),
    expiresIn: Math.floor(DEVICE_LOGIN_TTL_MS / 1000),
  };
}

/**
 * Website Refresh: pre-approved claim. CLI polls with the user code.
 */
export async function createClaimLogin(params: {
  ownerUserId: string;
  orgId: string;
  hostname: string;
  tokenId: string;
}): Promise<{
  userCode: string;
  verificationUrl: string;
  expiresIn: number;
  command: string;
}> {
  const { userCode } = await insertLogin({
    kind: "claim",
    hostname: params.hostname,
    tokenId: params.tokenId,
    ownerUserId: params.ownerUserId,
    orgId: params.orgId,
    status: "approved",
  });

  return {
    userCode,
    verificationUrl: linuxSyncDeviceUrl(userCode),
    expiresIn: Math.floor(DEVICE_LOGIN_TTL_MS / 1000),
    command: `penopta-sync login --code ${userCode}`,
  };
}

export async function approveDeviceLogin(params: {
  userCode: string;
  ownerUserId: string;
  orgId: string;
}): Promise<
  | { ok: true; hostname: string }
  | { ok: false; error: string }
> {
  const row = await getDeviceLoginByUserCode(params.userCode);
  if (!row || row.kind !== "device") {
    return { ok: false, error: "That code is unknown or has expired." };
  }
  if (isExpired(row)) {
    return { ok: false, error: "That code has expired. Run login again on the Linux box." };
  }
  if (row.status === "consumed") {
    return { ok: false, error: "That code was already used." };
  }
  if (row.status === "approved") {
    return { ok: true, hostname: row.hostname || "linux" };
  }

  const hostname = row.hostname?.trim() || "linux";
  const existing = await findHostTokenByHostname({
    ownerUserId: params.ownerUserId,
    orgId: params.orgId,
    hostname,
  });

  const [updated] = await db
    .update(hostSyncDeviceLogins)
    .set({
      status: "approved",
      ownerUserId: params.ownerUserId,
      orgId: params.orgId,
      tokenId: existing?.id ?? row.tokenId,
    })
    .where(
      and(
        eq(hostSyncDeviceLogins.id, row.id),
        eq(hostSyncDeviceLogins.status, "pending"),
      ),
    )
    .returning();

  if (!updated) {
    return { ok: false, error: "Couldn't confirm this machine. Try again." };
  }
  return { ok: true, hostname };
}

export type PollDeviceTokenResult =
  | { status: "pending" }
  | { status: "expired" }
  | { status: "consumed" }
  | {
      status: "issued";
      secret: string;
      expiresAt: string;
      hostname: string;
      orgId: string;
    };

async function issueFromApprovedLogin(
  row: HostSyncDeviceLoginRow,
): Promise<PollDeviceTokenResult> {
  if (!row.ownerUserId || !row.orgId) return { status: "pending" };
  if (isExpired(row)) return { status: "expired" };
  if (row.status === "consumed") return { status: "consumed" };
  if (row.status !== "approved") return { status: "pending" };

  const [consumed] = await db
    .update(hostSyncDeviceLogins)
    .set({ status: "consumed" })
    .where(
      and(
        eq(hostSyncDeviceLogins.id, row.id),
        eq(hostSyncDeviceLogins.status, "approved"),
      ),
    )
    .returning();

  if (!consumed) return { status: "consumed" };

  const hostname = row.hostname?.trim() || "linux";
  const { token, secret } = await mintHostToken({
    ownerUserId: row.ownerUserId,
    orgId: row.orgId,
    hostname,
    rotateTokenId: row.tokenId,
  });

  await db
    .update(hostSyncDeviceLogins)
    .set({ tokenId: token.id })
    .where(eq(hostSyncDeviceLogins.id, row.id));

  return {
    status: "issued",
    secret,
    expiresAt: token.expiresAt.toISOString(),
    hostname: token.hostname,
    orgId: token.orgId,
  };
}

/** CLI poll with the secret `device_code` from `createDeviceLogin`. */
export async function pollDeviceTokenByDeviceCode(
  deviceCode: string,
): Promise<PollDeviceTokenResult> {
  const trimmed = deviceCode.trim();
  if (!trimmed) return { status: "expired" };
  const [row] = await db
    .select()
    .from(hostSyncDeviceLogins)
    .where(eq(hostSyncDeviceLogins.deviceCodeHash, sha256Hex(trimmed)))
    .limit(1);
  if (!row) return { status: "expired" };
  if (isExpired(row) && row.status !== "consumed") return { status: "expired" };
  if (row.status === "pending") return { status: "pending" };
  return issueFromApprovedLogin(row);
}

/** CLI `login --code` for a website-minted claim. */
export async function pollDeviceTokenByUserCode(
  userCode: string,
): Promise<PollDeviceTokenResult> {
  const row = await getDeviceLoginByUserCode(userCode);
  if (!row || row.kind !== "claim") return { status: "expired" };
  if (isExpired(row) && row.status !== "consumed") return { status: "expired" };
  if (row.status === "pending") return { status: "pending" };
  return issueFromApprovedLogin(row);
}
