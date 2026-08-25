/**
 * @openmasq/catalog — the SINGLE source of truth for the three governable lists:
 * models, MCP connectors, and redaction categories. Consumed by both the desktop
 * UI (`@openmasq/ui`) and the org admin console (`apps/web`) so the two never
 * drift and org access policy is expressed against the exact same ids.
 *
 * Sub-entries (also importable directly): `./models`, `./mcp`, `./redaction`.
 */
export * from "./models";
export * from "./mcp";
export * from "./redaction";
export * from "./capabilities";
export * from "./flags";
