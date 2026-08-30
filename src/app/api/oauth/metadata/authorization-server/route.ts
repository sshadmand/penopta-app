import { NextResponse } from "next/server";

import { authorizationServerMetadata } from "@/lib/oauth/metadata";

export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
};

/** RFC 8414 — served at /.well-known/oauth-authorization-server via rewrite. */
export function GET() {
  return NextResponse.json(authorizationServerMetadata(), { headers: CORS });
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
