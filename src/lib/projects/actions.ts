"use server";

import { randomUUID } from "node:crypto";

import { and, eq, inArray } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import { getSession } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import {
  agentThreads,
  projects,
  projectSourceProjects,
  projectThreads,
} from "@/lib/db/schema";
import {
  listMyAvailableProviderProjects,
  markProviderProjectsTracked,
} from "@/lib/integrations/provider-projects-data";
import { resolveActiveOrg } from "@/lib/orgs/data";
import { getVisibleProject } from "@/lib/projects/data";

export type ProjectVisibility = "public" | "private";

export type CreateProjectState =
  { ok: true; id: string } | { ok: false; error: string };

function isVisibility(value: string): value is ProjectVisibility {
  return value === "public" || value === "private";
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);
  return base || "project";
}

/**
 * Create a project owned by the current user.
 * Membership can be explicit agent threads and/or linked source (provider)
 * projects. Threads and source projects are optional — a name is enough.
 */
export async function createProjectAction(
  name: string,
  threadIds: string[],
  visibility: ProjectVisibility = "public",
  sourceProjectIds: string[] = [],
): Promise<CreateProjectState> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in to start a workgroup." };

  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Give your workgroup a name." };
  if (!isVisibility(visibility)) {
    return { ok: false, error: "Pick private or public." };
  }

  const uniqueThreads = Array.from(new Set(threadIds));
  const uniqueSources = Array.from(new Set(sourceProjectIds));

  try {
    const { activeOrg } = await resolveActiveOrg(session.user.id);

    // New projects can only include the creator's own threads (including
    // ones they synced in another org, usually their personal space).
    const validThreads =
      uniqueThreads.length > 0
        ? await db
            .select({ id: agentThreads.id })
            .from(agentThreads)
            .where(
              and(
                eq(agentThreads.ownerUserId, session.user.id),
                inArray(agentThreads.id, uniqueThreads),
              ),
            )
        : [];
    const validThreadIds = validThreads.map((t) => t.id);

    // New projects can only include the creator's own source projects
    // (registered by them, or matching one of their thread contexts).
    const mySources = await listMyAvailableProviderProjects(
      activeOrg.id,
      session.user.id,
    );
    const mySourceIds = new Set(mySources.map((s) => s.id));
    const validSourceIds = uniqueSources.filter((id) => mySourceIds.has(id));

    let slug = slugify(trimmed);
    const existing = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.slug, slug))
      .limit(1);
    if (existing.length > 0) slug = `${slug}-${randomUUID().slice(0, 6)}`;

    const [row] = await db
      .insert(projects)
      .values({
        name: trimmed,
        slug,
        orgId: activeOrg.id,
        ownerUserId: session.user.id,
        visibility,
      })
      .returning({ id: projects.id });

    if (validThreadIds.length > 0) {
      await db.insert(projectThreads).values(
        validThreadIds.map((agentThreadId) => ({
          orgId: activeOrg.id,
          projectId: row.id,
          agentThreadId,
          addedByUserId: session.user.id,
        })),
      );
    }

    if (validSourceIds.length > 0) {
      await db.insert(projectSourceProjects).values(
        validSourceIds.map((availableProviderProjectId) => ({
          orgId: activeOrg.id,
          projectId: row.id,
          availableProviderProjectId,
          addedByUserId: session.user.id,
        })),
      );
      await markProviderProjectsTracked(validSourceIds);
    }

    revalidatePath("/");
    revalidatePath(`/projects/${row.id}`);
    for (const sourceId of validSourceIds) {
      revalidatePath(`/sources/${sourceId}`);
    }
    return { ok: true, id: row.id };
  } catch (err) {
    console.error("createProjectAction", err);
    return { ok: false, error: "Couldn't start the workgroup. Try again." };
  }
}

export type SetProjectVisibilityState =
  { ok: true; visibility: ProjectVisibility } | { ok: false; error: string };

/**
 * Set whether a project the current user owns is private (owner only) or
 * public (visible to every member of the active org).
 */
export async function setProjectVisibilityAction(
  id: string,
  visibility: ProjectVisibility,
): Promise<SetProjectVisibilityState> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in to update visibility." };
  if (!isVisibility(visibility)) {
    return { ok: false, error: "Pick private or public." };
  }

  try {
    const { activeOrg } = await resolveActiveOrg(session.user.id);

    const [row] = await db
      .update(projects)
      .set({ visibility, updatedAt: new Date() })
      .where(
        and(
          eq(projects.id, id),
          eq(projects.orgId, activeOrg.id),
          eq(projects.ownerUserId, session.user.id),
        ),
      )
      .returning({
        id: projects.id,
        visibility: projects.visibility,
      });

    if (!row) return { ok: false, error: "Workgroup not found." };

    revalidatePath("/");
    revalidatePath(`/projects/${id}`);
    return { ok: true, visibility: row.visibility };
  } catch (err) {
    console.error("setProjectVisibilityAction", err);
    return { ok: false, error: "Couldn't update visibility. Try again." };
  }
}

export type RenameProjectState =
  { ok: true; name: string } | { ok: false; error: string };

/** Rename a project the current user owns. */
export async function renameProjectAction(
  id: string,
  name: string,
): Promise<RenameProjectState> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in to rename a workgroup." };

  const trimmed = name.trim();
  if (!trimmed) return { ok: false, error: "Give your workgroup a name." };
  if (trimmed.length > 120) {
    return { ok: false, error: "Keep the name under 120 characters." };
  }

  try {
    const [row] = await db
      .update(projects)
      .set({ name: trimmed, updatedAt: new Date() })
      .where(
        and(eq(projects.id, id), eq(projects.ownerUserId, session.user.id)),
      )
      .returning({ id: projects.id, name: projects.name });

    if (!row) return { ok: false, error: "Workgroup not found." };

    revalidatePath("/");
    revalidatePath(`/projects/${id}`);
    return { ok: true, name: row.name };
  } catch (err) {
    console.error("renameProjectAction", err);
    return { ok: false, error: "Couldn't rename the workgroup. Try again." };
  }
}

export type DeleteProjectState = { ok: true } | { ok: false; error: string };

/** Delete a project the current user owns (thread links cascade away). */
export async function deleteProjectAction(
  id: string,
): Promise<DeleteProjectState> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in to delete a workgroup." };

  try {
    const { activeOrg } = await resolveActiveOrg(session.user.id);

    const [row] = await db
      .delete(projects)
      .where(
        and(
          eq(projects.id, id),
          eq(projects.orgId, activeOrg.id),
          eq(projects.ownerUserId, session.user.id),
        ),
      )
      .returning({ id: projects.id });

    if (!row) return { ok: false, error: "Workgroup not found." };

    revalidatePath("/");
    return { ok: true };
  } catch (err) {
    console.error("deleteProjectAction", err);
    return { ok: false, error: "Couldn't delete the workgroup. Try again." };
  }
}

export type SetProjectThreadsState =
  { ok: true; count: number } | { ok: false; error: string };

/**
 * Replace the current user's agent threads on a visible org project.
 * Other members' thread links are left untouched. Only the caller's own
 * threads are accepted (including ones synced in their personal space);
 * unknown ids are ignored. Source-project links are unchanged (managed
 * separately).
 */
export async function setProjectThreadsAction(
  projectId: string,
  threadIds: string[],
): Promise<SetProjectThreadsState> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in to edit this workgroup." };

  try {
    const { activeOrg } = await resolveActiveOrg(session.user.id);

    const project = await getVisibleProject(
      projectId,
      activeOrg.id,
      session.user.id,
    );
    if (!project) return { ok: false, error: "Workgroup not found." };

    const unique = Array.from(new Set(threadIds));
    const valid = unique.length
      ? await db
          .select({ id: agentThreads.id })
          .from(agentThreads)
          .where(
            and(
              eq(agentThreads.ownerUserId, session.user.id),
              inArray(agentThreads.id, unique),
            ),
          )
      : [];
    const validIds = valid.map((t) => t.id);

    // Only rewrite this user's links (neon-http: keep delete+insert separate).
    const myLinks = await db
      .select({ id: projectThreads.id })
      .from(projectThreads)
      .innerJoin(
        agentThreads,
        eq(agentThreads.id, projectThreads.agentThreadId),
      )
      .where(
        and(
          eq(projectThreads.projectId, projectId),
          eq(agentThreads.ownerUserId, session.user.id),
        ),
      );

    if (myLinks.length > 0) {
      await db.delete(projectThreads).where(
        inArray(
          projectThreads.id,
          myLinks.map((row) => row.id),
        ),
      );
    }
    if (validIds.length > 0) {
      await db.insert(projectThreads).values(
        validIds.map((agentThreadId) => ({
          orgId: activeOrg.id,
          projectId,
          agentThreadId,
          addedByUserId: session.user.id,
        })),
      );
    }

    revalidatePath(`/projects/${projectId}`);
    return { ok: true, count: validIds.length };
  } catch (err) {
    console.error("setProjectThreadsAction", err);
    return {
      ok: false,
      error: "Couldn't update the workgroup threads. Try again.",
    };
  }
}

export type SetProjectSourceProjectsState =
  { ok: true; count: number } | { ok: false; error: string };

/**
 * Replace the current user's source (provider) projects on a visible Penopta
 * project. Other members' source links are left untouched. Only sources the
 * caller can claim (registered by them or matching their threads) are accepted.
 * Matching agent threads are included automatically via virtual membership.
 */
export async function setProjectSourceProjectsAction(
  projectId: string,
  sourceProjectIds: string[],
): Promise<SetProjectSourceProjectsState> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in to edit this workgroup." };

  try {
    const { activeOrg } = await resolveActiveOrg(session.user.id);

    const project = await getVisibleProject(
      projectId,
      activeOrg.id,
      session.user.id,
    );
    if (!project) return { ok: false, error: "Workgroup not found." };

    const unique = Array.from(new Set(sourceProjectIds));
    const mySources = await listMyAvailableProviderProjects(
      activeOrg.id,
      session.user.id,
    );
    const mySourceIds = new Set(mySources.map((s) => s.id));
    const validIds = unique.filter((id) => mySourceIds.has(id));

    // Only rewrite this user's links (same pattern as setProjectThreadsAction).
    const myLinks = await db
      .select({ id: projectSourceProjects.id })
      .from(projectSourceProjects)
      .where(
        and(
          eq(projectSourceProjects.projectId, projectId),
          eq(projectSourceProjects.addedByUserId, session.user.id),
        ),
      );

    if (myLinks.length > 0) {
      await db.delete(projectSourceProjects).where(
        inArray(
          projectSourceProjects.id,
          myLinks.map((row) => row.id),
        ),
      );
    }

    if (validIds.length > 0) {
      // Skip ids already linked by a teammate (unique on project+source).
      const alreadyLinked =
        validIds.length > 0
          ? await db
              .select({
                id: projectSourceProjects.availableProviderProjectId,
              })
              .from(projectSourceProjects)
              .where(
                and(
                  eq(projectSourceProjects.projectId, projectId),
                  inArray(
                    projectSourceProjects.availableProviderProjectId,
                    validIds,
                  ),
                ),
              )
          : [];
      const already = new Set(alreadyLinked.map((row) => row.id));
      const toInsert = validIds.filter((id) => !already.has(id));

      if (toInsert.length > 0) {
        await db.insert(projectSourceProjects).values(
          toInsert.map((availableProviderProjectId) => ({
            orgId: activeOrg.id,
            projectId,
            availableProviderProjectId,
            addedByUserId: session.user.id,
          })),
        );
      }
      await markProviderProjectsTracked(validIds);
    }

    revalidatePath("/");
    revalidatePath(`/projects/${projectId}`);
    for (const sourceId of validIds) {
      revalidatePath(`/sources/${sourceId}`);
    }
    return { ok: true, count: validIds.length };
  } catch (err) {
    console.error("setProjectSourceProjectsAction", err);
    return {
      ok: false,
      error: "Couldn't update source projects. Try again.",
    };
  }
}

export type AddSourceProjectState =
  { ok: true; projectId: string } | { ok: false; error: string };

/**
 * Add one of the caller's source projects to a visible Penopta project and
 * start tracking it. Existing membership (this user and teammates) is left
 * in place.
 */
export async function addSourceProjectToPenoptaProjectAction(
  projectId: string,
  sourceProjectId: string,
): Promise<AddSourceProjectState> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in to edit this workgroup." };

  try {
    const { activeOrg } = await resolveActiveOrg(session.user.id);

    const project = await getVisibleProject(
      projectId,
      activeOrg.id,
      session.user.id,
    );
    if (!project) return { ok: false, error: "Workgroup not found." };

    const mySources = await listMyAvailableProviderProjects(
      activeOrg.id,
      session.user.id,
    );
    if (!mySources.some((source) => source.id === sourceProjectId)) {
      return { ok: false, error: "Source project not found." };
    }

    const [existing] = await db
      .select({ id: projectSourceProjects.id })
      .from(projectSourceProjects)
      .where(
        and(
          eq(projectSourceProjects.projectId, projectId),
          eq(projectSourceProjects.availableProviderProjectId, sourceProjectId),
        ),
      )
      .limit(1);

    if (!existing) {
      await db.insert(projectSourceProjects).values({
        orgId: activeOrg.id,
        projectId,
        availableProviderProjectId: sourceProjectId,
        addedByUserId: session.user.id,
      });
    }

    await markProviderProjectsTracked([sourceProjectId]);

    revalidatePath("/");
    revalidatePath(`/projects/${projectId}`);
    revalidatePath(`/sources/${sourceProjectId}`);
    return { ok: true, projectId };
  } catch (err) {
    console.error("addSourceProjectToPenoptaProjectAction", err);
    return {
      ok: false,
      error: "Couldn't add the source project. Try again.",
    };
  }
}
