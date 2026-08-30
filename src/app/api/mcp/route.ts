import type { AuthInfo } from "@modelcontextprotocol/server";
import { createMcpHandler, withMcpAuth } from "mcp-handler";

import { rejectIfRateLimited } from "@/lib/http/rate-limit";
import type { ApiKeyOwner } from "@/lib/keys/data";
import { resolveOwnerByApiKey } from "@/lib/keys/data";
import { buildPenoptaMcpServer } from "@/lib/mcp/server";
import { PROTECTED_RESOURCE_METADATA_PATH } from "@/lib/oauth/config";
import { hashToken, verifyAccessToken } from "@/lib/oauth/tokens";

/** Owner plus the token hash, so tools can stamp the connection row. */
type McpAuthExtra = ApiKeyOwner & { accessTokenHash?: string };

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Remote MCP server, protected by OAuth 2.1 (the flow ChatGPT/Claude connectors
 * use). `withMcpAuth` verifies the bearer access token and, on failure, returns
 * a 401 with a WWW-Authenticate challenge pointing at our protected-resource
 * metadata. The verified owner (auth user + active org) is read from
 * `request.auth.extra` and every tool is scoped to it.
 *
 * Also accepts user API keys (`pk_…`) so clients that can only send a static
 * Authorization header (e.g. ChatGPT bearer/header config) can still connect
 * when OAuth token binding fails.
 */
const baseHandler = (request: Request) => {
  const extra = request.auth?.extra as McpAuthExtra | undefined;
  const handler = createMcpHandler(
    (server) => {
      if (extra) buildPenoptaMcpServer(server, extra, extra.accessTokenHash);
    },
    { serverInfo: { name: "penopta", version: "1.0.0" } },
  );
  return handler(request);
};

async function verifyToken(
  _request: Request,
  bearerToken?: string,
): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;

  const oauth = await verifyAccessToken(bearerToken);
  if (oauth) {
    return {
      token: bearerToken,
      clientId: oauth.clientId,
      scopes: oauth.scope ? oauth.scope.split(" ") : ["mcp"],
      extra: {
        ownerUserId: oauth.ownerUserId,
        orgId: oauth.orgId,
        accessTokenHash: await hashToken(bearerToken),
      } satisfies McpAuthExtra,
    };
  }

  const apiKeyOwner = await resolveOwnerByApiKey(bearerToken);
  if (!apiKeyOwner) return undefined;

  return {
    token: bearerToken,
    clientId: "penopta-api-key",
    scopes: ["mcp"],
    extra: {
      ownerUserId: apiKeyOwner.ownerUserId,
      orgId: apiKeyOwner.orgId,
    } satisfies McpAuthExtra,
  };
}

const handler = withMcpAuth(baseHandler, verifyToken, {
  required: true,
  resourceMetadataPath: PROTECTED_RESOURCE_METADATA_PATH,
});

async function rateLimitedHandler(request: Request) {
  const limited = await rejectIfRateLimited(request, "mcp");
  if (limited) return limited;
  return handler(request);
}

export {
  rateLimitedHandler as GET,
  rateLimitedHandler as POST,
  rateLimitedHandler as DELETE,
};
