"use server";

import { and, eq } from "drizzle-orm";
import { revalidatePath } from "next/cache";

import {
  distillMeta,
  distillProjectSkills,
  formatDistillResult,
} from "@/lib/ai/distill-project-skills";
import { friendlyLlmErrorMessage } from "@/lib/ai/errors";
import { NoLlmCredentialError } from "@/lib/ai/resolve";
import { getSession } from "@/lib/auth/server";
import { db } from "@/lib/db/client";
import {
  projects,
  type ProjectRow,
  type ProjectSkillKind,
} from "@/lib/db/schema";
import { resolveActiveOrg } from "@/lib/orgs/data";
import { insertProjectChatMessage } from "@/lib/projects/chat-data";
import { getVisibleProject } from "@/lib/projects/data";
import {
  normalizeSkillSlug,
  screenSkillDraft,
} from "@/lib/skills/content-filter";
import {
  createProjectSkill,
  getProjectSkill,
  getSkillRevision,
  listProjectSkills,
  listSkillRevisions,
  updateProjectSkill,
  type ProjectSkillRevisionPublic,
} from "@/lib/skills/data";
import { listProjectThreads } from "@/lib/threads/data";

type ActionResult = { ok: true } | { ok: false; error: string };

const STALE_ERROR = "Someone else changed this just now. Reload and try again.";

async function resolveContext(
  projectId: string,
): Promise<
  | { ok: true; userId: string; orgId: string; project: ProjectRow }
  | { ok: false; error: string }
> {
  const session = await getSession();
  if (!session) return { ok: false, error: "Sign in required." };
  const { activeOrg } = await resolveActiveOrg(session.user.id);
  const project = await getVisibleProject(
    projectId,
    activeOrg.id,
    session.user.id,
  );
  if (!project) return { ok: false, error: "Workgroup not found." };
  return { ok: true, userId: session.user.id, orgId: activeOrg.id, project };
}

function refresh(projectId: string) {
  revalidatePath(`/projects/${projectId}`);
}

export type SkillInput = {
  kind: ProjectSkillKind;
  title: string;
  description: string;
  body: string;
};

/** Create (skillId null) or edit a skill/rule. Edits pin it from AI rewrites. */
export async function saveProjectSkillAction(
  projectId: string,
  skillId: string | null,
  input: SkillInput,
): Promise<ActionResult> {
  const ctx = await resolveContext(projectId);
  if (!ctx.ok) return ctx;

  const kind: ProjectSkillKind = input.kind === "rule" ? "rule" : "skill";
  const title = input.title.trim().slice(0, 120);
  const body = input.body.trim().slice(0, kind === "rule" ? 300 : 6_000);
  const description =
    kind === "rule" ? "" : input.description.trim().slice(0, 300);
  if (!title) return { ok: false, error: "Give it a name." };
  if (!body) {
    return {
      ok: false,
      error: kind === "rule" ? "Write the rule." : "Add the steps.",
    };
  }

  // A person typing it is the consent, so only redact secrets here.
  const screened = screenSkillDraft(
    { title, description, body },
    { rejectUnsafe: false },
  );
  if (!screened.ok) return { ok: false, error: screened.reason };

  if (skillId) {
    const skill = await getProjectSkill(skillId, ctx.project.id, ctx.orgId);
    if (!skill) return { ok: false, error: "Skill not found." };
    const saved = await updateProjectSkill({
      skill,
      patch: { ...screened.draft, humanEdited: true },
      updatedByUserId: ctx.userId,
      model: null,
    });
    if (!saved) return { ok: false, error: STALE_ERROR };
    refresh(ctx.project.id);
    return { ok: true };
  }

  const slug = normalizeSkillSlug(title);
  if (!slug) return { ok: false, error: "Use letters or numbers in the name." };
  const existing = await listProjectSkills(ctx.project.id, ctx.orgId);
  if (existing.some((s) => s.slug === slug)) {
    return { ok: false, error: "Something with that name already exists." };
  }
  const saved = await createProjectSkill({
    orgId: ctx.orgId,
    projectId: ctx.project.id,
    kind,
    slug,
    ...screened.draft,
    humanEdited: true,
    updatedByUserId: ctx.userId,
    model: null,
  });
  if (!saved) {
    return { ok: false, error: "Something with that name already exists." };
  }
  refresh(ctx.project.id);
  return { ok: true };
}

export async function setProjectSkillStatusAction(
  projectId: string,
  skillId: string,
  status: "active" | "off",
): Promise<ActionResult> {
  const ctx = await resolveContext(projectId);
  if (!ctx.ok) return ctx;
  const skill = await getProjectSkill(skillId, ctx.project.id, ctx.orgId);
  if (!skill) return { ok: false, error: "Skill not found." };
  if (skill.status === status) return { ok: true };
  const saved = await updateProjectSkill({
    skill,
    patch: { status },
    updatedByUserId: ctx.userId,
    model: null,
  });
  if (!saved) return { ok: false, error: STALE_ERROR };
  refresh(ctx.project.id);
  return { ok: true };
}

export async function listProjectSkillRevisionsAction(
  projectId: string,
  skillId: string,
): Promise<
  | { ok: true; revisions: ProjectSkillRevisionPublic[] }
  | { ok: false; error: string }
> {
  const ctx = await resolveContext(projectId);
  if (!ctx.ok) return ctx;
  const skill = await getProjectSkill(skillId, ctx.project.id, ctx.orgId);
  if (!skill) return { ok: false, error: "Skill not found." };
  return { ok: true, revisions: await listSkillRevisions(skill.id, ctx.orgId) };
}

/** Copy an older version back in as the newest one. */
export async function restoreProjectSkillRevisionAction(
  projectId: string,
  skillId: string,
  revisionId: string,
): Promise<ActionResult> {
  const ctx = await resolveContext(projectId);
  if (!ctx.ok) return ctx;
  const skill = await getProjectSkill(skillId, ctx.project.id, ctx.orgId);
  if (!skill) return { ok: false, error: "Skill not found." };
  const revision = await getSkillRevision(revisionId, skill.id, ctx.orgId);
  if (!revision) return { ok: false, error: "Version not found." };
  const saved = await updateProjectSkill({
    skill,
    patch: {
      title: revision.title,
      description: revision.description,
      body: revision.body,
      status: revision.status,
      humanEdited: true,
    },
    updatedByUserId: ctx.userId,
    model: null,
  });
  if (!saved) return { ok: false, error: STALE_ERROR };
  refresh(ctx.project.id);
  return { ok: true };
}

/**
 * Owner-only: let sync apps leave this workgroup's skill files out of the
 * repo's local git exclude so the team can commit them.
 */
export async function setSkillsCommitToRepoAction(
  projectId: string,
  commitToRepo: boolean,
): Promise<ActionResult> {
  const ctx = await resolveContext(projectId);
  if (!ctx.ok) return ctx;
  if (ctx.project.ownerUserId !== ctx.userId) {
    return { ok: false, error: "Only the workgroup owner can change this." };
  }
  await db
    .update(projects)
    .set({ skillsCommitToRepo: commitToRepo, updatedAt: new Date() })
    .where(and(eq(projects.id, ctx.project.id), eq(projects.orgId, ctx.orgId)));
  refresh(ctx.project.id);
  return { ok: true };
}

/** Run a distill now and post the result to the workgroup timeline. */
export async function distillProjectSkillsAction(
  projectId: string,
): Promise<{ ok: true; text: string } | { ok: false; error: string }> {
  const ctx = await resolveContext(projectId);
  if (!ctx.ok) return ctx;
  try {
    const threads = await listProjectThreads(ctx.project.id, ctx.orgId);
    const result = await distillProjectSkills({
      orgId: ctx.orgId,
      project: ctx.project,
      threads,
    });
    const text = formatDistillResult(result, ctx.project.id);
    if (!result.empty) {
      await insertProjectChatMessage({
        orgId: ctx.orgId,
        projectId: ctx.project.id,
        role: "assistant",
        text,
        meta: distillMeta(result),
      });
    }
    refresh(ctx.project.id);
    const added = result.added.length;
    const updated = result.updated.length;
    return {
      ok: true,
      text: result.empty
        ? "No new threads since the last distill."
        : added + updated === 0
          ? "Nothing new worth saving."
          : `Added ${added}, updated ${updated}.`,
    };
  } catch (err) {
    if (err instanceof NoLlmCredentialError) {
      return { ok: false, error: err.message };
    }
    console.error("distillProjectSkillsAction", err);
    return { ok: false, error: friendlyLlmErrorMessage(err) };
  }
}
