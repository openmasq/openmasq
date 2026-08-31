import type { Messages } from "@openmasq/i18n";
import type { McpAuthTag } from "@openmasq/catalog/mcp";
import { mcpAuthTagCopy } from "../../../help/catalogCopy";
import type { McpItem } from "./mcpItems";

/** L'étiquette d'auth d'une carte — la forme du catalogue, les mots de la langue de `t`. */
export function authTagOf(item: McpItem, t: Messages): McpAuthTag {
  if (item.kind === "local") return { kind: "local", ...t.connectorCatalog.auth.local };
  return item.connector
    ? mcpAuthTagCopy(item.connector, t)
    : mcpAuthTagCopy({ transport: "remote", auth: item.auth }, t);
}
