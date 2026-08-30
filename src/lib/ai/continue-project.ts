import { generateText } from "ai";

import { buildContinueWorkContext } from "@/lib/ai/continue-work-context";
import {
  PROJECT_AI_ACCESS_RULES,
  PROJECT_AI_CONTINUE_STYLE_RULES,
  PROJECT_AI_FORMAT_RULES,
  wrapUntrustedBlock,
} from "@/lib/ai/project-ai-guardrails";
import { NoLlmCredentialError, resolveLlmForOrg } from "@/lib/ai/resolve";
import type { AgentThreadRow } from "@/lib/db/schema";
import { listAvailableProviderProjects } from "@/lib/integrations/provider-projects-data";

/** Timeline meta prefix for `/continue` posts (`Continue work · YYYY-MM-DD`). */
export const CONTINUE_WORK_META_PREFIX = "Continue work ·";

export type ProjectContinueWorkResult = {
  text: string;
  sourceProjectCount: number;
  threadCount: number;
  truncated: boolean;
  provider: string;
  modelId: string;
  /** True when there was nothing to continue. */
  empty: boolean;
};

function continueWorkMetaPrefix(dayKey: string): string {
  return `${CONTINUE_WORK_META_PREFIX} ${dayKey}`;
}

export { continueWorkMetaPrefix };

/**
 * Capture what the human is still driving toward across source projects,
 * plus a next prompt an agent could run while they are away.
 * Callers must pass threads already scoped to the project's org.
 */
export async function captureProjectContinueWork(opts: {
  orgId: string;
  projectName: string;
  threads: AgentThreadRow[];
  sourceProjectFilter?: string | null;
}): Promise<ProjectContinueWorkResult> {
  const threads = opts.threads.filter((t) => t.orgId === opts.orgId);
  const catalog = await listAvailableProviderProjects(opts.orgId);
  const catalogEntries = catalog.map((p) => ({
    name: p.name,
    projectId: p.projectId,
  }));

  const context = buildContinueWorkContext({
    projectName: opts.projectName,
    threads,
    catalog: catalogEntries,
    sourceProjectFilter: opts.sourceProjectFilter,
  });

  if (opts.sourceProjectFilter?.trim() && context.sourceProjectCount === 0) {
    const all = buildContinueWorkContext({
      projectName: opts.projectName,
      threads,
      catalog: catalogEntries,
    });
    const available =
      all.sourceProjectLabels.length > 0
        ? all.sourceProjectLabels.join(", ")
        : "none linked";
    return {
      text:
        `No source project matching "${opts.sourceProjectFilter.trim()}". ` +
        `Linked source projects: ${available}.`,
      sourceProjectCount: 0,
      threadCount: 0,
      truncated: false,
      provider: "none",
      modelId: "none",
      empty: true,
    };
  }

  if (context.threadCount === 0) {
    return {
      text: "No linked threads to continue work from in this project.",
      sourceProjectCount: 0,
      threadCount: 0,
      truncated: false,
      provider: "none",
      modelId: "none",
      empty: true,
    };
  }

  let llm;
  try {
    llm = await resolveLlmForOrg(opts.orgId);
  } catch (err) {
    if (err instanceof NoLlmCredentialError) throw err;
    throw err;
  }

  const result = await generateText({
    model: llm.model,
    maxRetries: 0,
    system:
      "You write a continuation brief for one workgroup so work can " +
      "continue while the human is away from the computer. " +
      PROJECT_AI_ACCESS_RULES +
      " " +
      PROJECT_AI_FORMAT_RULES +
      " " +
      PROJECT_AI_CONTINUE_STYLE_RULES +
      " Example of poor output: a recap of what shipped, process narration, " +
      "or restating every thread. " +
      "Example of good output:\n" +
      "## penopta-app\n" +
      "**Objective:** Ship org-scoped project chat that stays cheap.\n" +
      "**Next prompt:** Continue project chat: free-form questions use the " +
      "slim workingState brief plus optional retrieved excerpts. `/summary` " +
      "stays the full dump. No tools. Refuse other-project asks.",
    prompt:
      wrapUntrustedBlock(
        "CONTINUE REQUEST",
        "From the human's unfinished intent, write the continuation brief. " +
          (context.truncated ? "(Some context was truncated for length.)" : ""),
      ) +
      "\n\n" +
      wrapUntrustedBlock("SOURCE PROJECT CONTEXT", context.text),
  });

  const text = result.text.trim();
  const empty =
    text.length === 0 ||
    /no (open |unfinished )?object/i.test(text) ||
    /nothing to continue/i.test(text);

  return {
    text: text || "No open objectives to continue in this project.",
    sourceProjectCount: context.sourceProjectCount,
    threadCount: context.threadCount,
    truncated: context.truncated,
    provider: llm.provider,
    modelId: llm.modelId,
    empty: empty && text.length < 80,
  };
}
