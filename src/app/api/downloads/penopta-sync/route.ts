import { NextResponse } from "next/server";

import { getPenoptaSyncRelease } from "@/lib/integrations/macos-release";

export const revalidate = 60;

/**
 * Soft-update manifest for the Mac app and the website download button.
 * Served at `/downloads/Penopta-Sync.json` via rewrite. Source of truth is
 * the floating `macos-sync` GitHub Release, not a committed file.
 */
export async function GET() {
  const release = await getPenoptaSyncRelease();
  if (!release) {
    return NextResponse.json({ error: "Not found." }, { status: 404 });
  }
  return NextResponse.json(release, {
    headers: {
      "Cache-Control":
        "public, max-age=60, s-maxage=60, stale-while-revalidate=300",
    },
  });
}
