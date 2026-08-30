import { after, NextResponse } from "next/server";

import { answerProjectChat } from "@/lib/ai/answer-project-chat";
import {
  captureProjectContinueWork,
  continueWorkMetaPrefix,
} from "@/lib/ai/continue-project";
import { utcDayKey } from "@/lib/ai/daily-summary";
import {
  friendlyLlmErrorMessage,
  REVIEW_INTEGRATIONS_META,
  shouldLinkReviewIntegrations,
} from "@/lib/ai/errors";
import { NoLlmCredentialError } from "@/lib/ai/resolve";
import {
  summarizeProjectThreads,
  type ProjectSummaryResult,
} from "@/lib/ai/summarize-project";
import { getSession } from "@/lib/auth/server";
import type { ProjectRow } from "@/lib/db/schema";
import { resolveActiveOrg } from "@/lib/orgs/data";
import {
  ephemeralProjectChatMessage,
  insertProjectChatMessage,
  listProjectChatMessages,
  type ProjectChatMessagePublic,
} from "@/lib/projects/chat-data";
import { getVisibleProject } from "@/lib/projects/data";
import { listProjectThreads } from "@/lib/threads/data";

/** LLM work continues in `after()` after the client disconnects. */
export const maxDuration = 120;

function parseSlashCommand(input: string): {
  name: string;
  arg: string | null;
} | null {
  const trimmed = input.trim();
  if (!trimmed.startsWith("/")) return null;
  const match = /^\/([a-zA-Z]+(?:-[a-zA-Z]+)*)(?:\s+(.+))?$/.exec(trimmed);
  if (!match) return null;
  return { name: match[1].toLowerCase(), arg: match[2]?.trim() || null };
}

function isSummaryCommand(name: string): boolean {
  return name === "summary" || name === "summarize";
}

function isTestSummaryCommand(name: string): boolean {
  return name === "test-summary";
}

function isContinueCommand(name: string): boolean {
  return name === "continue";
}

function isKnownChatCommand(name: string): boolean {
  return (
    isSummaryCommand(name) ||
    isContinueCommand(name) ||
    isTestSummaryCommand(name)
  );
}

function summaryMeta(
  result: ProjectSummaryResult,
  extra: string[] = [],
): string | null {
  const metaParts = [
    result.windowLabel ? `last ${result.windowLabel}` : null,
    `${result.threadCount} thread${result.threadCount === 1 ? "" : "s"}`,
    `${result.messageCount} message${result.messageCount === 1 ? "" : "s"}`,
    result.provider !== "none" ? `${result.provider}/${result.modelId}` : null,
    result.truncated ? "truncated" : null,
    ...extra,
  ].filter(Boolean);
  return metaParts.join(" · ") || null;
}

function llmErrorFields(err: unknown): {
  text: string;
  meta: string | null;
  isError: true;
} {
  if (err instanceof NoLlmCredentialError) {
    return {
      text: err.message,
      meta: REVIEW_INTEGRATIONS_META,
      isError: true,
    };
  }
  return {
    text: friendlyLlmErrorMessage(err),
    meta: shouldLinkReviewIntegrations(err) ? REVIEW_INTEGRATIONS_META : null,
    isError: true,
  };
}

async function insertLlmErrorMessage(opts: {
  orgId: string;
  projectId: string;
  err: unknown;
}): Promise<ProjectChatMessagePublic> {
  if (!(opts.err instanceof NoLlmCredentialError)) {
    console.error("POST /api/projects/[id]/chat", opts.err);
  }
  return insertProjectChatMessage({
    orgId: opts.orgId,
    projectId: opts.projectId,
    role: "assistant",
    ...llmErrorFields(opts.err),
  });
}

/**
 * Undocumented `/test-summary [window]` — same LLM path as `/summary`, but
 * nothing is written. The POST response is the only copy the UI will see.
 */
async function respondWithTestSummary(opts: {
  orgId: string;
  project: ProjectRow;
  text: string;
  window: string | null;
  authorUserId: string;
}): Promise<NextResponse> {
  const userMessage = ephemeralProjectChatMessage({
    role: "user",
    text: opts.text,
    authorUserId: opts.authorUserId,
  });

  try {
    const threads = await listProjectThreads(opts.project.id, opts.orgId);
    const result = await summarizeProjectThreads({
      orgId: opts.orgId,
      projectName: opts.project.name,
      threads,
      window: opts.window,
    });
    const assistantMessage = ephemeralProjectChatMessage({
      role: "assistant",
      text: result.text,
      meta: summaryMeta(result, ["not saved"]),
    });
    return NextResponse.json({ messages: [userMessage, assistantMessage] });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Summary failed.";
    if (/invalid window/i.test(message) || /too large/i.test(message)) {
      return NextResponse.json({
        messages: [
          userMessage,
          ephemeralProjectChatMessage({
            role: "assistant",
            text: message,
            isError: true,
          }),
        ],
      });
    }
    if (!(err instanceof NoLlmCredentialError)) {
      console.error("POST /api/projects/[id]/chat test-summary", err);
    }
    return NextResponse.json({
      messages: [
        userMessage,
        ephemeralProjectChatMessage({
          role: "assistant",
          ...llmErrorFields(err),
        }),
      ],
    });
  }
}

/**
 * Run the LLM turn and persist the assistant message. Scheduled via `after()`
 * so leaving the page does not cancel the work.
 */
async function completeAssistantTurn(opts: {
  orgId: string;
  project: ProjectRow;
  text: string;
  userMessageId: string;
  command: { name: string; arg: string | null } | null;
}) {
  const threads = await listProjectThreads(opts.project.id, opts.orgId);

  if (opts.command && isSummaryCommand(opts.command.name)) {
    try {
      const result = await summarizeProjectThreads({
        orgId: opts.orgId,
        projectName: opts.project.name,
        threads,
        window: opts.command.arg,
      });

      await insertProjectChatMessage({
        orgId: opts.orgId,
        projectId: opts.project.id,
        role: "assistant",
        text: result.text,
        meta: summaryMeta(result),
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Summary failed.";
      if (/invalid window/i.test(message) || /too large/i.test(message)) {
        await insertProjectChatMessage({
          orgId: opts.orgId,
          projectId: opts.project.id,
          role: "assistant",
          text: message,
          isError: true,
        });
        return;
      }
      await insertLlmErrorMessage({
        orgId: opts.orgId,
        projectId: opts.project.id,
        err,
      });
    }
    return;
  }

  if (opts.command && isContinueCommand(opts.command.name)) {
    try {
      const result = await captureProjectContinueWork({
        orgId: opts.orgId,
        projectName: opts.project.name,
        threads,
        sourceProjectFilter: opts.command.arg,
      });

      const metaParts = [
        continueWorkMetaPrefix(utcDayKey()),
        `${result.sourceProjectCount} source project${result.sourceProjectCount === 1 ? "" : "s"}`,
        `${result.threadCount} thread${result.threadCount === 1 ? "" : "s"}`,
        result.provider !== "none"
          ? `${result.provider}/${result.modelId}`
          : null,
        result.truncated ? "truncated" : null,
      ].filter(Boolean);

      await insertProjectChatMessage({
        orgId: opts.orgId,
        projectId: opts.project.id,
        role: "assistant",
        text: result.text,
        meta: metaParts.join(" · ") || null,
      });
    } catch (err) {
      await insertLlmErrorMessage({
        orgId: opts.orgId,
        projectId: opts.project.id,
        err,
      });
    }
    return;
  }

  try {
    const recentChat = await listProjectChatMessages(
      opts.project.id,
      opts.orgId,
    );
    const result = await answerProjectChat({
      orgId: opts.orgId,
      project: opts.project,
      threads,
      recentChat,
      question: opts.text,
      excludeChatMessageId: opts.userMessageId,
    });

    const metaParts = [
      `${result.threadCount} thread${result.threadCount === 1 ? "" : "s"}`,
      result.retrievedThreadCount > 0
        ? `${result.retrievedThreadCount} retrieved`
        : "brief only",
      result.provider !== "none"
        ? `${result.provider}/${result.modelId}`
        : null,
      result.truncated ? "truncated" : null,
    ].filter(Boolean);

    await insertProjectChatMessage({
      orgId: opts.orgId,
      projectId: opts.project.id,
      role: "assistant",
      text: result.text,
      meta: metaParts.join(" · ") || null,
    });
  } catch (err) {
    await insertLlmErrorMessage({
      orgId: opts.orgId,
      projectId: opts.project.id,
      err,
    });
  }
}

/**
 * GET /api/projects/[id]/chat
 * Returns timeline chat messages for polling after an accepted turn.
 */
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { id } = await context.params;
  const { activeOrg } = await resolveActiveOrg(session.user.id);
  const project = await getVisibleProject(id, activeOrg.id, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  const messages = await listProjectChatMessages(project.id, activeOrg.id);
  return NextResponse.json({ messages });
}

/**
 * POST /api/projects/[id]/chat
 * Body: { text: string }
 *
 * Accepts the user turn immediately (202 + pending) and finishes the LLM
 * reply in `after()` so navigation away does not cancel it. Unknown slash
 * commands still reply synchronously. `/test-summary` is also synchronous
 * and never persisted.
 */
export async function POST(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { id } = await context.params;
  const { activeOrg } = await resolveActiveOrg(session.user.id);
  const project = await getVisibleProject(id, activeOrg.id, session.user.id);
  if (!project) {
    return NextResponse.json({ error: "Project not found." }, { status: 404 });
  }

  let text = "";
  try {
    const body = (await request.json()) as { text?: unknown };
    if (typeof body.text === "string") text = body.text.trim();
  } catch {
    // handled below
  }
  if (!text) {
    return NextResponse.json({ error: "Message is empty." }, { status: 400 });
  }

  const command = parseSlashCommand(text);

  if (command && isTestSummaryCommand(command.name)) {
    return respondWithTestSummary({
      orgId: activeOrg.id,
      project,
      text,
      window: command.arg,
      authorUserId: session.user.id,
    });
  }

  const userMessage = await insertProjectChatMessage({
    orgId: activeOrg.id,
    projectId: project.id,
    authorUserId: session.user.id,
    role: "user",
    text,
  });

  if (command && !isKnownChatCommand(command.name)) {
    const assistantMessage = await insertProjectChatMessage({
      orgId: activeOrg.id,
      projectId: project.id,
      role: "assistant",
      text: `Unknown command \`/${command.name}\`. Try a normal question, \`/summary 24h\`, or \`/continue\`.`,
      isError: true,
    });
    return NextResponse.json({ messages: [userMessage, assistantMessage] });
  }

  const summaryCommand =
    command && isSummaryCommand(command.name) ? command : null;
  const continueCommand =
    command && isContinueCommand(command.name) ? command : null;

  after(async () => {
    await completeAssistantTurn({
      orgId: activeOrg.id,
      project,
      text,
      userMessageId: userMessage.id,
      command: summaryCommand ?? continueCommand,
    });
  });

  return NextResponse.json(
    { messages: [userMessage], pending: true },
    { status: 202 },
  );
}
