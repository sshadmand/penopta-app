"use server";

import { eq } from "drizzle-orm";

import { getSession } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import { account, passkey, user } from "@/lib/db/schema";
import { resolveActiveOrg } from "@/lib/orgs/data";

export type AccountProviderView = {
  id: string;
  label: string;
};

export type AccountPasskeyView = {
  id: string;
  name: string | null;
  createdAt: Date | null;
};

export type AccountSettingsView = {
  id: string;
  orgId: string;
  name: string;
  email: string;
  image: string | null;
  providers: AccountProviderView[];
  passkeys: AccountPasskeyView[];
};

function providerLabel(providerId: string): string {
  switch (providerId) {
    case "google":
      return "Google";
    case "github":
      return "GitHub";
    case "apple":
      return "Apple";
    case "credential":
      return "Email & password";
    default:
      return providerId.charAt(0).toUpperCase() + providerId.slice(1);
  }
}

/** Load the signed-in user's account details for Account settings. */
export async function getAccountSettingsAction(): Promise<
  | { ok: true; account: AccountSettingsView }
  | { ok: false; error: string }
> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in to manage your account." };

  try {
    const [userRow] = await db
      .select({
        id: user.id,
        name: user.name,
        email: user.email,
        image: user.image,
      })
      .from(user)
      .where(eq(user.id, session.user.id))
      .limit(1);

    if (!userRow) {
      return { ok: false, error: "Account not found." };
    }

    const [{ activeOrg }, accounts, passkeys] = await Promise.all([
      resolveActiveOrg(session.user.id),
      db
        .select({ id: account.id, providerId: account.providerId })
        .from(account)
        .where(eq(account.userId, session.user.id)),
      db
        .select({
          id: passkey.id,
          name: passkey.name,
          createdAt: passkey.createdAt,
        })
        .from(passkey)
        .where(eq(passkey.userId, session.user.id)),
    ]);

    return {
      ok: true,
      account: {
        id: userRow.id,
        orgId: activeOrg.id,
        name: userRow.name,
        email: userRow.email,
        image: userRow.image,
        providers: accounts.map((row) => ({
          id: row.providerId,
          label: providerLabel(row.providerId),
        })),
        passkeys: passkeys.map((row) => ({
          id: row.id,
          name: row.name,
          createdAt: row.createdAt,
        })),
      },
    };
  } catch (err) {
    console.error("getAccountSettingsAction", err);
    return { ok: false, error: "Couldn't load your account. Try again." };
  }
}
