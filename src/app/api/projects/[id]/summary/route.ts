import { NextResponse } from "next/server";

import { NoLlmCredentialError } from "@/lib/ai/resolve";
import { summarizeProjectThreads } from "@/lib/ai/summarize-project";
import { getSession } from "@/lib/auth/server";
import { resolveActiveOrg } from "@/lib/orgs/data";
import { getVisibleProject } from "@/lib/projects/data";
import { listProjectThreads } from "@/lib/threads/data";

/**
 * POST /api/projects/[id]/summary
 * Body: { window?: "24h" | "7d" | … }
 *
 * Summarizes recent activity across all threads in a visible workgroup
 * using the active org's BYOK LLM credentials.
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

  let window: string | undefined;
  try {
    const body = (await request.json()) as { window?: unknown };
    if (typeof body.window === "string") window = body.window;
  } catch {
    // empty body is fine — default window
  }

  const threads = await listProjectThreads(project.id, activeOrg.id);

  try {
    const result = await summarizeProjectThreads({
      orgId: activeOrg.id,
      projectName: project.name,
      threads,
      window,
    });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof NoLlmCredentialError) {
      return NextResponse.json(
        {
          error: err.message,
          code: "no_llm_credential",
          settingsHref: "/settings/integrations/ai",
        },
        { status: 400 },
      );
    }
    const message = err instanceof Error ? err.message : "Summary failed.";
    if (/invalid window/i.test(message) || /too large/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 400 });
    }
    console.error("POST /api/projects/[id]/summary", err);
    return NextResponse.json(
      { error: "Couldn't generate a summary. Try again." },
      { status: 500 },
    );
  }
}
