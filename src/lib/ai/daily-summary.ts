import { and, eq, inArray, like } from "drizzle-orm";

import { NoLlmCredentialError } from "@/lib/ai/resolve";
import { summarizeProjectThreads } from "@/lib/ai/summarize-project";
import { db } from "@/lib/db/client";
import {
  orgLlmCredentials,
  organizations,
  projectChatMessages,
  projects,
  type OrganizationRow,
  type ProjectRow,
} from "@/lib/db/schema";
import {
  DAILY_SUMMARY_META_START,
  insertProjectChatMessage,
} from "@/lib/projects/chat-data";
import { listProjectThreads } from "@/lib/threads/data";

/** UTC calendar day key used for idempotency (`YYYY-MM-DD`). */
export function utcDayKey(d = new Date()): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function dailySummaryMetaPrefix(dayKey: string): string {
  return `${DAILY_SUMMARY_META_START}${dayKey}`;
}

/** Orgs that opted into the routine and have at least one LLM key. */
export async function listOrgsForDailySummary(): Promise<OrganizationRow[]> {
  const keyed = await db
    .selectDistinct({ orgId: orgLlmCredentials.orgId })
    .from(orgLlmCredentials);
  if (keyed.length === 0) return [];

  return db
    .select()
    .from(organizations)
    .where(
      and(
        eq(organizations.dailySummaryEnabled, true),
        inArray(
          organizations.id,
          keyed.map((row) => row.orgId),
        ),
      ),
    );
}

export async function listOrgProjects(orgId: string): Promise<ProjectRow[]> {
  return db.select().from(projects).where(eq(projects.orgId, orgId));
}

export async function setOrgDailySummaryEnabled(
  orgId: string,
  enabled: boolean,
): Promise<void> {
  await db
    .update(organizations)
    .set({ dailySummaryEnabled: enabled, updatedAt: new Date() })
    .where(eq(organizations.id, orgId));
}

async function alreadyPostedDailySummary(
  projectId: string,
  dayKey: string,
): Promise<boolean> {
  const rows = await db
    .select({ id: projectChatMessages.id })
    .from(projectChatMessages)
    .where(
      and(
        eq(projectChatMessages.projectId, projectId),
        eq(projectChatMessages.role, "assistant"),
        like(projectChatMessages.meta, `${dailySummaryMetaPrefix(dayKey)}%`),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

export type DailySummaryRunResult = {
  dayKey: string;
  orgs: number;
  considered: number;
  posted: number;
  skippedNoActivity: number;
  skippedDuplicate: number;
  skippedNoKey: number;
  failed: number;
};

/**
 * For every opted-in org with an LLM key, summarize each project’s last 24h
 * and post the result as an assistant chat turn on the project timeline.
 */
export async function runDailyProjectSummaries(
  now = new Date(),
): Promise<DailySummaryRunResult> {
  const dayKey = utcDayKey(now);
  const result: DailySummaryRunResult = {
    dayKey,
    orgs: 0,
    considered: 0,
    posted: 0,
    skippedNoActivity: 0,
    skippedDuplicate: 0,
    skippedNoKey: 0,
    failed: 0,
  };

  const orgs = await listOrgsForDailySummary();
  result.orgs = orgs.length;

  for (const org of orgs) {
    const orgProjects = await listOrgProjects(org.id);
    for (const project of orgProjects) {
      result.considered += 1;

      try {
        if (await alreadyPostedDailySummary(project.id, dayKey)) {
          result.skippedDuplicate += 1;
          continue;
        }

        const threads = await listProjectThreads(project.id, org.id);
        const summary = await summarizeProjectThreads({
          orgId: org.id,
          projectName: project.name,
          threads,
          window: "24h",
        });

        if (summary.threadCount === 0) {
          result.skippedNoActivity += 1;
          continue;
        }

        const metaParts = [
          dailySummaryMetaPrefix(dayKey),
          `last ${summary.windowLabel}`,
          `${summary.threadCount} thread${summary.threadCount === 1 ? "" : "s"}`,
          summary.provider !== "none"
            ? `${summary.provider}/${summary.modelId}`
            : null,
          summary.truncated ? "truncated" : null,
        ].filter(Boolean);

        await insertProjectChatMessage({
          orgId: org.id,
          projectId: project.id,
          role: "assistant",
          text: summary.text,
          meta: metaParts.join(" · "),
          createdAt: now,
        });
        result.posted += 1;
      } catch (err) {
        if (err instanceof NoLlmCredentialError) {
          result.skippedNoKey += 1;
          continue;
        }
        result.failed += 1;
        console.error(
          `daily summary failed org=${org.id} project=${project.id}`,
          err,
        );
      }
    }
  }

  return result;
}
