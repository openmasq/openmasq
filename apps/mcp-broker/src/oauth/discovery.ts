import { Router } from "express";
import { brokerUrl, config } from "../config.js";
import { getPlatform } from "../platforms/registry.js";

/**
 * OAuth discovery documents the MCP SDK client fetches:
 *  - RFC 9728 Protected Resource Metadata, per platform, pointing at this AS;
 *  - RFC 8414 Authorization Server Metadata for the broker AS itself.
 */
export const discoveryRouter = Router();

// AS metadata (single shared AS for all platforms).
discoveryRouter.get("/.well-known/oauth-authorization-server", (_req, res) => {
  res.json({
    issuer: config.publicUrl,
    authorization_endpoint: brokerUrl("/oauth/authorize"),
    token_endpoint: brokerUrl("/oauth/token"),
    registration_endpoint: brokerUrl("/oauth/register"),
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
  });
});

// Protected-resource metadata for a platform's MCP endpoint.
discoveryRouter.get("/:platform/.well-known/oauth-protected-resource", (req, res) => {
  const platform = getPlatform(String(req.params.platform));
  if (!platform) {
    res.status(404).json({ error: "unknown_platform" });
    return;
  }
  res.json({
    resource: brokerUrl(`/${platform.id}/mcp`),
    authorization_servers: [config.publicUrl],
  });
});
