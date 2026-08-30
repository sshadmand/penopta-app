import {
  MCP_SCOPE,
  authorizationEndpoint,
  issuer,
  mcpResource,
  registrationEndpoint,
  tokenEndpoint,
} from "@/lib/oauth/config";

/** RFC 8414 authorization server metadata. */
export function authorizationServerMetadata() {
  return {
    issuer: issuer(),
    authorization_endpoint: authorizationEndpoint(),
    token_endpoint: tokenEndpoint(),
    registration_endpoint: registrationEndpoint(),
    scopes_supported: [MCP_SCOPE],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    client_id_metadata_document_supported: true,
  };
}

/** RFC 9728 protected resource metadata for the MCP endpoint. */
export function protectedResourceMetadata() {
  return {
    resource: mcpResource(),
    authorization_servers: [issuer()],
    scopes_supported: [MCP_SCOPE],
    bearer_methods_supported: ["header"],
  };
}
