import { NextResponse, type NextRequest } from "next/server";

import { linuxSyncIntegrationsUrl } from "@/lib/host-sync/device";
import { touchHostToken } from "@/lib/host-sync/tokens";
import { rejectIfRateLimited } from "@/lib/http/rate-limit";
import {
  HostTokenExpiredError,
  resolveOwnerFromRequest,
} from "@/lib/ingest/auth";
import { DuplicateRunError, ingestAgentSync } from "@/lib/ingest/data";
import { agentSyncPayloadSchema } from "@/lib/ingest/schema";
import {
  catalogProviderForAgent,
  ensureCatalogFromAgentThreads,
} from "@/lib/integrations/provider-projects-data";

/**
 * Ingest a windowed agent thread-context sync.
 *
 * Auth: `Authorization: Bearer <token>` (OAuth `pat_…`, API key `pk_…`, or
 * host token `hst_…`), or the Better Auth session cookie (Mac app, same
 * login as the website). Optional `penopta_user_id` in the body must match
 * the resolved owner when present.
 */
export async function POST(request: NextRequest) {
  const limited = await rejectIfRateLimited(request, "agentSync");
  if (limited) return limited;
  let owner;
  try {
    owner = await resolveOwnerFromRequest(
      request.headers.get("authorization"),
    );
  } catch (err) {
    if (err instanceof HostTokenExpiredError) {
      return NextResponse.json(
        {
          error: "host_token_expired",
          refresh_url: linuxSyncIntegrationsUrl(),
        },
        { status: 401 },
      );
    }
    throw err;
  }
  if (!owner) {
    return NextResponse.json(
      { error: "Not signed in." },
      { status: 401 },
    );
  }
  const { ownerUserId, orgId, hostTokenId } = owner;

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = agentSyncPayloadSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Invalid payload.",
        details: parsed.error.flatten(),
      },
      { status: 400 },
    );
  }

  const payload = parsed.data;
  if (payload.penopta_user_id && payload.penopta_user_id !== ownerUserId) {
    return NextResponse.json(
      { error: "API key does not match penopta_user_id." },
      { status: 403 },
    );
  }

  try {
    const { run, threadsUpserted } = await ingestAgentSync(
      ownerUserId,
      orgId,
      payload,
    );
    if (hostTokenId) {
      await touchHostToken(hostTokenId);
    }
    const catalogProvider = catalogProviderForAgent({
      agentName: payload.agent.name,
      kind: payload.threads[0]?.kind,
    });
    if (catalogProvider) {
      await ensureCatalogFromAgentThreads(ownerUserId, orgId, catalogProvider);
    }
    const checkpoint = run.windowEnd.toISOString();
    return NextResponse.json(
      {
        ok: true,
        runId: run.runId,
        syncRunId: run.id,
        threadsUpserted,
        checkpoint,
        cursor: checkpoint,
      },
      { status: 201 },
    );
  } catch (err) {
    if (err instanceof DuplicateRunError) {
      if (hostTokenId) {
        await touchHostToken(hostTokenId);
      }
      const checkpoint = err.existing.windowEnd.toISOString();
      return NextResponse.json(
        {
          ok: true,
          runId: err.existing.runId,
          syncRunId: err.existing.id,
          duplicate: true,
          checkpoint,
          cursor: checkpoint,
        },
        { status: 200 },
      );
    }
    console.error("POST /api/v1/agent-sync", err);
    return NextResponse.json(
      { error: "Failed to ingest sync payload." },
      { status: 500 },
    );
  }
}
