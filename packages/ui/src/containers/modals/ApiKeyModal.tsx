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
  saveLabel,
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
  /** A key for this provider is ALREADY saved on this machine. The modal cannot
   *  reread it (it lives encrypted in the privileged process, never handed back to
   *  the renderer) — it can only SAY so, and offer to replace or remove it. Without
   *  this, the same empty modal would open in both cases and there was no way to
   *  tell whether one was adding a key or overwriting one. */
  hasKey?: boolean;
  /** Remove the saved key. Absent ⇒ the action isn't offered. */
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
  // Without a known prefix, we name the provider rather than invent a key shape.
  const placeholder = help?.placeholder ?? t.modals.apiKey.keyPlaceholderFallback(label);

  const connect = async () => {
    if (!onConnect || connecting) return;
    setConnecting(true);
    setConnectError("");
    try {
      if (await onConnect()) onClose();
      else setConnectError(t.modals.apiKey.connectIncomplete);
    } catch {
      setConnectError(t.modals.apiKey.connectUnreachable);
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
        <div className="cv-eyebrow rrm-eyebrow">{t.modals.apiKey.eyebrow}</div>
        <h2 className="cv-display rrm-title">
          {t.modals.apiKey.title("")} <span className="rrm-hl">{label}</span>
        </h2>
        <p className="rrm-sub">
          {t.modals.apiKey.sub}
        </p>
        {hasKey && (
          // What the app can honestly say: that one exists, not which one.
          <p className="akm-has-key">
            <CheckIcon size={14} /> {t.modals.apiKey.alreadySaved(label)}
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
              title={t.modals.apiKey.connectTip(BRAND.name, label)}
            >
              {connecting
                ? t.modals.apiKey.authorizing
                : hasKey
                  ? t.modals.apiKey.getNewKey
                  : t.modals.apiKey.getFreeKey}
            </button>
            {connectError && <p className="akm-connect-error">{connectError}</p>}
            <div className="akm-or">{t.modals.apiKey.orPaste}</div>
          </div>
        )}
        {help && (
          <div className="mcp-apikey-help">
            <div className="mcp-apikey-title">{t.modals.apiKey.whereToFind(label)}</div>
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
                {t.modals.apiKey.getMyKey}
              </a>
            )}
          </div>
        )}
        <div className="field">
          <span className="field-label">
            {t.modals.apiKey.keyLabel(label)}
            {!help && getUrl && (
              <a href={getUrl} target="_blank" rel="noreferrer">
                {t.modals.apiKey.getOne}
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
            <TrashIcon size={14} /> {t.modals.apiKey.removeKey}
          </button>
        )}
        <span className="akm-foot-spacer" />
        <button className="btn-ghost btn-inline" onClick={onClose}>
          {t.common.cancel}
        </button>
        <button
          className="btn-primary btn-inline"
          onClick={save}
          disabled={!value.trim() || saving}
        >
          {hasKey ? t.modals.apiKey.replaceKey : (saveLabel ?? t.modals.apiKey.saveAndSend)}{" "}
          <ArrowRightIcon size={15} />
        </button>
      </div>
    </ModalShell>
  );
}
