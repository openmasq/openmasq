import { useState } from "react";
import { StatusChip } from "./feedback/StatusChip";
import { captureEvent } from "../analytics";
import type { Settings } from "../types";
import { BRAND } from "@openmasq/branding";

import { useT } from "../i18n";
const NOTICE_KEY = `${BRAND.slug}.analytics.notice`;

/**
 * First-launch privacy notice for the opt-out analytics — a `StatusChip` in the shell's
 * dock: a PERMANENT state (statistics are on until you say otherwise) said in one word,
 * with ONE action behind it (turn them off). It used to be a card of its own
 * (`GdprBanner` from the kit) with a details list, two buttons and a third family of CSS;
 * « un état, une action » is the whole of it.
 *
 * In a packaged build usage stats default ON (privacy-safe: counts/enums only,
 * never content), so we surface a one-time, non-modal chip letting the user
 * disable them right away — the honest thing to do, and good GDPR hygiene. Shown
 * only until the user makes a choice (disable here, or close = keep on).
 * Never shown in dev.
 *
 * ⚠️ COPY IS A TRUST OBLIGATION, and the kit's copy is a MOCK that lies for this
 * product: it claims "Analytics — Aucun. Zéro pixel de suivi." The app DOES ship
 * analytics (PostHog, via a first-party relay) — that is the entire reason this
 * chip exists. We state the truth: what is collected, that it is optional. Never
 * reintroduce "Aucun" / "zéro traçage" here (`leaves.analytics.body`).
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
  // (`usePlatformEffects.ts`: `settings.analyticsConsent ?? true`) — the action is
  // offered only while there is something to turn off, never as a decorative constant.
  const analyticsOn = settings.analyticsConsent ?? true;

  return (
    <StatusChip
      tone="info"
      title={t.leaves.analytics.privacyTitle}
      message={t.leaves.analytics.body(BRAND.name)}
      action={analyticsOn ? { label: t.leaves.analytics.disable, onClick: disable } : undefined}
      onClose={close}
    />
  );
}
