import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * Apple App Site Association — passkeys in the Mac WKWebView.
 * Served at `/.well-known/apple-app-site-association` via rewrite.
 *
 * Team VM4QWMCW3N + bundle com.penopta.Penopta-Sync.
 */
const ASSOCIATION = {
  webcredentials: {
    apps: ["VM4QWMCW3N.com.penopta.Penopta-Sync"],
  },
};

export function GET() {
  return NextResponse.json(ASSOCIATION, {
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
