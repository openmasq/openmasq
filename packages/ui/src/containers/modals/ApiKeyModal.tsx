import { useState } from "react";
import { useT } from "../../i18n";
import { ModalShell } from "./ModalShell";
import { KeyIcon, ArrowRightIcon, CheckIcon, TrashIcon } from "../../components/brand";
import type { ProviderId } from "@openmasq/llm";
import { providerKeyHelp } from "./providerKeyHelp";
import { BRAND } from "@openmasq/branding";

/**
 * Inline API-key entry — opened from the "Clé API manquante" banner so the user
 * can add the missing key without leaving the chat. The value is handed to
 * `onSave` (which writes it encrypted via `host.keys` in main) and never read
 * back. The caller closes the banner and retries the send on save.
 */
export function ApiKeyModal({
  provider,
  label,
  keyUrl,
  onSave,
  onClose,
  onConnect,
  hasKey = false,
  onClear,
  saveLabel = "Enregistrer et envoyer",
}: {
  provider: ProviderId;
  label: string;
  keyUrl?: string;
  onSave: (value: string) => void | Promise<void>;
  onClose: () => void;
  /** OAuth flow that MINTS the key instead of asking for one (OpenRouter's PKCE —
   *  `state/connectOpenRouter.ts`). Offered ABOVE the paste field because it is the
   *  shorter road: nothing to copy, no page to visit. Absent ⇒ paste only. */
  onConnect?: () => Promise<boolean>;
  /** Une clé de ce fournisseur est DÉJÀ enregistrée sur cette machine. La modale ne peut
   *  pas la relire (elle vit chiffrée dans le processus privilégié, jamais rendue au
   *  renderer) — elle peut seulement le DIRE, et proposer de la remplacer ou de la
   *  retirer. Sans ça, la même modale vide s'ouvrait dans les deux cas et on ne savait
   *  pas si l'on était en train d'en ajouter une ou d'en écraser une. */
  hasKey?: boolean;
  /** Retirer la clé enregistrée. Absent ⇒ l'action n'est pas offerte. */
  onClear?: () => void | Promise<void>;
  /** Save-button text. Default fits the missing-key banner (auto-retries send). */
  saveLabel?: string;
}) {
  const t = useT();
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [connectError, setConnectError] = useState("");
  // Detailed per-provider "where to find your key" tutorial (steps + official link +
  // key prefix), like the MCP connector key flow. Falls back to the minimal form +
  // the registry `keyUrl` link for a provider with no documented help.
  const help = providerKeyHelp(provider, t);
  const getUrl = help?.keyUrl ?? keyUrl;
  const placeholder = help?.placeholder ?? "sk-…";

  const connect = async () => {
    if (!onConnect || connecting) return;
    setConnecting(true);
    setConnectError("");
    try {
      if (await onConnect()) onClose();
      else setConnectError("Connexion non terminée. Réessayez — rien n'a été enregistré.");
    } catch {
      setConnectError("Connexion impossible. Réessayez dans un instant.");
    } finally {
      setConnecting(false);
    }
  };

  const save = async () => {
    const v = value.trim();
    if (!v || saving) return;
    setSaving(true);
    try {
      await onSave(v);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <ModalShell onClose={onClose} width="480px">
      <div className="rrm-head">
        <div className="cv-eyebrow rrm-eyebrow">CLÉ D'ACCÈS</div>
        <h2 className="cv-display rrm-title">
          Clé <span className="rrm-hl">{label}</span>
        </h2>
        <p className="rrm-sub">
          Votre clé reste chiffrée sur cette machine, jamais envoyée au modèle.
        </p>
        {hasKey && (
          // Ce que l'app peut honnêtement dire : qu'il y en a une, pas laquelle.
          <p className="akm-has-key">
            <CheckIcon size={14} /> Une clé {label} est déjà enregistrée. En coller une
            nouvelle la remplacera.
          </p>
        )}
      </div>

      <div className="akm-body">
        {onConnect && (
          <div className="akm-connect">
            <button
              type="button"
              className="btn-primary btn-inline akm-connect-btn"
              onClick={() => void connect()}
              disabled={connecting}
              title={`${BRAND.name} se connecte à votre compte ${label} : vos crédits, votre quota.`}
            >
              {connecting
                ? "Autorisation dans votre navigateur…"
                : hasKey
                  ? "Obtenir une nouvelle clé"
                  : "Obtenir une clé gratuitement"}
            </button>
            {connectError && <p className="akm-connect-error">{connectError}</p>}
            <div className="akm-or">ou collez une clé existante</div>
          </div>
        )}
        {help && (
          <div className="mcp-apikey-help">
            <div className="mcp-apikey-title">Où trouver votre clé {label}</div>
            <ol className="mcp-apikey-steps">
              {help.steps?.map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ol>
            {help.note && (
              <div className="mt-2 text-xs text-muted leading-snug">{help.note}</div>
            )}
            {getUrl && (
              <a className="mcp-apikey-link" href={getUrl} target="_blank" rel="noreferrer">
                Obtenir ma clé →
              </a>
            )}
          </div>
        )}
        <div className="field">
          <span className="field-label">
            Clé {label}
            {!help && getUrl && (
              <a href={getUrl} target="_blank" rel="noreferrer">
                en obtenir une ↗
              </a>
            )}
          </span>
          <div className="key-row">
            <span className="akm-key-icon">
              <KeyIcon size={16} />
            </span>
            <input
              type="password"
              placeholder={placeholder}
              value={value}
              autoFocus
              autoComplete="off"
              data-provider={provider}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && save()}
            />
          </div>
        </div>
      </div>

      <div className="confirm-footer">
        {hasKey && onClear && (
          <button
            className="btn-ghost btn-inline akm-clear"
            onClick={() => void Promise.resolve(onClear()).then(onClose)}
          >
            <TrashIcon size={14} /> Retirer la clé
          </button>
        )}
        <span className="akm-foot-spacer" />
        <button className="btn-ghost btn-inline" onClick={onClose}>
          Annuler
        </button>
        <button
          className="btn-primary btn-inline"
          onClick={save}
          disabled={!value.trim() || saving}
        >
          {hasKey ? "Remplacer la clé" : saveLabel} <ArrowRightIcon size={15} />
        </button>
      </div>
    </ModalShell>
  );
}
