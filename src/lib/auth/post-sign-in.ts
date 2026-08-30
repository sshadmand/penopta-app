import { eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { user } from "@/lib/db/schema";

export {
  isMacosHandoffReturnTo,
  postSignInHref,
  safeAppPath,
} from "@/lib/auth/post-sign-in-url";

/** Account created within this window counts as a first-time signup redirect. */
const NEW_USER_WINDOW_MS = 5 * 60 * 1000;

export async function isNewlyRegisteredUser(userId: string): Promise<boolean> {
  const rows = await db
    .select({ createdAt: user.createdAt })
    .from(user)
    .where(eq(user.id, userId))
    .limit(1);
  const createdAt = rows[0]?.createdAt;
  if (!createdAt) return false;
  return Date.now() - createdAt.getTime() < NEW_USER_WINDOW_MS;
}
