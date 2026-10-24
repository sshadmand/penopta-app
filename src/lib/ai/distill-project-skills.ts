import { generateText, Output } from "ai";
import { z } from "zod";

import {
  PROJECT_AI_ACCESS_RULES,
  PROJECT_AI_DISTILL_STYLE_RULES,
  wrapUntrustedBlock,
} from "@/lib/ai/project-ai-guardrails";
import { resolveLlmForOrg } from "@/lib/ai/resolve";
import type {
  AgentThreadRow,
  ProjectRow,
  ProjectSkillEvidence,
} from "@/lib/db/schema";
import {
  normalizeSkillSlug,
  redactSecrets,
  screenSkillDraft,
} from "@/lib/skills/content-filter";
import {
  createProjectSkill,
  listProjectSkills,
  setProjectSkillsDistilledThrough,
  updateProjectSkill,
} from "@/lib/skills/data";
import {
  buildDistillContext,
  formatExistingSkills,
  threadsSinceWatermark,
} from "@/lib/skills/distill-context";

/** Timeline meta prefix for distill posts (`Skills distill · …`). */
export const SKILLS_DISTILL_META_PREFIX = "Skills distill ·";

const MAX_ITEMS_PER_RUN = 5;
const MAX_RULE_CHARS = 300;
const MAX_SKILL_BODY_CHARS = 6_000;
const MAX_EVIDENCE_CHARS = 280;

const distillOutputSchema = z.object({
  items: z
    .array(
      z.object({
        action: z.enum(["new", "update"]),
        kind: z.enum(["skill", "rule"]),
        slug: z
          .string()
          .describe("kebab-case id; for update, the existing item's slug"),
        title: z.string().describe("Skill name, or a 3–6 word rule label"),
        description: z
          .string()
          .describe("Skills: one 'Use when…' line. Rules: empty string."),
        body: z
          .string()
          .describe("Skills: markdown numbered steps. Rules: the rule line."),
        threadRefs: z
          .array(z.string())
          .describe("Thread labels this came from, e.g. ['T2','T5']"),
        evidence: z
          .array(z.object({ threadRef: z.string(), excerpt: z.string() }))
          .describe("Up to 3 short quotes that justify it"),
      }),
    )
    .describe("At most 5 items. Empty when nothing qualifies."),
});

type DistillItem = z.infer<typeof distillOutputSchema>["items"][number];

export type ProjectSkillDistillResult = {
  added: string[];
  updated: string[];
  skipped: { title: string; reason: string }[];
  threadCount: number;
  truncated: boolean;
  provider: string;
  modelId: string;
  /** No new threads since the last run. */
  empty: boolean;
};

function evidenceFor(
  item: DistillItem,
  refs: Map<string, AgentThreadRow>,
): ProjectSkillEvidence[] {
  const out: ProjectSkillEvidence[] = [];
  for (const e of item.evidence.slice(0, 3)) {
    const thread = refs.get(e.threadRef.trim());
    if (!thread) continue;
    const excerpt = redactSecrets(e.excerpt.trim()).text.slice(
      0,
      MAX_EVIDENCE_CHARS,
    );
    if (!excerpt) continue;
    const probe = excerpt.slice(0, 40);
    const match = thread.sourceActivity.find((a) => a.text.includes(probe));
    out.push({
      agentThreadId: thread.id,
      timestamp: match?.timestamp ?? null,
      excerpt,
    });
  }
  return out;
}

/**
 * Read workgroup threads synced since the last distill and save new or
 * updated skills/rules. Items go live immediately, so every AI draft passes
 * the content filter first. Human-edited and turned-off items are never
 * touched. Callers must pass threads already scoped to the project's org.
 */
export async function distillProjectSkills(opts: {
  orgId: string;
  project: ProjectRow;
  threads: AgentThreadRow[];
  /** Ignore the watermark and re-read every linked thread. */
  all?: boolean;
}): Promise<ProjectSkillDistillResult> {
  if (opts.project.orgId !== opts.orgId) {
    throw new Error("Project is not in this organization.");
  }
  const threads = threadsSinceWatermark(
    opts.threads.filter((t) => t.orgId === opts.orgId),
    opts.all ? null : opts.project.skillsDistilledThrough,
  );
  const base = {
    added: [] as string[],
    updated: [] as string[],
    skipped: [] as { title: string; reason: string }[],
    truncated: false,
  };

  if (threads.length === 0) {
    return {
      ...base,
      threadCount: 0,
      provider: "none",
      modelId: "none",
      empty: true,
    };
  }

  const context = buildDistillContext({
    projectName: opts.project.name,
    threads,
  });
  const existing = await listProjectSkills(opts.project.id, opts.orgId);
  const llm = await resolveLlmForOrg(opts.orgId);

  const result = await generateText({
    model: llm.model,
    maxRetries: 0,
    output: Output.object({
      schema: distillOutputSchema,
      name: "workgroup_skills",
    }),
    system:
      "You maintain the shared skills and rules for one workgroup, distilled " +
      "from its agent threads. " +
      PROJECT_AI_ACCESS_RULES +
      " " +
      PROJECT_AI_DISTILL_STYLE_RULES,
    prompt:
      wrapUntrustedBlock(
        "EXISTING SKILLS AND RULES",
        formatExistingSkills(existing),
      ) +
      "\n\n" +
      wrapUntrustedBlock(
        "NEW THREADS",
        context.text +
          (context.truncated
            ? "\n(Some threads were left for the next run.)"
            : ""),
      ),
  });

  const modelLabel = `${llm.provider}/${llm.modelId}`;
  const bySlug = new Map(existing.map((s) => [s.slug, s]));
  const items = (result.output?.items ?? []).slice(0, MAX_ITEMS_PER_RUN);

  for (const item of items) {
    const title = item.title.trim();
    const slug = normalizeSkillSlug(item.slug || title);
    if (!slug || !title || !item.body.trim()) continue;

    const screened = screenSkillDraft({
      title: title.slice(0, 120),
      description:
        item.kind === "rule" ? "" : item.description.trim().slice(0, 300),
      body:
        item.kind === "rule"
          ? item.body.trim().slice(0, MAX_RULE_CHARS)
          : item.body.trim().slice(0, MAX_SKILL_BODY_CHARS),
    });
    if (!screened.ok) {
      base.skipped.push({ title, reason: screened.reason });
      continue;
    }

    const sourceThreadIds = [
      ...new Set(
        item.threadRefs
          .map((ref) => context.threadRefs.get(ref.trim())?.id)
          .filter((id): id is string => Boolean(id)),
      ),
    ];
    const evidence = evidenceFor(item, context.threadRefs);
    const current = bySlug.get(slug);

    if (current) {
      if (current.humanEdited || current.status === "off") {
        base.skipped.push({
          title,
          reason: current.humanEdited ? "edited by a person" : "turned off",
        });
        continue;
      }
      if (current.kind !== item.kind) {
        base.skipped.push({ title, reason: "slug used by another kind" });
        continue;
      }
      const saved = await updateProjectSkill({
        skill: current,
        patch: {
          ...screened.draft,
          sourceThreadIds: [
            ...new Set([...current.sourceThreadIds, ...sourceThreadIds]),
          ].slice(-20),
          evidence: evidence.length > 0 ? evidence : current.evidence,
        },
        updatedByUserId: null,
        model: modelLabel,
      });
      if (saved) base.updated.push(saved.title);
      continue;
    }

    const saved = await createProjectSkill({
      orgId: opts.orgId,
      projectId: opts.project.id,
      kind: item.kind,
      slug,
      ...screened.draft,
      humanEdited: false,
      updatedByUserId: null,
      model: modelLabel,
      sourceThreadIds,
      evidence,
    });
    if (saved) base.added.push(saved.title);
  }

  if (context.includedThrough) {
    await setProjectSkillsDistilledThrough(
      opts.project.id,
      opts.orgId,
      context.includedThrough,
    );
  }

  return {
    ...base,
    truncated: context.truncated,
    threadCount: context.threadCount,
    provider: llm.provider,
    modelId: llm.modelId,
    empty: false,
  };
}

/** Timeline copy for a finished distill run. */
export function formatDistillResult(
  result: ProjectSkillDistillResult,
  projectId: string,
): string {
  if (result.empty) {
    return "No new threads since the last skills distill. Use `/distill all` to re-read every linked thread.";
  }
  const lines: string[] = [];
  if (result.added.length === 0 && result.updated.length === 0) {
    lines.push(
      `Read ${result.threadCount} thread${result.threadCount === 1 ? "" : "s"}; nothing new worth saving as a skill or rule.`,
    );
  }
  if (result.added.length > 0) {
    lines.push(`**Added:** ${result.added.join(", ")}`);
  }
  if (result.updated.length > 0) {
    lines.push(`**Updated:** ${result.updated.join(", ")}`);
  }
  if (result.skipped.length > 0) {
    lines.push(
      `**Left out:** ${result.skipped.map((s) => `${s.title} (${s.reason})`).join(", ")}`,
    );
  }
  if (result.truncated) {
    lines.push("More threads are waiting — run `/distill` again to continue.");
  }
  lines.push(`[Open skills](/projects/${projectId}?view=skills)`);
  return lines.join("\n\n");
}

export function distillMeta(result: ProjectSkillDistillResult): string {
  return [
    SKILLS_DISTILL_META_PREFIX,
    `${result.threadCount} thread${result.threadCount === 1 ? "" : "s"}`,
    result.provider !== "none" ? `${result.provider}/${result.modelId}` : null,
    result.truncated ? "truncated" : null,
  ]
    .filter(Boolean)
    .join(" ");
}
