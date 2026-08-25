import { useState } from "react";
import { ModalShell, ModalTitle } from "../../../containers/modals";
import { Btn } from "./McpBtn";
import { McpCustomWarning } from "./parts/McpCustomWarning";

/**
 * "Ajouter un serveur MCP" — the form for a server the app has NOT vetted.
 *
 * The risk is stated in `McpCustomWarning` and acknowledged with a checkbox that GATES
 * the submit: adding one is a deliberate act, not a slip. Everything the form collects
 * is re-decided in main (`mcp/server/customSpec.ts` + the SSRF guard) — the id is minted
 * there and the endpoint validated there, so this component validates only enough to
 * keep the button honest, and shows main's refusal verbatim.
 */
export function McpCustomModal({
  busy,
  onClose,
  onAdd,
}: {
  busy: boolean;
  onClose: () => void;
  /** Resolves to an error message, or null on success (the caller then closes). */
  onAdd: (input: { name: string; url: string; apiKey?: string }) => Promise<string | null>;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const ready = !!name.trim() && !!url.trim() && understood && !busy;

  const submit = async () => {
    if (!ready) return;
    setError(null);
    const message = await onAdd({
      name: name.trim(),
      url: url.trim(),
      apiKey: apiKey.trim() || undefined,
    });
    if (message) setError(message);
    else onClose();
  };

  return (
    <ModalShell onClose={onClose} width="560px">
      <ModalTitle>Ajouter un connecteur personnalisé</ModalTitle>
      <p className="mcp-modal-sub">
        Connectez un service qui n'est pas dans la liste, via son adresse.
      </p>

      <McpCustomWarning />

      <label className="mcp-field-label" htmlFor="mcp-custom-name">
        Nom
      </label>
      <input
        id="mcp-custom-name"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Mon connecteur"
        className="mcp-url-input"
        autoComplete="off"
      />

      <label className="mcp-field-label" htmlFor="mcp-custom-url">
        Adresse du service
      </label>
      <input
        id="mcp-custom-url"
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        placeholder="https://exemple.com/mcp"
        className="mcp-url-input"
        autoComplete="off"
        spellCheck={false}
      />

      <label className="mcp-field-label" htmlFor="mcp-custom-key">
        Clé d'accès <span className="mcp-field-opt">— facultatif</span>
      </label>
      <input
        id="mcp-custom-key"
        type="password"
        value={apiKey}
        onChange={(e) => setApiKey(e.target.value)}
        placeholder="Laissez vide si le service se connecte sans clé"
        className="mcp-url-input"
        autoComplete="off"
      />

      <label className="mcp-custom-ack">
        <input
          type="checkbox"
          checked={understood}
          onChange={(e) => setUnderstood(e.target.checked)}
        />
        <span>
          J'ai compris les risques et je fais confiance à ce service.
        </span>
      </label>

      {error && <p className="mcp-custom-error">{error}</p>}

      <div className="mcp-modal-actions">
        <Btn label="Annuler" onClick={onClose} subtle disabled={busy} />
        <Btn
          label={busy ? "Ajout…" : "Ajouter et connecter"}
          onClick={() => void submit()}
          disabled={!ready}
          loading={busy}
        />
      </div>
    </ModalShell>
  );
}
