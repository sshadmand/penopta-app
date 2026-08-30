import { NextResponse } from "next/server";

import { protectedResourceMetadata } from "@/lib/oauth/metadata";

export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

/** RFC 9728 — served at /.well-known/oauth-protected-resource via rewrite. */
export function GET() {
  return NextResponse.json(protectedResourceMetadata(), { headers: CORS });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
