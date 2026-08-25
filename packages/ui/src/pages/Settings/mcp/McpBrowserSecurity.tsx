import { useEffect, useState } from "react";
import { Switch, LayoutSplitIcon, LockIcon } from "../../../components/brand";
import { normalizeDomain } from "../../../state/browserPolicy";
import { captureEvent } from "../../../analytics";
import type { Settings } from "../../../types";

/**
 * Agent-browser prompt-injection hardening (desktop only). Two controls:
 *  - READ-ONLY (recherche = lecture seule): withholds the browser's write tools
 *    from the model, so an injected page can't make it act in an authenticated SaaS.
 *  - DOMAIN ALLOW-LIST: the model may only navigate to the listed domains
 *    (subdomains included). Empty = unrestricted. The human URL bar is unaffected.
 * Both are damage-limiters, not an immunity claim.
 */
export function McpBrowserSecurity({
  settings,
  setSettings,
}: {
  settings: Settings;
  setSettings: (updater: (s: Settings) => Settings) => void;
}) {
  const readOnly = !!settings.browserReadOnly;
  const [domainsText, setDomainsText] = useState((settings.browserAllowedDomains ?? []).join("\n"));
  // Resync when `browserAllowedDomains` changes UNDER us (account switch, the async DB
  // hydrate) — the one settings field on this page that wasn't wired through
  // `useSettingsDraft`'s two-way binding, so it kept showing stale text after a fast
  // account switch and a blur would silently overwrite the freshly-loaded value with it.
  useEffect(() => {
    setDomainsText((settings.browserAllowedDomains ?? []).join("\n"));
  }, [settings.browserAllowedDomains]);

  const commitDomains = (text: string) => {
    const seen = new Set<string>();
    const uniq = text
      .split(/[\n,]/)
      .map(normalizeDomain)
      .filter((d) => d && !seen.has(d) && (seen.add(d), true));
    setSettings((s) => ({ ...s, browserAllowedDomains: uniq }));
  };

  return (
    <section className="settings-section">
      <div className="cv-eyebrow">Sécurité du navigateur agent</div>
      <div className="settings-card">
        <div className="toggle-row">
          <span className="row-icon tone-coral">
            <LayoutSplitIcon size={16} />
          </span>
          <div className="row-body">
            <div className="row-title">Lecture seule (recherche)</div>
            <div className="row-desc">
              Le navigateur ne peut que naviguer et lire — clic, saisie et envoi de
              formulaire sont retirés du modèle. Neutralise les actions qu'une page
              malveillante tenterait d'injecter.
            </div>
          </div>
          <Switch
            checked={readOnly}
            onChange={(v) => {
              captureEvent({ name: "setting_changed", key: "browserReadOnly" });
              setSettings((s) => ({ ...s, browserReadOnly: v }));
            }}
          />
        </div>

        <div className="toggle-row toggle-row-stack">
          <span className="row-icon tone-azure">
            <LockIcon size={16} />
          </span>
          <div className="row-body">
            <div className="row-title">Domaines autorisés</div>
            <div className="row-desc">
              Si renseigné, le modèle ne peut naviguer QUE vers ces domaines (sous-domaines
              inclus) ; tout le reste est refusé. Un domaine par ligne. Laisser vide = aucune
              restriction. La barre d'adresse manuelle n'est jamais restreinte.
            </div>
            <textarea
              className="mcp-allowlist"
              value={domainsText}
              spellCheck={false}
              rows={3}
              placeholder={"github.com\nnotion.so\nmon-crm.exemple.fr"}
              onChange={(e) => setDomainsText(e.target.value)}
              onBlur={(e) => commitDomains(e.target.value)}
              aria-label="Domaines autorisés pour le navigateur agent"
            />
          </div>
        </div>
      </div>
    </section>
  );
}
