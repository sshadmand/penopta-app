"use server";

import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth/server";
import { INTEGRATIONS_PATH } from "@/lib/integrations/paths";
import {
  ActiveKeyExistsError,
  invalidateActiveApiKeys,
  mintApiKey,
  NoActiveKeyError,
  remintApiKey,
} from "@/lib/keys/data";
import { resolveActiveOrg } from "@/lib/orgs/data";

export type KeyActionState =
  { ok: true; key?: string; expiresAt?: string } | { ok: false; error: string };

function revalidateKeys() {
  revalidatePath(INTEGRATIONS_PATH, "layout");
}

export async function mintUserApiKeyAction(): Promise<KeyActionState> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in to mint a key." };

  try {
    const { activeOrg } = await resolveActiveOrg(session.user.id);
    const row = await mintApiKey(session.user.id, activeOrg.id);
    revalidateKeys();
    return {
      ok: true,
      key: row.key,
      expiresAt: row.expiresAt.toISOString(),
    };
  } catch (err) {
    if (err instanceof ActiveKeyExistsError) {
      return {
        ok: false,
        error: `You already have an active key for this org. Re-mint or invalidate it first.`,
      };
    }
    console.error("mintUserApiKeyAction", err);
    return { ok: false, error: "Couldn't mint a key. Try again." };
  }
}

export async function remintUserApiKeyAction(): Promise<KeyActionState> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in to re-mint a key." };

  try {
    const { activeOrg } = await resolveActiveOrg(session.user.id);
    const row = await remintApiKey(session.user.id, activeOrg.id);
    revalidateKeys();
    return {
      ok: true,
      key: row.key,
      expiresAt: row.expiresAt.toISOString(),
    };
  } catch (err) {
    console.error("remintUserApiKeyAction", err);
    return { ok: false, error: "Couldn't re-mint a key. Try again." };
  }
}

export async function invalidateUserApiKeyAction(): Promise<KeyActionState> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in to invalidate a key." };

  try {
    const { activeOrg } = await resolveActiveOrg(session.user.id);
    const count = await invalidateActiveApiKeys(session.user.id, activeOrg.id);
    if (count === 0) throw new NoActiveKeyError();
    revalidateKeys();
    return { ok: true };
  } catch (err) {
    if (err instanceof NoActiveKeyError) {
      return { ok: false, error: "No active key to invalidate." };
    }
    console.error("invalidateUserApiKeyAction", err);
    return { ok: false, error: "Couldn't invalidate the key. Try again." };
  }
}
