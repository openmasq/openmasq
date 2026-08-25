import { mcpAuthTag, type McpAuthTag } from "@openmasq/catalog/mcp";
import type { McpItem } from "./mcpItems";

/**
 * The auth model of a list ITEM ("Intégré" / "1-clic" / "Clé API" / "OAuth
 * (broker)" / "Local"), derived from the shared catalog tag (rule 9: one source
 * for the fact, shown identically on desktop and in the admin console).
 *
 * A catalogued connector (direct OR the builtin browser) knows its own model; a
 * local stdio server is local by construction; presets/custom servers are remote.
 */
export function authTagOf(item: McpItem): McpAuthTag {
  if (item.kind === "local")
    return {
      kind: "local",
      label: "Local",
      title:
        "Serveur lancé sur votre machine — dossier/identifiants locaux, jamais envoyés au modèle.",
    };
  return item.connector
    ? mcpAuthTag(item.connector)
    : mcpAuthTag({ transport: "remote", auth: item.auth });
}
