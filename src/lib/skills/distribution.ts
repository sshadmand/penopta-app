import { and, eq, inArray, or } from "drizzle-orm";

import { db } from "@/lib/db/client";
import {
  availableProviderProjects,
  projects,
  projectSkills,
  projectSourceProjects,
  type ProjectSkillRow,
} from "@/lib/db/schema";
import { listUserOrgs } from "@/lib/orgs/data";
import { listProjectThreads } from "@/lib/threads/data";

export type DistributedSkill = {
  slug: string;
  title: string;
  description: string;
  body: string;
  updatedAt: string;
};

export type DistributedRule = {
  slug: string;
  title: string;
  body: string;
  updatedAt: string;
};

export type SkillDistributionWorkgroup = {
  id: string;
  /** File-safe workgroup slug used in `penopta-<slug>-…` paths. */
  slug: string;
  name: string;
  orgId: string;
  orgName: string;
  /** Leave this workgroup's files out of the repo's local git exclude. */
  commitToRepo: boolean;
  /**
   * Local project names (as the sync app reports them) that belong to this
   * workgroup for the caller. The app maps each to a folder on disk.
   */
  projectNames: string[];
  skills: DistributedSkill[];
  rules: DistributedRule[];
};

/** Kebab-case, `[a-z0-9-]`, ≤ 32 chars — safe in a file name. */
export function fileSafeWorkgroupSlug(slug: string): string {
  return (
    slug
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32)
      .replace(/-+$/g, "") || "workgroup"
  );
}

/** Source project names this user linked, or synced threads for, in a workgroup. */
async function callerProjectNames(
  project: { id: string; orgId: string },
  userId: string,
): Promise<string[]> {
  const [threads, linked] = await Promise.all([
    listProjectThreads(project.id, project.orgId),
    db
      .select({
        name: availableProviderProjects.name,
        externalProjectId: availableProviderProjects.externalProjectId,
      })
      .from(projectSourceProjects)
      .innerJoin(
        availableProviderProjects,
        eq(
          availableProviderProjects.id,
          projectSourceProjects.availableProviderProjectId,
        ),
      )
      .where(
        and(
          eq(projectSourceProjects.projectId, project.id),
          eq(availableProviderProjects.ownerUserId, userId),
        ),
      ),
  ]);

  const names = new Set<string>();
  for (const t of threads) {
    if (t.ownerUserId === userId && t.projectContext?.trim()) {
      names.add(t.projectContext.trim());
    }
  }
  for (const row of linked) {
    if (row.name.trim()) names.add(row.name.trim());
    if (row.externalProjectId.trim()) names.add(row.externalProjectId.trim());
  }
  return [...names].sort();
}

/**
 * Active skills and rules for every workgroup the user can see, across all
 * their orgs, with the local project names that should receive them. Used
 * by the Mac app to write skill files into repo folders.
 */
export async function listSkillDistributionForUser(
  userId: string,
): Promise<SkillDistributionWorkgroup[]> {
  const memberships = await listUserOrgs(userId);
  if (memberships.length === 0) return [];
  const orgNames = new Map(memberships.map((m) => [m.org.id, m.org.name]));

  const visible = await db
    .select()
    .from(projects)
    .where(
      and(
        inArray(projects.orgId, [...orgNames.keys()]),
        or(eq(projects.visibility, "public"), eq(projects.ownerUserId, userId)),
      ),
    );
  if (visible.length === 0) return [];

  const skillRows = await db
    .select()
    .from(projectSkills)
    .where(
      and(
        inArray(
          projectSkills.projectId,
          visible.map((p) => p.id),
        ),
        eq(projectSkills.status, "active"),
      ),
    );
  const byProject = new Map<string, ProjectSkillRow[]>();
  for (const row of skillRows) {
    const project = visible.find((p) => p.id === row.projectId);
    // Belt and braces: a skill must live in its workgroup's org.
    if (!project || project.orgId !== row.orgId) continue;
    const list = byProject.get(row.projectId);
    if (list) list.push(row);
    else byProject.set(row.projectId, [row]);
  }

  const out: SkillDistributionWorkgroup[] = [];
  for (const project of visible) {
    const rows = byProject.get(project.id);
    if (!rows?.length) continue;
    const projectNames = await callerProjectNames(project, userId);
    if (projectNames.length === 0) continue;

    const sorted = [...rows].sort((a, b) => a.slug.localeCompare(b.slug));
    out.push({
      id: project.id,
      slug: fileSafeWorkgroupSlug(project.slug),
      name: project.name,
      orgId: project.orgId,
      orgName: orgNames.get(project.orgId) ?? "",
      commitToRepo: project.skillsCommitToRepo,
      projectNames,
      skills: sorted
        .filter((s) => s.kind === "skill")
        .map((s) => ({
          slug: s.slug,
          title: s.title,
          description: s.description,
          body: s.body,
          updatedAt: s.updatedAt.toISOString(),
        })),
      rules: sorted
        .filter((s) => s.kind === "rule")
        .map((s) => ({
          slug: s.slug,
          title: s.title,
          body: s.body,
          updatedAt: s.updatedAt.toISOString(),
        })),
    });
  }
  return out;
}
