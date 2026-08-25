import { Btn } from "../McpBtn";

/**
 * The builtin controllable-browser connector, not yet enabled. Nothing to
 * authenticate — the copy states the two guarantees that make it acceptable:
 * the model only ever sees the page's REDACTED text, and every action is
 * confirmed by the user (the real gates live in the send pipeline and in main;
 * this is the explanation, not the enforcement).
 */
export function McpBrowserBody({ busy, onConnect }: { busy: boolean; onConnect?: () => void }) {
  return (
    <>
      <p className="mcp-modal-note">
        Le navigateur s'ouvre dans une fenêtre dédiée que vous pouvez surveiller. Le modèle
        n'en voit que le texte redacted et chaque action (clic, saisie, navigation) vous est
        confirmée.
      </p>
      <div className="mcp-modal-actions">
        <Btn
          label={busy ? "Activation…" : "Activer"}
          onClick={() => onConnect?.()}
          disabled={busy}
          loading={busy}
        />
      </div>
    </>
  );
}
