import { getPublicAppUrl } from "@/lib/integrations/providers";

/**
 * Penopta acts as a minimal OAuth 2.1 authorization server for its MCP endpoint.
 * Human sign-in uses Better Auth (session cookie); this layer only mints
 * MCP-scoped resource tokens bound to the signed-in user's id.
 */

/** The single scope Penopta's MCP resource understands. */
export const MCP_SCOPE = "mcp";

/** Access token lifetime (1 hour). */
export const ACCESS_TOKEN_TTL_MS = 60 * 60 * 1000;
/** Refresh token lifetime (60 days). */
export const REFRESH_TOKEN_TTL_MS = 60 * 24 * 60 * 60 * 1000;
/** Authorization code lifetime (2 minutes). */
export const AUTH_CODE_TTL_MS = 2 * 60 * 1000;

/** Issuer / authorization server identifier (this app's public origin). */
export function issuer(): string {
  return getPublicAppUrl();
}

/** Canonical resource identifier for the MCP endpoint (RFC 8707). */
export function mcpResource(): string {
  return `${getPublicAppUrl()}/api/mcp`;
}

export function authorizationEndpoint(): string {
  return `${getPublicAppUrl()}/oauth/authorize`;
}

export function tokenEndpoint(): string {
  return `${getPublicAppUrl()}/api/oauth/token`;
}

export function registrationEndpoint(): string {
  return `${getPublicAppUrl()}/api/oauth/register`;
}

/** Path where the protected-resource metadata is served (for 401 challenges). */
export const PROTECTED_RESOURCE_METADATA_PATH =
  "/.well-known/oauth-protected-resource";
