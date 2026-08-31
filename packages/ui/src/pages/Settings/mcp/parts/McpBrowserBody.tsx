import { Btn } from "../McpBtn";

import { useT } from "../../../../i18n";
/**
 * The builtin controllable-browser connector, not yet enabled. Nothing to
 * authenticate — the copy states the two guarantees that make it acceptable:
 * the model only ever sees the page's REDACTED text, and every action is
 * confirmed by the user (the real gates live in the send pipeline and in main;
 * this is the explanation, not the enforcement).
 */
export function McpBrowserBody({ busy, onConnect }: { busy: boolean; onConnect?: () => void }) {
  const t = useT();
  return (
    <>
      <p className="mcp-modal-note">{t.mcpTab.browserBody}</p>
      <div className="mcp-modal-actions">
        <Btn
          label={busy ? t.mcpTab.activating : t.mcpTab.activate}
          onClick={() => onConnect?.()}
          disabled={busy}
          loading={busy}
        />
      </div>
    </>
  );
}
