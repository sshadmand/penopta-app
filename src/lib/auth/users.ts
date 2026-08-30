import { inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { user } from "@/lib/db/schema";

/** Public display info for a Penopta auth user. */
export type DirectoryUser = {
  id: string;
  email: string;
  name: string | null;
  image: string | null;
};

/**
 * Resolve auth users by id from the local `user` table.
 * Failures / missing ids are omitted from the map.
 */
export async function lookupUsers(
  ids: string[],
): Promise<Map<string, DirectoryUser>> {
  const unique = [...new Set(ids.filter(Boolean))];
  const out = new Map<string, DirectoryUser>();
  if (unique.length === 0) return out;

  const rows = await db
    .select({
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
    })
    .from(user)
    .where(inArray(user.id, unique));

  for (const row of rows) {
    out.set(row.id, {
      id: row.id,
      email: row.email,
      name: row.name ?? null,
      image: row.image ?? null,
    });
  }
  return out;
}

/**
 * Resolve a single auth user by email or id. Returns null when unknown.
 */
export async function resolveUser(
  emailOrId: string,
): Promise<DirectoryUser | null> {
  const trimmed = emailOrId.trim();
  if (!trimmed) return null;

  const byId = await lookupUsers([trimmed]);
  if (byId.has(trimmed)) return byId.get(trimmed)!;

  const email = trimmed.toLowerCase();
  const rows = await db
    .select({
      id: user.id,
      email: user.email,
      name: user.name,
      image: user.image,
    })
    .from(user)
    .where(sql`lower(${user.email}) = ${email}`)
    .limit(1);

  const row = rows[0];
  if (!row) return null;
  return {
    id: row.id,
    email: row.email,
    name: row.name ?? null,
    image: row.image ?? null,
  };
}
