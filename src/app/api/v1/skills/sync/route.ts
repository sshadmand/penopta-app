import { NextResponse, type NextRequest } from "next/server";

import { linuxSyncIntegrationsUrl } from "@/lib/host-sync/device";
import { rejectIfRateLimited } from "@/lib/http/rate-limit";
import {
  HostTokenExpiredError,
  resolveOwnerFromRequest,
} from "@/lib/ingest/auth";
import { listSkillDistributionForUser } from "@/lib/skills/distribution";

/**
 * GET /api/v1/skills/sync
 *
 * Active workgroup skills and rules for the caller, with the local project
 * names that should receive them. The sync apps write these into repo
 * folders. Same auth as agent-sync: Bearer (`pat_…`, `pk_…`, `hst_…`) or the
 * Better Auth session cookie (Mac app).
 */
export async function GET(request: NextRequest) {
  const limited = await rejectIfRateLimited(request, "skillsSync");
  if (limited) return limited;

  let owner;
  try {
    owner = await resolveOwnerFromRequest(request.headers.get("authorization"));
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
    return NextResponse.json({ error: "Not signed in." }, { status: 401 });
  }

  try {
    const workgroups = await listSkillDistributionForUser(owner.ownerUserId);
    return NextResponse.json(
      { workgroups },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (err) {
    console.error("GET /api/v1/skills/sync", err);
    return NextResponse.json(
      { error: "Couldn't load skills." },
      { status: 500 },
    );
  }
}
