import { and, asc, desc, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  projects,
  projectSkillRevisions,
  projectSkills,
  type ProjectSkillEvidence,
  type ProjectSkillKind,
  type ProjectSkillRevisionRow,
  type ProjectSkillRow,
} from "@/lib/db/schema";

export type ProjectSkillPublic = {
  id: string;
  kind: ProjectSkillKind;
  slug: string;
  title: string;
  description: string;
  body: string;
  status: "active" | "off";
  humanEdited: boolean;
  sourceThreadIds: string[];
  evidence: ProjectSkillEvidence[];
  updatedByUserId: string | null;
  model: string | null;
  version: number;
  updatedAt: string;
};

export type ProjectSkillRevisionPublic = {
  id: string;
  version: number;
  title: string;
  description: string;
  body: string;
  status: "active" | "off";
  updatedByUserId: string | null;
  model: string | null;
  createdAt: string;
};

export function toSkillPublic(row: ProjectSkillRow): ProjectSkillPublic {
  return {
    id: row.id,
    kind: row.kind,
    slug: row.slug,
    title: row.title,
    description: row.description,
    body: row.body,
    status: row.status,
    humanEdited: row.humanEdited,
    sourceThreadIds: row.sourceThreadIds,
    evidence: row.evidence,
    updatedByUserId: row.updatedByUserId,
    model: row.model,
    version: row.version,
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toRevisionPublic(
  row: ProjectSkillRevisionRow,
): ProjectSkillRevisionPublic {
  return {
    id: row.id,
    version: row.version,
    title: row.title,
    description: row.description,
    body: row.body,
    status: row.status,
    updatedByUserId: row.updatedByUserId,
    model: row.model,
    createdAt: row.createdAt.toISOString(),
  };
}

/** Every skill and rule on a workgroup (active and off). Org-scoped. */
export async function listProjectSkills(
  projectId: string,
  orgId: string,
): Promise<ProjectSkillRow[]> {
  return db
    .select()
    .from(projectSkills)
    .where(
      and(
        eq(projectSkills.projectId, projectId),
        eq(projectSkills.orgId, orgId),
      ),
    )
    .orderBy(asc(projectSkills.kind), asc(projectSkills.title));
}

export async function getProjectSkill(
  skillId: string,
  projectId: string,
  orgId: string,
): Promise<ProjectSkillRow | null> {
  const rows = await db
    .select()
    .from(projectSkills)
    .where(
      and(
        eq(projectSkills.id, skillId),
        eq(projectSkills.projectId, projectId),
        eq(projectSkills.orgId, orgId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

export async function listSkillRevisions(
  skillId: string,
  orgId: string,
): Promise<ProjectSkillRevisionPublic[]> {
  const rows = await db
    .select()
    .from(projectSkillRevisions)
    .where(
      and(
        eq(projectSkillRevisions.skillId, skillId),
        eq(projectSkillRevisions.orgId, orgId),
      ),
    )
    .orderBy(desc(projectSkillRevisions.version));
  return rows.map(toRevisionPublic);
}

export async function getSkillRevision(
  revisionId: string,
  skillId: string,
  orgId: string,
): Promise<ProjectSkillRevisionRow | null> {
  const rows = await db
    .select()
    .from(projectSkillRevisions)
    .where(
      and(
        eq(projectSkillRevisions.id, revisionId),
        eq(projectSkillRevisions.skillId, skillId),
        eq(projectSkillRevisions.orgId, orgId),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

async function insertRevision(row: ProjectSkillRow): Promise<void> {
  await db
    .insert(projectSkillRevisions)
    .values({
      skillId: row.id,
      orgId: row.orgId,
      version: row.version,
      title: row.title,
      description: row.description,
      body: row.body,
      status: row.status,
      updatedByUserId: row.updatedByUserId,
      model: row.model,
    })
    .onConflictDoNothing();
}

/** Insert a new skill/rule. Returns null when the slug is already taken. */
export async function createProjectSkill(opts: {
  orgId: string;
  projectId: string;
  kind: ProjectSkillKind;
  slug: string;
  title: string;
  description: string;
  body: string;
  humanEdited: boolean;
  updatedByUserId: string | null;
  model: string | null;
  sourceThreadIds?: string[];
  evidence?: ProjectSkillEvidence[];
}): Promise<ProjectSkillRow | null> {
  const rows = await db
    .insert(projectSkills)
    .values({
      orgId: opts.orgId,
      projectId: opts.projectId,
      kind: opts.kind,
      slug: opts.slug,
      title: opts.title,
      description: opts.description,
      body: opts.body,
      humanEdited: opts.humanEdited,
      updatedByUserId: opts.updatedByUserId,
      model: opts.model,
      sourceThreadIds: opts.sourceThreadIds ?? [],
      evidence: opts.evidence ?? [],
    })
    .onConflictDoNothing()
    .returning();
  const row = rows[0];
  if (!row) return null;
  await insertRevision(row);
  return row;
}

/**
 * Change a skill and bump its version. `expectedVersion` guards against two
 * writers (a person and a distill run) clobbering each other.
 */
export async function updateProjectSkill(opts: {
  skill: ProjectSkillRow;
  patch: Partial<
    Pick<
      ProjectSkillRow,
      | "title"
      | "description"
      | "body"
      | "status"
      | "humanEdited"
      | "sourceThreadIds"
      | "evidence"
    >
  >;
  updatedByUserId: string | null;
  model: string | null;
}): Promise<ProjectSkillRow | null> {
  const rows = await db
    .update(projectSkills)
    .set({
      ...opts.patch,
      updatedByUserId: opts.updatedByUserId,
      model: opts.model,
      version: sql`${projectSkills.version} + 1`,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(projectSkills.id, opts.skill.id),
        eq(projectSkills.orgId, opts.skill.orgId),
        eq(projectSkills.version, opts.skill.version),
      ),
    )
    .returning();
  const row = rows[0];
  if (!row) return null;
  await insertRevision(row);
  return row;
}

export async function setProjectSkillsDistilledThrough(
  projectId: string,
  orgId: string,
  through: Date,
): Promise<void> {
  await db
    .update(projects)
    .set({ skillsDistilledThrough: through })
    .where(and(eq(projects.id, projectId), eq(projects.orgId, orgId)));
}
