import { useState } from "react";
import { ShieldIcon } from "./brand";
import { captureEvent } from "../analytics";
import type { Settings } from "../types";
import { BRAND } from "@openmasq/branding";

import { useT } from "../i18n";
const NOTICE_KEY = `${BRAND.slug}.analytics.notice`;

/**
 * First-launch privacy notice for the opt-out analytics — the design-system
 * chat-app kit's `GdprBanner` treatment (bottom-left card, shield glyph, an
 * expandable "Détails" list), owning its own chrome rather than the shared
 * `Banner`.
 *
 * In a packaged build usage stats default ON (privacy-safe: counts/enums only,
 * never content), so we surface a one-time, non-modal card letting the user
 * disable them right away — the honest thing to do, and good GDPR hygiene. Shown
 * only until the user makes a choice (disable here, or "Compris" = keep on).
 * Never shown in dev.
 *
 * ⚠️ COPY IS A TRUST OBLIGATION, and the kit's copy is a MOCK that lies for this
 * product: it claims "Analytics — Aucun. Zéro pixel de suivi." The app DOES ship
 * analytics (PostHog, via a first-party relay) — that is the entire reason this
 * card exists. We take the kit's design and state the truth: what is collected,
 * that it is optional, and what the current state actually is. Never reintroduce
 * "Aucun" / "zéro traçage" here.
 */
export function AnalyticsNotice({
  settings,
  onChange,
}: {
  settings: Settings;
  onChange: (s: Settings) => void;
}) {
  const t = useT();
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(NOTICE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [details, setDetails] = useState(false);

  // Only in the packaged app, and only before the user has made an explicit choice.
  if (settings.analyticsConsent !== undefined || dismissed) return null;

  const close = () => {
    try {
      localStorage.setItem(NOTICE_KEY, "1");
    } catch {
      /* ignore */
    }
    setDismissed(true);
  };

  const disable = () => {
    // Fires while consent is still on (a final opt-out signal, no PII).
    captureEvent({ name: "analytics_consent", on: false });
    onChange({ ...settings, analyticsConsent: false });
    close();
  };

  // The REAL effective state, resolved exactly as the store does
  // (`usePlatformEffects.ts`: `settings.analyticsConsent ?? true`) — the row must
  // report what is actually happening, not a decorative constant.
  const analyticsOn = settings.analyticsConsent ?? true;

  return (
    <div className="analytics-notice" role="status">
      <div className="ac-card">
        <div className="ac-head">
          <span className="ac-ic">
            <ShieldIcon size={15} />
          </span>
          <span className="ac-title">          {t.leaves.analytics.privacyTitle}
</span>
          <span className="ac-pill">ANONYME</span>
        </div>
        <p className="ac-body">
          Le redaction s'exécute <strong>          {t.leaves.analytics.local}
</strong>, avant tout envoi. {BRAND.name} mesure aussi
          l'usage de l'app avec des statistiques anonymes — jamais vos messages, vos fichiers ni vos
          données sensibles. Elles sont facultatives : vous pouvez les refuser.
        </p>
        {details && (
          <div className="ac-rows">
            <Row label={t.leaves.analytics.essentials} sub={t.leaves.analytics.alwaysOn} on />
            <Row
              label={t.leaves.analytics.usageStats}
              sub={
                analyticsOn
                  ? t.leaves.analytics.statsOn
                  : t.leaves.analytics.statsOff
              }
              on={analyticsOn}
              action={analyticsOn ? { label: t.leaves.analytics.disable, onClick: disable } : undefined}
            />
          </div>
        )}
        <div className="ac-acts">
          <button className="ac-btn primary" onClick={close}>
            Compris
          </button>
          <button className="ac-btn ghost" onClick={() => setDetails((d) => !d)}>
            {details ? "Masquer" : "Détails"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** One data-family row in the "Détails" list: a state dot, a label + description,
 *  and — where the family is refusable — the action that turns it off. */
function Row({
  label,
  sub,
  on,
  action,
}: {
  label: string;
  sub: string;
  on: boolean;
  action?: { label: string; onClick: () => void };
}) {
  return (
    <div className="ac-row">
      <span className={`ac-dot${on ? " on" : ""}`} aria-hidden="true" />
      <div className="ac-row-txt">
        <div className="ac-row-lbl">{label}</div>
        <div className="ac-row-sub">{sub}</div>
      </div>
      {action && (
        <button className="ac-row-act" onClick={action.onClick}>
          {action.label}
        </button>
      )}
    </div>
  );
}
