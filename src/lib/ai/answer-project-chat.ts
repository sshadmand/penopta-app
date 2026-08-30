import { generateText } from "ai";

import { CONTINUE_WORK_META_PREFIX } from "@/lib/ai/continue-project";
import {
  PROJECT_AI_ACCESS_RULES,
  PROJECT_AI_FORMAT_RULES,
  wrapUntrustedBlock,
} from "@/lib/ai/project-ai-guardrails";
import { buildProjectChatContext } from "@/lib/ai/project-chat-context";
import { NoLlmCredentialError, resolveLlmForOrg } from "@/lib/ai/resolve";
import type { AgentThreadRow, ProjectRow } from "@/lib/db/schema";
import {
  getLatestAssistantMessageByMetaPrefix,
  type ProjectChatMessagePublic,
} from "@/lib/projects/chat-data";

export type ProjectChatAnswer = {
  text: string;
  threadCount: number;
  retrievedThreadCount: number;
  truncated: boolean;
  provider: string;
  modelId: string;
};

/**
 * Answer a free-form question about a workgroup using a slim brief
 * (working states + recent chat) plus optional matched thread excerpts.
 * Callers must pass threads/chat already scoped to the visible project + org.
 */
export async function answerProjectChat(opts: {
  orgId: string;
  project: Pick<ProjectRow, "id" | "name" | "summary" | "orgId">;
  threads: AgentThreadRow[];
  recentChat: ProjectChatMessagePublic[];
  question: string;
  excludeChatMessageId?: string;
}): Promise<ProjectChatAnswer> {
  if (opts.project.orgId !== opts.orgId) {
    throw new Error("Project is outside the active organization.");
  }

  // Defense in depth: never feed the model a thread from another workspace.
  const threads = opts.threads.filter((t) => t.orgId === opts.orgId);

  const continueMsg = await getLatestAssistantMessageByMetaPrefix(
    opts.project.id,
    opts.orgId,
    CONTINUE_WORK_META_PREFIX,
  );

  const context = buildProjectChatContext({
    project: opts.project,
    threads,
    recentChat: opts.recentChat,
    question: opts.question,
    excludeChatMessageId: opts.excludeChatMessageId,
    continueWork: continueMsg?.text ?? null,
  });

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
      "You are Penopta's workgroup assistant for a single workgroup in the caller's active organization. " +
      PROJECT_AI_ACCESS_RULES +
      " " +
      PROJECT_AI_FORMAT_RULES +
      " Unless the user asks for greater depth, respond in layman's terms — simply and concisely. " +
      "Do not add filler. Prefer about 4 words where 10 would do, unless more are needed to stay clear. " +
      "When the answer involves complex changes, use examples or before/after language so the change is obvious. " +
      "Prefer short paragraphs and bullets. If the context is incomplete, say what is known and what is missing. " +
      "When helpful, point to thread titles. You may answer anything related to this workgroup " +
      "(status, decisions, blockers, who did what, next steps). " +
      "When a continue-work brief is present, treat it as the current human objectives " +
      "and next prompts — do not recap it unless asked.",
    prompt:
      `Project id: ${opts.project.id}\n` +
      `Project name: ${opts.project.name}\n\n` +
      wrapUntrustedBlock("USER QUESTION", opts.question) +
      "\n\n" +
      (context.truncated
        ? "(Some project context was truncated for length.)\n\n"
        : "") +
      wrapUntrustedBlock("PROJECT CONTEXT", context.text),
  });

  return {
    text: result.text.trim(),
    threadCount: threads.length,
    retrievedThreadCount: context.retrievedThreadCount,
    truncated: context.truncated,
    provider: llm.provider,
    modelId: llm.modelId,
  };
}
