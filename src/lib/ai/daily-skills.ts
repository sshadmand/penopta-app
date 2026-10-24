import { and, eq, inArray } from "drizzle-orm";

import {
  distillMeta,
  distillProjectSkills,
  formatDistillResult,
} from "@/lib/ai/distill-project-skills";
import { NoLlmCredentialError } from "@/lib/ai/resolve";
import { db } from "@/lib/db/client";
import {
  orgLlmCredentials,
  organizations,
  projects,
  type OrganizationRow,
} from "@/lib/db/schema";
import { insertProjectChatMessage } from "@/lib/projects/chat-data";
import { listProjectThreads } from "@/lib/threads/data";

/** Stop starting new projects after this long; the rest run tomorrow. */
const RUN_BUDGET_MS = 240_000;

/** Orgs that turned on the daily distill and have at least one LLM key. */
export async function listOrgsForSkillDistill(): Promise<OrganizationRow[]> {
  const keyed = await db
    .selectDistinct({ orgId: orgLlmCredentials.orgId })
    .from(orgLlmCredentials);
  if (keyed.length === 0) return [];

  return db
    .select()
    .from(organizations)
    .where(
      and(
        eq(organizations.skillDistillEnabled, true),
        inArray(
          organizations.id,
          keyed.map((row) => row.orgId),
        ),
      ),
    );
}

export async function setOrgSkillDistillEnabled(
  orgId: string,
  enabled: boolean,
): Promise<void> {
  await db
    .update(organizations)
    .set({ skillDistillEnabled: enabled, updatedAt: new Date() })
    .where(eq(organizations.id, orgId));
}

export type DailySkillDistillResult = {
  orgs: number;
  considered: number;
  distilled: number;
  changed: number;
  skippedNoNewThreads: number;
  skippedNoKey: number;
  skippedOutOfTime: number;
  failed: number;
};

/**
 * For every opted-in org with an LLM key, distill each workgroup's threads
 * synced since its last distill. Posts a timeline note only when something
 * was added or updated. Oldest-distilled workgroups go first so a run that
 * runs out of time picks up the rest tomorrow.
 */
export async function runDailyProjectSkillDistill(
  started = Date.now(),
): Promise<DailySkillDistillResult> {
  const result: DailySkillDistillResult = {
    orgs: 0,
    considered: 0,
    distilled: 0,
    changed: 0,
    skippedNoNewThreads: 0,
    skippedNoKey: 0,
    skippedOutOfTime: 0,
    failed: 0,
  };

  const orgs = await listOrgsForSkillDistill();
  result.orgs = orgs.length;

  for (const org of orgs) {
    const orgProjects = (
      await db.select().from(projects).where(eq(projects.orgId, org.id))
    ).sort(
      (a, b) =>
        (a.skillsDistilledThrough?.getTime() ?? 0) -
        (b.skillsDistilledThrough?.getTime() ?? 0),
    );

    for (const project of orgProjects) {
      result.considered += 1;
      if (Date.now() - started > RUN_BUDGET_MS) {
        result.skippedOutOfTime += 1;
        continue;
      }

      try {
        const threads = await listProjectThreads(project.id, org.id);
        const distill = await distillProjectSkills({
          orgId: org.id,
          project,
          threads,
        });
        if (distill.empty) {
          result.skippedNoNewThreads += 1;
          continue;
        }
        result.distilled += 1;
        if (distill.added.length + distill.updated.length === 0) continue;

        result.changed += 1;
        await insertProjectChatMessage({
          orgId: org.id,
          projectId: project.id,
          role: "assistant",
          text: formatDistillResult(distill, project.id),
          meta: distillMeta(distill),
        });
      } catch (err) {
        if (err instanceof NoLlmCredentialError) {
          result.skippedNoKey += 1;
          continue;
        }
        result.failed += 1;
        console.error(
          `daily skill distill failed org=${org.id} project=${project.id}`,
          err,
        );
      }
    }
  }

  return result;
}
