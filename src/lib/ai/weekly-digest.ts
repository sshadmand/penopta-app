import { and, eq, inArray } from "drizzle-orm";

import { utcIsoWeekKey } from "@/lib/ai/iso-week";
import { rollupWeekFromDailySummaries } from "@/lib/ai/rollup-daily-summaries";
import { NoLlmCredentialError } from "@/lib/ai/resolve";
import { lookupUsers } from "@/lib/auth/users";
import { db } from "@/lib/db/client";
import {
  orgLlmCredentials,
  organizations,
  projects,
  type OrganizationRow,
  type ProjectRow,
} from "@/lib/db/schema";
import { isEmailConfigured } from "@/lib/email/emailer";
import {
  digestSectionsForRecipient,
  sendWeeklyDigestEmail,
  weeklyDigestHasContent,
  type DigestProjectSection,
} from "@/lib/email/weekly-digest";
import { listOrgMembers } from "@/lib/orgs/data";
import { listProjectDailySummariesSince } from "@/lib/projects/chat-data";

export { utcIsoWeekKey } from "@/lib/ai/iso-week";

/** Team orgs that opted in and have at least one LLM key. */
export async function listOrgsForWeeklyDigest(): Promise<OrganizationRow[]> {
  const keyed = await db
    .selectDistinct({ orgId: orgLlmCredentials.orgId })
    .from(orgLlmCredentials);
  if (keyed.length === 0) return [];

  return db
    .select()
    .from(organizations)
    .where(
      and(
        eq(organizations.weeklyDigestEnabled, true),
        eq(organizations.isPersonal, false),
        inArray(
          organizations.id,
          keyed.map((row) => row.orgId),
        ),
      ),
    );
}

export async function setOrgWeeklyDigestEnabled(
  orgId: string,
  enabled: boolean,
): Promise<void> {
  await db
    .update(organizations)
    .set({ weeklyDigestEnabled: enabled, updatedAt: new Date() })
    .where(eq(organizations.id, orgId));
}

async function listOrgProjects(orgId: string): Promise<ProjectRow[]> {
  return db.select().from(projects).where(eq(projects.orgId, orgId));
}

async function markWeekSent(orgId: string, weekKey: string): Promise<void> {
  await db
    .update(organizations)
    .set({ weeklyDigestLastWeekKey: weekKey, updatedAt: new Date() })
    .where(eq(organizations.id, orgId));
}

export type WeeklyDigestRunResult = {
  weekKey: string;
  orgs: number;
  emailed: number;
  skippedDuplicate: number;
  skippedNoActivity: number;
  skippedNoKey: number;
  skippedNoEmail: number;
  skippedPersonal: number;
  failed: number;
};

async function summarizeOrgProjects(
  org: OrganizationRow,
  now: Date,
): Promise<DigestProjectSection[]> {
  const since = new Date(now.getTime() - 7 * 86_400_000);
  const orgProjects = await listOrgProjects(org.id);
  const sections: DigestProjectSection[] = [];

  for (const project of orgProjects) {
    const posts = await listProjectDailySummariesSince({
      projectId: project.id,
      orgId: org.id,
      since,
    });
    if (posts.length === 0) continue;
    const text = await rollupWeekFromDailySummaries({
      orgId: org.id,
      projectName: project.name,
      posts,
    });
    if (!text?.trim()) continue;
    sections.push({
      projectId: project.id,
      projectName: project.name,
      visibility: project.visibility,
      ownerUserId: project.ownerUserId,
      text,
      dailySummaryDates: posts.map((post) => post.createdAt.toISOString()),
    });
  }

  return sections;
}

async function emailOrgDigest(
  org: OrganizationRow,
  sections: DigestProjectSection[],
  now: Date,
): Promise<{ emailed: number; failed: number }> {
  const members = await listOrgMembers(org.id);
  const users = await lookupUsers(members.map((m) => m.userId));
  let emailed = 0;
  let failed = 0;

  for (const member of members) {
    const user = users.get(member.userId);
    const to = user?.email?.trim();
    if (!to) continue;

    const { shared, privateOwn } = digestSectionsForRecipient(
      sections,
      member.userId,
    );
    if (!weeklyDigestHasContent(shared, privateOwn)) continue;

    try {
      const result = await sendWeeklyDigestEmail({
        to,
        orgName: org.name,
        recipientName: user?.name ?? null,
        shared,
        privateOwn,
        activityEndDay: now.toISOString().slice(0, 10),
      });
      if (result.sent) emailed += 1;
    } catch (err) {
      failed += 1;
      console.error(
        `weekly digest email failed org=${org.id} user=${member.userId}`,
        err,
      );
    }
  }

  return { emailed, failed };
}

async function runOneOrg(
  org: OrganizationRow,
  weekKey: string,
  result: WeeklyDigestRunResult,
  force: boolean,
  now: Date,
): Promise<void> {
  if (org.isPersonal) {
    result.skippedPersonal += 1;
    return;
  }

  if (!force && org.weeklyDigestLastWeekKey === weekKey) {
    result.skippedDuplicate += 1;
    return;
  }

  try {
    const sections = await summarizeOrgProjects(org, now);
    if (sections.length === 0) {
      result.skippedNoActivity += 1;
      await markWeekSent(org.id, weekKey);
      return;
    }

    const { emailed, failed } = await emailOrgDigest(org, sections, now);
    result.emailed += emailed;
    result.failed += failed;
    if (emailed === 0 && failed === 0) {
      result.skippedNoActivity += 1;
    }
    if (failed === 0) {
      await markWeekSent(org.id, weekKey);
    }
  } catch (err) {
    if (err instanceof NoLlmCredentialError) {
      result.skippedNoKey += 1;
      return;
    }
    result.failed += 1;
    console.error(`weekly digest failed org=${org.id}`, err);
  }
}

/**
 * Email every teammate in opted-in team orgs a recap of last week's
 * daily summaries. Personal spaces are skipped. Shared (public) projects
 * go to everyone; private projects only go to their owner.
 */
export async function runWeeklyOrgDigests(
  now = new Date(),
  opts?: { orgId?: string; force?: boolean },
): Promise<WeeklyDigestRunResult> {
  const weekKey = utcIsoWeekKey(now);
  const result: WeeklyDigestRunResult = {
    weekKey,
    orgs: 0,
    emailed: 0,
    skippedDuplicate: 0,
    skippedNoActivity: 0,
    skippedNoKey: 0,
    skippedNoEmail: 0,
    skippedPersonal: 0,
    failed: 0,
  };

  if (!isEmailConfigured()) {
    result.skippedNoEmail += 1;
    return result;
  }

  let orgs: OrganizationRow[];
  if (opts?.orgId) {
    const rows = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, opts.orgId))
      .limit(1);
    orgs = rows;
  } else {
    orgs = await listOrgsForWeeklyDigest();
  }

  result.orgs = orgs.length;
  for (const org of orgs) {
    await runOneOrg(org, weekKey, result, opts?.force ?? false, now);
  }
  return result;
}
