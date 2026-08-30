import { NextResponse, type NextRequest } from "next/server";

import { rejectIfRateLimited } from "@/lib/http/rate-limit";
import { consumeAuthorizationCode } from "@/lib/oauth/codes";
import { issueTokens, rotateRefreshToken } from "@/lib/oauth/tokens";

export const dynamic = "force-dynamic";

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "content-type, authorization",
  "Cache-Control": "no-store",
};

function oauthError(error: string, description: string, status = 400) {
  return NextResponse.json(
    { error, error_description: description },
    { status, headers: CORS },
  );
}

/** Read form-encoded or JSON body params into a flat string map. */
async function readParams(
  request: NextRequest,
): Promise<Record<string, string>> {
  const contentType = request.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    try {
      const json = (await request.json()) as Record<string, unknown>;
      return Object.fromEntries(
        Object.entries(json).map(([k, v]) => [k, String(v ?? "")]),
      );
    } catch {
      return {};
    }
  }
  const form = await request.formData();
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) out[k] = String(v);
  return out;
}

function tokenResponse(tokens: {
  accessToken: string;
  refreshToken: string;
  expiresInSeconds: number;
  scope: string;
}) {
  return NextResponse.json(
    {
      access_token: tokens.accessToken,
      token_type: "Bearer",
      expires_in: tokens.expiresInSeconds,
      refresh_token: tokens.refreshToken,
      scope: tokens.scope,
    },
    { headers: CORS },
  );
}

/** OAuth 2.1 token endpoint: authorization_code and refresh_token grants. */
export async function POST(request: NextRequest) {
  const limited = await rejectIfRateLimited(request, "oauthToken", CORS);
  if (limited) return limited;
  const params = await readParams(request);
  const grantType = params.grant_type;

  if (grantType === "authorization_code") {
    const { code, redirect_uri, client_id, code_verifier } = params;
    if (!code || !redirect_uri || !client_id || !code_verifier) {
      return oauthError(
        "invalid_request",
        "code, redirect_uri, client_id, and code_verifier are required.",
      );
    }

    const result = await consumeAuthorizationCode({
      code,
      clientId: client_id,
      redirectUri: redirect_uri,
      codeVerifier: code_verifier,
    });
    if (!result.ok) return oauthError("invalid_grant", result.error);

    const tokens = await issueTokens({
      clientId: result.row.clientId,
      userId: result.row.userId,
      scope: result.row.scope,
      resource: result.row.resource,
    });
    return tokenResponse(tokens);
  }

  if (grantType === "refresh_token") {
    const { refresh_token, client_id } = params;
    if (!refresh_token || !client_id) {
      return oauthError(
        "invalid_request",
        "refresh_token and client_id are required.",
      );
    }
    const tokens = await rotateRefreshToken(refresh_token, client_id);
    if (!tokens) {
      return oauthError("invalid_grant", "Invalid or expired refresh token.");
    }
    return tokenResponse(tokens);
  }

  return oauthError(
    "unsupported_grant_type",
    "Only authorization_code and refresh_token are supported.",
  );
}

export function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS });
}
