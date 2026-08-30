import { NextResponse } from "next/server";

import { captureProjectContinueWork } from "@/lib/ai/continue-project";
import { NoLlmCredentialError } from "@/lib/ai/resolve";
import { getSession } from "@/lib/auth/server";
import { resolveActiveOrg } from "@/lib/orgs/data";
import { getVisibleProject } from "@/lib/projects/data";
import { listProjectThreads } from "@/lib/threads/data";

/**
 * POST /api/projects/[id]/continue
 * Body: { sourceProject?: string }
 *
 * Captures unfinished human objectives across source projects in a visible
 * workgroup, plus a next prompt to continue while they are away.
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

  let sourceProject: string | undefined;
  try {
    const body = (await request.json()) as { sourceProject?: unknown };
    if (typeof body.sourceProject === "string") {
      sourceProject = body.sourceProject;
    }
  } catch {
    // empty body is fine — all source projects
  }

  const threads = await listProjectThreads(project.id, activeOrg.id);

  try {
    const result = await captureProjectContinueWork({
      orgId: activeOrg.id,
      projectName: project.name,
      threads,
      sourceProjectFilter: sourceProject,
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
    console.error("POST /api/projects/[id]/continue", err);
    return NextResponse.json(
      { error: "Couldn't capture continue-work. Try again." },
      { status: 500 },
    );
  }
}
