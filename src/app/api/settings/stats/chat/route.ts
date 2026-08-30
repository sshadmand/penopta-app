import { after, NextResponse } from "next/server";

import { answerStatsChat } from "@/lib/ai/answer-stats-chat";
import {
  friendlyLlmErrorMessage,
  REVIEW_INTEGRATIONS_META,
  shouldLinkReviewIntegrations,
} from "@/lib/ai/errors";
import { NoLlmCredentialError } from "@/lib/ai/resolve";
import { getSession } from "@/lib/auth/server";
import { resolveActiveOrg } from "@/lib/orgs/data";
import {
  insertStatsChatMessage,
  listStatsChatMessages,
} from "@/lib/stats/chat-data";

/** LLM work continues in `after()` after the client disconnects. */
export const maxDuration = 120;

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

async function completeAssistantTurn(opts: {
  orgId: string;
  ownerUserId: string;
  viewer: { id: string; name?: string | null; email?: string | null };
  text: string;
  timezone: string | undefined;
  userMessageId: string;
}) {
  try {
    const recentChat = await listStatsChatMessages(
      opts.orgId,
      opts.ownerUserId,
    );
    const result = await answerStatsChat({
      orgId: opts.orgId,
      viewer: opts.viewer,
      question: opts.text,
      timezone: opts.timezone,
      recentChat,
      excludeChatMessageId: opts.userMessageId,
    });

    const metaParts = [
      result.provider !== "none"
        ? `${result.provider}/${result.modelId}`
        : null,
    ].filter(Boolean);

    await insertStatsChatMessage({
      orgId: opts.orgId,
      ownerUserId: opts.ownerUserId,
      role: "assistant",
      text: result.text,
      meta: metaParts.join(" · ") || null,
    });
  } catch (err) {
    if (!(err instanceof NoLlmCredentialError)) {
      console.error("POST /api/settings/stats/chat", err);
    }
    await insertStatsChatMessage({
      orgId: opts.orgId,
      ownerUserId: opts.ownerUserId,
      role: "assistant",
      ...llmErrorFields(err),
    });
  }
}

/**
 * GET /api/settings/stats/chat
 * Returns this viewer's stats-page chat for polling after an accepted turn.
 */
export async function GET() {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { activeOrg } = await resolveActiveOrg(session.user.id);
  const messages = await listStatsChatMessages(activeOrg.id, session.user.id);
  return NextResponse.json({ messages });
}

/**
 * POST /api/settings/stats/chat
 * Body: { text: string, timezone?: string }
 *
 * Accepts the user turn immediately (202 + pending) and finishes the LLM
 * reply in `after()`.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session) {
    return NextResponse.json({ error: "Sign in required." }, { status: 401 });
  }

  const { activeOrg } = await resolveActiveOrg(session.user.id);

  let text = "";
  let timezone: string | undefined;
  try {
    const body = (await request.json()) as {
      text?: unknown;
      timezone?: unknown;
    };
    if (typeof body.text === "string") text = body.text.trim();
    if (typeof body.timezone === "string") timezone = body.timezone.trim();
  } catch {
    // handled below
  }
  if (!text) {
    return NextResponse.json({ error: "Message is empty." }, { status: 400 });
  }

  const userMessage = await insertStatsChatMessage({
    orgId: activeOrg.id,
    ownerUserId: session.user.id,
    authorUserId: session.user.id,
    role: "user",
    text,
  });

  after(async () => {
    await completeAssistantTurn({
      orgId: activeOrg.id,
      ownerUserId: session.user.id,
      viewer: session.user,
      text,
      timezone,
      userMessageId: userMessage.id,
    });
  });

  return NextResponse.json(
    { messages: [userMessage], pending: true },
    { status: 202 },
  );
}
