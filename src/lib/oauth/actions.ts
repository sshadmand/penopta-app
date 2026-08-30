"use server";

import { getSession } from "@/lib/auth/server";
import { getClient, isValidRedirectUri } from "@/lib/oauth/clients";
import { createAuthorizationCode } from "@/lib/oauth/codes";
import { MCP_SCOPE } from "@/lib/oauth/config";

export type ConsentState = {
  error: string | null;
  /**
   * Where the browser should navigate (GET) to hand the code back to the
   * connector. Delivered to the client so it can use `window.location.assign`
   * instead of a server `redirect()` — some MCP clients (e.g. Claude.ai) reject
   * the 307 method-preserving redirect Next.js emits for server actions.
   */
  redirectTo?: string | null;
};

/**
 * Approve the connector: validate everything server-side, mint a single-use
 * authorization code, and return the callback URL for the client to navigate to.
 */
export async function approveAuthorization(
  _prev: ConsentState,
  formData: FormData,
): Promise<ConsentState> {
  const session = await getSession();
  if (!session?.user?.id) {
    return { error: "Your session expired. Please sign in again." };
  }

  const clientId = String(formData.get("client_id") ?? "").trim();
  const redirectUri = String(formData.get("redirect_uri") ?? "").trim();
  const codeChallenge = String(formData.get("code_challenge") ?? "").trim();
  const codeChallengeMethod =
    String(formData.get("code_challenge_method") ?? "S256").trim() || "S256";
  const scope = String(formData.get("scope") ?? MCP_SCOPE).trim() || MCP_SCOPE;
  const state = String(formData.get("state") ?? "").trim();
  const resource = String(formData.get("resource") ?? "").trim();

  if (!clientId || !redirectUri) {
    return { error: "Missing required authorization fields." };
  }

  const client = await getClient(clientId);
  if (!client || !isValidRedirectUri(client, redirectUri)) {
    return { error: "Unrecognized application or redirect URI." };
  }
  if (!codeChallenge || codeChallengeMethod !== "S256") {
    return { error: "This client did not provide a valid PKCE challenge." };
  }

  const code = await createAuthorizationCode({
    clientId,
    userId: session.user.id,
    redirectUri,
    scope,
    resource: resource || null,
    codeChallenge,
    codeChallengeMethod,
  });

  const target = new URL(redirectUri);
  target.searchParams.set("code", code);
  if (state) target.searchParams.set("state", state);
  // Local native clients (Penopta Sync loopback) show who signed in.
  // Keep email off remote redirect URIs so it does not land in third-party logs.
  const isLoopback =
    target.hostname === "127.0.0.1" || target.hostname === "localhost";
  if (isLoopback && session.user.email) {
    target.searchParams.set("email", session.user.email);
  }
  return { error: null, redirectTo: target.toString() };
}
