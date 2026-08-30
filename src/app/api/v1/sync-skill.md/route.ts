import { NextResponse } from "next/server";

import {
  composeSyncSkill,
  isSyncSkillProvider,
  SYNC_SKILL_PROVIDERS,
} from "@/lib/integrations/skill";

/**
 * Public skill document for the hourly thread-context sync agent.
 * Requires `?provider=chatgpt|claude` and returns the composed markdown.
 */
export async function GET(request: Request) {
  const providerParam = new URL(request.url).searchParams.get("provider");
  if (!providerParam || !isSyncSkillProvider(providerParam)) {
    return NextResponse.json(
      {
        error: "invalid_provider",
        message: `Pass ?provider= one of: ${SYNC_SKILL_PROVIDERS.join(", ")}`,
      },
      { status: 400 },
    );
  }

  const body = await composeSyncSkill(providerParam);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "public, max-age=60",
    },
  });
}
