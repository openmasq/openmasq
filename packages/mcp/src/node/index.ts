/**
 * Node-only building blocks for a LOCAL MCP host: catching an OAuth redirect on loopback,
 * and keeping what came back encrypted at rest. Kept out of the pure core (`@openmasq/mcp`)
 * and out of the transport entry because they touch `node:fs`, `node:http` and `node:crypto`
 * — a browser consumer must not drag them in.
 */
export { startLoopback, type Loopback, type LoopbackOptions } from "./loopback";
export {
  SecretJsonFile,
  loadKey,
  encrypt,
  decrypt,
} from "./secretFile";
export { McpOAuthStore } from "./oauthStore";
