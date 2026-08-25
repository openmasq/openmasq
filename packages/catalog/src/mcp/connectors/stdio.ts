import type { McpConnector } from "../types";

/**
 * Local stdio servers (vetted allowlist). Ids/display only — the runnable
 * command/args stay in `apps/desktop/src/main/mcp/catalog.ts` (security-critical).
 */
export const STDIO: McpConnector[] = [
  { id: "filesystem", name: "Filesystem", desc: "Lire/écrire des fichiers dans un dossier autorisé (serveur local)", category: "data", tone: "amber", transport: "stdio" },
];
