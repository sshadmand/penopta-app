import { createLocalAccountIssuer } from "@better-auth/core/db";
import { hashPassword } from "better-auth/crypto";
import { and, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";

import { db } from "../src/lib/db/client";
import { account, user } from "../src/lib/db/schema";

function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

async function main() {
  const email = requiredEnv("APP_REVIEW_DEMO_EMAIL").toLowerCase();
  const password = requiredEnv("APP_REVIEW_DEMO_PASSWORD");
  const name = process.env.APP_REVIEW_DEMO_NAME?.trim() || "App Review";

  if (password.length < 16 || password.length > 128) {
    throw new Error(
      "APP_REVIEW_DEMO_PASSWORD must be between 16 and 128 characters.",
    );
  }

  const issuer = createLocalAccountIssuer("credential");
  const passwordHash = await hashPassword(password);
  const existingUsers = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, email))
    .limit(1);
  const existingUser = existingUsers[0];

  if (existingUser) {
    const credentials = await db
      .select({ id: account.id })
      .from(account)
      .where(
        and(
          eq(account.userId, existingUser.id),
          eq(account.providerId, "credential"),
          eq(account.issuer, issuer),
          eq(account.accountId, existingUser.id),
        ),
      )
      .limit(1);
    const credential = credentials[0];
    if (!credential) {
      throw new Error(
        "A non-review user already owns this email. Refusing to add a password to that account.",
      );
    }

    await db
      .update(account)
      .set({ password: passwordHash, updatedAt: new Date() })
      .where(eq(account.id, credential.id));
    console.log(`Rotated App Review credentials for ${email}.`);
    return;
  }

  const userId = randomUUID();
  await db.insert(user).values({
    id: userId,
    name,
    email,
    emailVerified: true,
    image: null,
  });
  try {
    await db.insert(account).values({
      id: randomUUID(),
      issuer,
      accountId: userId,
      providerId: "credential",
      userId,
      password: passwordHash,
    });
  } catch (error) {
    // Neon HTTP does not support interactive transactions. Avoid leaving an
    // unusable user if credential creation fails after the first insert.
    await db.delete(user).where(eq(user.id, userId));
    throw error;
  }

  console.log(`Created App Review user ${email}.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
