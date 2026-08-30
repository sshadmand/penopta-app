import { NextResponse } from "next/server";

import { linuxInstallScript } from "@/lib/host-sync/install-script";

export const dynamic = "force-dynamic";

/** Stable URL: `curl -fsSL https://app.penopta.com/install-sync.sh | sh` */
export async function GET() {
  return new NextResponse(linuxInstallScript(), {
    status: 200,
    headers: {
      "Content-Type": "text/x-shellscript; charset=utf-8",
      "Cache-Control": "no-store",
      "Content-Disposition": "inline; filename=install-sync.sh",
    },
  });
}
