import { NextResponse, type NextRequest } from "next/server";

import { rejectIfRateLimited } from "@/lib/http/rate-limit";
import { registerClient } from "@/lib/oauth/clients";

export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization",
};

function isStringArray(value: unknown): value is string[] {
  return (
    Array.isArray(value) && value.every((v) => typeof v === "string" && v.length)
  );
}

/**
 * OAuth 2.0 Dynamic Client Registration (RFC 7591). Connectors that don't use a
 * Client ID Metadata Document register here to obtain a public client_id.
 */
export async function POST(request: NextRequest) {
  const limited = await rejectIfRateLimited(request, "oauthRegister", CORS);
  if (limited) return limited;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(
      { error: "invalid_client_metadata", error_description: "Invalid JSON." },
      { status: 400, headers: CORS },
    );
  }

  const redirectUris = body.redirect_uris;
  if (!isStringArray(redirectUris)) {
    return NextResponse.json(
      {
        error: "invalid_redirect_uri",
        error_description: "redirect_uris is required and must be a non-empty array.",
      },
      { status: 400, headers: CORS },
    );
  }

  const grantTypes = isStringArray(body.grant_types)
    ? body.grant_types
    : undefined;

  const client = await registerClient({
    clientName:
      typeof body.client_name === "string" ? body.client_name : null,
    redirectUris,
    grantTypes,
    tokenEndpointAuthMethod:
      typeof body.token_endpoint_auth_method === "string"
        ? body.token_endpoint_auth_method
        : "none",
  });

  return NextResponse.json(
    {
      client_id: client.clientId,
      client_id_issued_at: Math.floor(client.createdAt.getTime() / 1000),
      client_name: client.clientName ?? undefined,
      redirect_uris: client.redirectUris,
      grant_types: client.grantTypes,
      response_types: ["code"],
      token_endpoint_auth_method: client.tokenEndpointAuthMethod,
    },
    { status: 201, headers: CORS },
  );
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
