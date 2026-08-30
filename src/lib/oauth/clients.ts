import { eq } from "drizzle-orm";

import { randomToken } from "@/lib/oauth/pkce";
import { db } from "@/lib/db/client";
import { oauthClients, type OAuthClientRow } from "@/lib/db/schema";

const DEFAULT_GRANT_TYPES = ["authorization_code", "refresh_token"];

export interface ClientRegistration {
  clientName?: string | null;
  redirectUris: string[];
  grantTypes?: string[];
  tokenEndpointAuthMethod?: string;
}

/** Register a new public (PKCE) client via Dynamic Client Registration. */
export async function registerClient(
  input: ClientRegistration,
): Promise<OAuthClientRow> {
  const clientId = `client_${randomToken(24)}`;
  const rows = await db
    .insert(oauthClients)
    .values({
      clientId,
      clientName: input.clientName ?? null,
      redirectUris: input.redirectUris,
      grantTypes: input.grantTypes?.length
        ? input.grantTypes
        : DEFAULT_GRANT_TYPES,
      tokenEndpointAuthMethod: input.tokenEndpointAuthMethod ?? "none",
    })
    .returning();

  const created = rows[0];
  if (!created) throw new Error("Failed to register client");
  return created;
}

async function findClientById(
  clientId: string,
): Promise<OAuthClientRow | null> {
  const rows = await db
    .select()
    .from(oauthClients)
    .where(eq(oauthClients.clientId, clientId))
    .limit(1);
  return rows[0] ?? null;
}

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * Resolve a Client ID Metadata Document (CIMD): the client_id is an HTTPS URL
 * that serves the client's metadata. We fetch it, validate that its `client_id`
 * matches the URL, and cache the record locally. Returns null on any mismatch.
 */
async function resolveCimdClient(
  clientIdUrl: string,
): Promise<OAuthClientRow | null> {
  const cached = await findClientById(clientIdUrl);
  if (cached) return cached;

  let doc: {
    client_id?: string;
    client_name?: string;
    redirect_uris?: string[];
    grant_types?: string[];
    token_endpoint_auth_method?: string;
  };
  try {
    const res = await fetch(clientIdUrl, {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    if (!res.ok) return null;
    doc = await res.json();
  } catch {
    return null;
  }

  if (doc.client_id !== clientIdUrl) return null;
  if (!Array.isArray(doc.redirect_uris) || doc.redirect_uris.length === 0) {
    return null;
  }

  const rows = await db
    .insert(oauthClients)
    .values({
      clientId: clientIdUrl,
      clientName: doc.client_name ?? null,
      redirectUris: doc.redirect_uris,
      grantTypes: doc.grant_types?.length
        ? doc.grant_types
        : DEFAULT_GRANT_TYPES,
      tokenEndpointAuthMethod: doc.token_endpoint_auth_method ?? "none",
      metadataUrl: clientIdUrl,
    })
    .onConflictDoNothing({ target: oauthClients.clientId })
    .returning();

  return rows[0] ?? findClientById(clientIdUrl);
}

/**
 * Look up a client by id. Supports both registered clients (opaque ids) and
 * Client ID Metadata Documents (URL-form ids, fetched + cached on first use).
 */
export async function getClient(
  clientId: string,
): Promise<OAuthClientRow | null> {
  if (isHttpsUrl(clientId)) return resolveCimdClient(clientId);
  return findClientById(clientId);
}

const LOOPBACK_HOSTS = new Set(["127.0.0.1", "[::1]", "::1", "localhost"]);

/** Native apps use loopback redirects with an ephemeral port (RFC 8252 §7.3). */
function isLoopbackUri(url: URL): boolean {
  return url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname);
}

/** Compare two redirect URIs, ignoring the port for loopback addresses. */
function redirectUrisMatch(registered: string, presented: string): boolean {
  if (registered === presented) return true;
  try {
    const a = new URL(registered);
    const b = new URL(presented);
    if (!isLoopbackUri(a) || !isLoopbackUri(b)) return false;
    // Same loopback host + path, port may differ (assigned at launch).
    return a.hostname === b.hostname && a.pathname === b.pathname;
  } catch {
    return false;
  }
}

/**
 * A redirect URI is valid only if it matches one the client registered. Exact
 * match is required, except loopback URIs may vary by port for native apps.
 */
export function isValidRedirectUri(
  client: OAuthClientRow,
  redirectUri: string,
): boolean {
  return client.redirectUris.some((uri) =>
    redirectUrisMatch(uri, redirectUri),
  );
}
