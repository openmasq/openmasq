import type { Messages } from "@openmasq/i18n";
import type { McpAuthTag } from "@openmasq/catalog/mcp";
import { mcpAuthTagCopy } from "../../../help/catalogCopy";
import type { McpItem } from "./mcpItems";

/** A card's auth label — the catalogue's shape, the words in `t`'s language. */
export function authTagOf(item: McpItem, t: Messages): McpAuthTag {
  if (item.kind === "local") return { kind: "local", ...t.connectorCatalog.auth.local };
  return item.connector
    ? mcpAuthTagCopy(item.connector, t)
    : mcpAuthTagCopy({ transport: "remote", auth: item.auth }, t);
}
