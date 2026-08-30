import { and, desc, eq, ilike, or } from "drizzle-orm";

import { db } from "@/lib/db/client";
import { projects, type ProjectRow } from "@/lib/db/schema";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Within an org, a project is visible to any member when `public`, and only to
 * its owner when `private`. Callers pass the active org + viewer.
 */
function orgVisibilityClause(orgId: string, viewerUserId: string) {
  return and(
    eq(projects.orgId, orgId),
    or(
      eq(projects.visibility, "public"),
      eq(projects.ownerUserId, viewerUserId),
    ),
  );
}

/** Visibility-aware project reads scoped to the active org. */
export async function listVisibleProjects(opts: {
  orgId: string;
  viewerUserId: string;
  query?: string;
}): Promise<ProjectRow[]> {
  const query = opts.query?.trim();

  const searchClause = query
    ? or(
        ilike(projects.name, `%${query}%`),
        ilike(projects.summary, `%${query}%`),
        ilike(projects.slug, `%${query}%`),
      )
    : undefined;

  const base = orgVisibilityClause(opts.orgId, opts.viewerUserId);
  const where = searchClause ? and(base, searchClause) : base;

  return db
    .select()
    .from(projects)
    .where(where)
    .orderBy(desc(projects.updatedAt));
}

export async function getVisibleProject(
  idOrSlug: string,
  orgId: string,
  viewerUserId: string,
): Promise<ProjectRow | null> {
  const idMatch = UUID_RE.test(idOrSlug)
    ? eq(projects.id, idOrSlug)
    : eq(projects.slug, idOrSlug);

  const rows = await db
    .select()
    .from(projects)
    .where(and(idMatch, orgVisibilityClause(orgId, viewerUserId)))
    .limit(1);

  return rows[0] ?? null;
}
