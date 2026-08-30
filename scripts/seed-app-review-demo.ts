/**
 * Populate the dedicated App Store reviewer account with clearly marked,
 * synthetic workspace data. Safe to rerun: fixed slugs/thread IDs are
 * updated in place rather than creating duplicate demo records.
 *
 * Run with: npm run app-review:seed:prod
 */
import { createHash } from "node:crypto";

import { eq } from "drizzle-orm";

import { db } from "../src/lib/db/client";
import {
  agentSyncRuns,
  agentThreads,
  organizationMemberships,
  organizations,
  projects,
  projectThreads,
  user,
} from "../src/lib/db/schema";

const REVIEW_EMAIL = "app-review@penopta.com";
const DEMO_PREFIX = "app-review-demo";

function personalSlug(userId: string): string {
  return `personal-${createHash("md5").update(userId).digest("hex").slice(0, 12)}`;
}

async function ensurePersonalOrg(userId: string): Promise<string> {
  const slug = personalSlug(userId);
  const existing = await db
    .select({ id: organizations.id })
    .from(organizations)
    .where(eq(organizations.slug, slug))
    .limit(1);
  const orgId =
    existing[0]?.id ??
    (
      await db
        .insert(organizations)
        .values({
          slug,
          name: "Personal",
          createdByUserId: userId,
          isPersonal: true,
        })
        .onConflictDoNothing({ target: organizations.slug })
        .returning({ id: organizations.id })
    )[0]?.id ??
    (
      await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(eq(organizations.slug, slug))
        .limit(1)
    )[0]?.id;

  if (!orgId)
    throw new Error("Could not create the reviewer personal workspace.");
  await db
    .insert(organizationMemberships)
    .values({ orgId, userId, role: "owner" })
    .onConflictDoNothing({
      target: [organizationMemberships.orgId, organizationMemberships.userId],
    });
  return orgId;
}

const projectDefinitions = [
  {
    slug: `${DEMO_PREFIX}-release-readiness`,
    name: "Demo: Release Readiness",
    summary:
      "Synthetic App Store release planning workspace. It demonstrates thread summaries, decisions, and cross-agent handoffs.",
  },
  {
    slug: `${DEMO_PREFIX}-product-analytics`,
    name: "Demo: Product Analytics",
    summary:
      "Synthetic analytics workspace used to demonstrate activity, token usage, and project-level context.",
  },
] as const;

const filler =
  "This is synthetic App Review demonstration data. The team compared the current implementation against the acceptance criteria, recorded the decision, and identified the next concrete verification step. The example contains no customer content, secrets, or production code. ";

function activity(dayOffset: number, seed: number) {
  const at = new Date(Date.now() - dayOffset * 86_400_000);
  at.setUTCHours(16 + (seed % 5), 10 + seed, 0, 0);
  const timestamp = at.toISOString();
  return [
    {
      timestamp,
      role: "user",
      text: `${filler.repeat(2)}Review the current milestone and call out the highest-confidence next step.`,
      isExact: true,
    },
    {
      timestamp: new Date(at.getTime() + 8 * 60_000).toISOString(),
      role: "assistant",
      text: `${filler.repeat(4)}Decision: keep the scope focused and verify the observed behavior before release.`,
      isExact: true,
    },
    {
      timestamp: new Date(at.getTime() + 17 * 60_000).toISOString(),
      role: "user",
      text: `${filler.repeat(2)}Please summarize the work completed and the remaining risk.`,
      isExact: true,
    },
    {
      timestamp: new Date(at.getTime() + 25 * 60_000).toISOString(),
      role: "assistant",
      text: `${filler.repeat(4)}Completed: the workflow is documented and ready for the final verification pass.`,
      isExact: true,
    },
  ];
}

const threads = [
  [
    "codex",
    "gpt-5.6",
    "Release candidate checklist",
    "Demo: Release Readiness",
    0,
  ],
  [
    "claude",
    "claude-sonnet",
    "Accessibility review and polish",
    "Demo: Release Readiness",
    1,
  ],
  [
    "cursor",
    "cursor-agent",
    "Reviewer sign-in handoff",
    "Demo: Release Readiness",
    2,
  ],
  [
    "codex",
    "gpt-5.6",
    "Privacy metadata verification",
    "Demo: Release Readiness",
    3,
  ],
  [
    "cursor",
    "cursor-agent",
    "Token grid interactions",
    "Demo: Product Analytics",
    0,
  ],
  [
    "claude",
    "claude-sonnet",
    "Weekly usage trends",
    "Demo: Product Analytics",
    2,
  ],
  [
    "codex",
    "gpt-5.6",
    "Project summary improvements",
    "Demo: Product Analytics",
    4,
  ],
  [
    "cursor",
    "cursor-agent",
    "Dashboard filtering pass",
    "Demo: Product Analytics",
    5,
  ],
] as const;

async function main() {
  const reviewer = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.email, REVIEW_EMAIL))
    .limit(1);
  const reviewerId = reviewer[0]?.id;
  if (!reviewerId)
    throw new Error(`Reviewer account ${REVIEW_EMAIL} does not exist.`);

  const orgId = await ensurePersonalOrg(reviewerId);
  const projectByName = new Map<string, string>();
  for (const project of projectDefinitions) {
    const existing = await db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.slug, project.slug))
      .limit(1);
    const id =
      existing[0]?.id ??
      (
        await db
          .insert(projects)
          .values({
            ...project,
            orgId,
            ownerUserId: reviewerId,
            visibility: "public",
          })
          .returning({ id: projects.id })
      )[0]?.id;
    if (!id) throw new Error(`Could not create ${project.name}.`);
    projectByName.set(project.name, id);
  }

  const now = new Date();
  for (let index = 0; index < threads.length; index += 1) {
    const [agentName, agentModel, title, projectName, dayOffset] =
      threads[index]!;
    const runId = `${DEMO_PREFIX}-${agentName}-${index + 1}`;
    const run = await db
      .insert(agentSyncRuns)
      .values({
        orgId,
        ownerUserId: reviewerId,
        schemaVersion: "1.0",
        agentId: `${DEMO_PREFIX}-${agentName}`,
        runId,
        windowStart: new Date(now.getTime() - (dayOffset + 1) * 86_400_000),
        windowEnd: now,
        agentName,
        agentModel,
        agentEffort: "high",
        captureCoverage: {
          enumerationAvailable: true,
          transcriptsAvailable: true,
          limitation: null,
        },
        runSummary: {
          threadsReviewed: 1,
          threadsChanged: 1,
          threadsUnavailable: 0,
          importantUpdates: [
            "Synthetic reviewer demonstration data refreshed.",
          ],
        },
      })
      .onConflictDoUpdate({
        target: [agentSyncRuns.ownerUserId, agentSyncRuns.runId],
        set: { windowEnd: now, createdAt: now },
      })
      .returning({ id: agentSyncRuns.id });
    const runIdDb = run[0]?.id;
    if (!runIdDb) throw new Error(`Could not record ${runId}.`);

    const threadId = `${DEMO_PREFIX}-thread-${index + 1}`;
    const updatedAt = new Date(now.getTime() - dayOffset * 86_400_000);
    const stored = await db
      .insert(agentThreads)
      .values({
        orgId,
        ownerUserId: reviewerId,
        threadId,
        title,
        kind: "codex",
        status: index % 3 === 0 ? "in_progress" : "completed",
        threadCreatedAt: new Date(updatedAt.getTime() - 45 * 60_000),
        threadUpdatedAt: updatedAt,
        projectContext: projectName,
        sourceActivity: activity(dayOffset, index),
        workingState: {
          objective: `Demonstrate ${title.toLowerCase()} in App Review.`,
          statusSummary:
            "Synthetic example with a completed handoff and a clear next action.",
          decisions: ["Keep reviewer data clearly labeled and isolated."],
          completedWork: ["Captured representative coding-agent activity."],
          artifacts: ["Demo workspace", "Token usage activity"],
          openQuestions: ["None — this is a self-contained demo."],
          nextAction: "Open the thread to review its concise summary.",
        },
        lastAgentName: agentName,
        lastAgentModel: agentModel,
        lastAgentEffort: "high",
        lastAgentId: `${DEMO_PREFIX}-${agentName}`,
        lastRunId: runIdDb,
        lastSyncedAt: now,
      })
      .onConflictDoUpdate({
        target: [agentThreads.ownerUserId, agentThreads.threadId],
        set: {
          title,
          status: index % 3 === 0 ? "in_progress" : "completed",
          threadUpdatedAt: updatedAt,
          projectContext: projectName,
          sourceActivity: activity(dayOffset, index),
          workingState: {
            objective: `Demonstrate ${title.toLowerCase()} in App Review.`,
            statusSummary:
              "Synthetic example with a completed handoff and a clear next action.",
            decisions: ["Keep reviewer data clearly labeled and isolated."],
            completedWork: ["Captured representative coding-agent activity."],
            artifacts: ["Demo workspace", "Token usage activity"],
            openQuestions: ["None — this is a self-contained demo."],
            nextAction: "Open the thread to review its concise summary.",
          },
          lastAgentName: agentName,
          lastAgentModel: agentModel,
          lastAgentId: `${DEMO_PREFIX}-${agentName}`,
          lastRunId: runIdDb,
          lastSyncedAt: now,
          updatedAt: now,
        },
      })
      .returning({ id: agentThreads.id });
    const agentThreadId = stored[0]?.id;
    const projectId = projectByName.get(projectName);
    if (!agentThreadId || !projectId)
      throw new Error(`Could not link ${title}.`);
    await db
      .insert(projectThreads)
      .values({ orgId, projectId, agentThreadId, addedByUserId: reviewerId })
      .onConflictDoNothing({
        target: [projectThreads.projectId, projectThreads.agentThreadId],
      });
  }

  console.log(
    "Seeded 2 labeled demo projects and 8 synthetic reviewer threads.",
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
