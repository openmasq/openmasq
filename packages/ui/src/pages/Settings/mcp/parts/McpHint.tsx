import { ShieldIcon } from "../../../../components/brand";
import { authTagOf } from "../mcpAuth";
import { connectorErrorText } from "../connectorErrorText";
import type { McpItem } from "../mcpItems";

import { useT } from "../../../../i18n";
/**
 * The kit's lime privacy block. Two facts, always: HOW this connector
 * authenticates (the shared catalog tag's own explanation — rule 9, no second
 * copy of that sentence), and the standing promise that the redaction covers
 * what is exchanged with it (tool arguments and results go through the same
 * vault as a message — `packages/mcp/src/redact/client.ts`).
 *
 * ⚠️ **On an EXPIRED authorization, the first sentence changes.** It used to be
 * unconditional, so that after « Refresh token is invalid. » the user would read
 * « you accept, and that's it. Nothing to create. » — the sentence for a FIRST connection,
 * right under the notice of a failure (log from 15/08). What they need then isn't
 * how it will work, it's what to do — and above all that « Oublier » is NOT that action.
 * The redaction promise, though, never moves: it holds in both states.
 */
export function McpHint({ item }: { item: McpItem }) {
  const t = useT();
  const expired = item.error ? connectorErrorText(item.error, t)?.reconnect : false;
  return (
    <div className="mcp-hint">
      <span className="mcp-hint-icon" aria-hidden="true">
        <ShieldIcon size={16} />
      </span>
      <p className="mcp-hint-text">
        {expired ? t.mcpTab.reconnectKeepsConfig : authTagOf(item, t).title}{" "}
        {t.mcpTab.maskedAsEverywhere}
      </p>
    </div>
  );
}
