import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, like, or } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  projectChatMessages,
  projects,
  type ProjectChatMessageRow,
} from "@/lib/db/schema";
import {
  DAILY_SUMMARY_META_START,
  MANUAL_SUMMARY_META_START,
} from "@/lib/projects/chat-meta";

export {
  DAILY_SUMMARY_META_START,
  MANUAL_SUMMARY_META_START,
} from "@/lib/projects/chat-meta";

/** Client-only chat rows (e.g. `/test-summary`) — never persisted. */
export const EPHEMERAL_CHAT_ID_PREFIX = "ephemeral-";

export type ProjectChatMessagePublic = {
  id: string;
  role: "user" | "assistant";
  text: string;
  meta: string | null;
  isError: boolean;
  authorUserId: string | null;
  createdAt: string; // ISO
};

function toPublic(row: ProjectChatMessageRow): ProjectChatMessagePublic {
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

/** All chat turns on a project, oldest first (timeline order). Org-scoped. */
export async function listProjectChatMessages(
  projectId: string,
  orgId: string,
): Promise<ProjectChatMessagePublic[]> {
  const rows = await db
    .select()
    .from(projectChatMessages)
    .where(
      and(
        eq(projectChatMessages.projectId, projectId),
        eq(projectChatMessages.orgId, orgId),
      ),
    )
    .orderBy(asc(projectChatMessages.createdAt));

  return rows.map(toPublic);
}

export async function insertProjectChatMessage(opts: {
  orgId: string;
  projectId: string;
  authorUserId?: string | null;
  role: "user" | "assistant";
  text: string;
  meta?: string | null;
  isError?: boolean;
  /** Optional explicit timestamp (defaults to now). */
  createdAt?: Date;
}): Promise<ProjectChatMessagePublic> {
  const rows = await db
    .insert(projectChatMessages)
    .values({
      orgId: opts.orgId,
      projectId: opts.projectId,
      authorUserId: opts.authorUserId ?? null,
      role: opts.role,
      text: opts.text,
      meta: opts.meta ?? null,
      isError: opts.isError ?? false,
      ...(opts.createdAt ? { createdAt: opts.createdAt } : {}),
    })
    .returning();

  const row = rows[0];
  if (!row) throw new Error("Failed to insert project chat message.");
  return toPublic(row);
}

/** In-memory timeline turn. Same shape as a DB row, gone on reload. */
export function ephemeralProjectChatMessage(opts: {
  role: "user" | "assistant";
  text: string;
  meta?: string | null;
  isError?: boolean;
  authorUserId?: string | null;
}): ProjectChatMessagePublic {
  return {
    id: `${EPHEMERAL_CHAT_ID_PREFIX}${randomUUID()}`,
    role: opts.role,
    text: opts.text,
    meta: opts.meta ?? null,
    isError: opts.isError ?? false,
    authorUserId: opts.authorUserId ?? null,
    createdAt: new Date().toISOString(),
  };
}

/**
 * Latest assistant timeline post whose meta starts with `metaPrefix`
 * (e.g. `"Continue work ·"`). Org-scoped.
 */
export async function getLatestAssistantMessageByMetaPrefix(
  projectId: string,
  orgId: string,
  metaPrefix: string,
): Promise<ProjectChatMessagePublic | null> {
  const rows = await db
    .select()
    .from(projectChatMessages)
    .where(
      and(
        eq(projectChatMessages.projectId, projectId),
        eq(projectChatMessages.orgId, orgId),
        eq(projectChatMessages.role, "assistant"),
        like(projectChatMessages.meta, `${metaPrefix}%`),
      ),
    )
    .orderBy(desc(projectChatMessages.createdAt))
    .limit(1);

  const row = rows[0];
  return row ? toPublic(row) : null;
}

export type OrgDailySummary = {
  id: string;
  projectId: string;
  projectName: string;
  text: string;
  meta: string | null;
  createdAt: string;
};

/**
 * Summary posts across every project the viewer can see in the org,
 * oldest first (thread order). Includes cron daily summaries and
 * on-demand `/summary` replies.
 */
export async function listVisibleDailySummaries(opts: {
  orgId: string;
  viewerUserId: string;
}): Promise<OrgDailySummary[]> {
  const rows = await db
    .select({
      id: projectChatMessages.id,
      projectId: projects.id,
      projectName: projects.name,
      text: projectChatMessages.text,
      meta: projectChatMessages.meta,
      createdAt: projectChatMessages.createdAt,
    })
    .from(projectChatMessages)
    .innerJoin(projects, eq(projects.id, projectChatMessages.projectId))
    .where(
      and(
        eq(projectChatMessages.orgId, opts.orgId),
        eq(projects.orgId, opts.orgId),
        eq(projectChatMessages.role, "assistant"),
        eq(projectChatMessages.isError, false),
        or(
          like(projectChatMessages.meta, `${DAILY_SUMMARY_META_START}%`),
          like(projectChatMessages.meta, `${MANUAL_SUMMARY_META_START}%`),
        ),
        or(
          eq(projects.visibility, "public"),
          eq(projects.ownerUserId, opts.viewerUserId),
        ),
      ),
    )
    .orderBy(asc(projectChatMessages.createdAt));

  return rows.map((row) => ({
    id: row.id,
    projectId: row.projectId,
    projectName: row.projectName,
    text: row.text,
    meta: row.meta,
    createdAt: row.createdAt.toISOString(),
  }));
}

export type ProjectDailySummaryPost = {
  text: string;
  meta: string | null;
  createdAt: Date;
};

/**
 * Cron daily summaries for one project since `since` (oldest first).
 * Does not include on-demand `/summary` posts.
 */
export async function listProjectDailySummariesSince(opts: {
  projectId: string;
  orgId: string;
  since: Date;
}): Promise<ProjectDailySummaryPost[]> {
  const rows = await db
    .select({
      text: projectChatMessages.text,
      meta: projectChatMessages.meta,
      createdAt: projectChatMessages.createdAt,
    })
    .from(projectChatMessages)
    .where(
      and(
        eq(projectChatMessages.projectId, opts.projectId),
        eq(projectChatMessages.orgId, opts.orgId),
        eq(projectChatMessages.role, "assistant"),
        eq(projectChatMessages.isError, false),
        like(projectChatMessages.meta, `${DAILY_SUMMARY_META_START}%`),
        gte(projectChatMessages.createdAt, opts.since),
      ),
    )
    .orderBy(asc(projectChatMessages.createdAt));

  return rows;
}
