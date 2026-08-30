import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { statsChatMessages, type StatsChatMessageRow } from "@/lib/db/schema";

export const EPHEMERAL_STATS_CHAT_ID_PREFIX = "ephemeral-";

export type StatsChatMessagePublic = {
  id: string;
  role: "user" | "assistant";
  text: string;
  meta: string | null;
  isError: boolean;
  authorUserId: string | null;
  createdAt: string;
};

function toPublic(row: StatsChatMessageRow): StatsChatMessagePublic {
  return {
    id: row.id,
    role: row.role,
    text: row.text,
    meta: row.meta,
    isError: row.isError,
    authorUserId: row.authorUserId,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Stats-page turns for this viewer in the active org, oldest first. */
export async function listStatsChatMessages(
  orgId: string,
  ownerUserId: string,
): Promise<StatsChatMessagePublic[]> {
  const rows = await db
    .select()
    .from(statsChatMessages)
    .where(
      and(
        eq(statsChatMessages.orgId, orgId),
        eq(statsChatMessages.ownerUserId, ownerUserId),
      ),
    )
    .orderBy(asc(statsChatMessages.createdAt));

  return rows.map(toPublic);
}

export async function insertStatsChatMessage(opts: {
  orgId: string;
  ownerUserId: string;
  authorUserId?: string | null;
  role: "user" | "assistant";
  text: string;
  meta?: string | null;
  isError?: boolean;
}): Promise<StatsChatMessagePublic> {
  const rows = await db
    .insert(statsChatMessages)
    .values({
      orgId: opts.orgId,
      ownerUserId: opts.ownerUserId,
      authorUserId: opts.authorUserId ?? null,
      role: opts.role,
      text: opts.text,
      meta: opts.meta ?? null,
      isError: opts.isError ?? false,
    })
    .returning();

  const row = rows[0];
  if (!row) throw new Error("Failed to insert stats chat message.");
  return toPublic(row);
}

export function ephemeralStatsChatMessage(opts: {
  role: "user" | "assistant";
  text: string;
  meta?: string | null;
  isError?: boolean;
  authorUserId?: string | null;
}): StatsChatMessagePublic {
  return {
    id: `${EPHEMERAL_STATS_CHAT_ID_PREFIX}${randomUUID()}`,
    role: opts.role,
    text: opts.text,
    meta: opts.meta ?? null,
    isError: opts.isError ?? false,
    authorUserId: opts.authorUserId ?? null,
    createdAt: new Date().toISOString(),
  };
}
