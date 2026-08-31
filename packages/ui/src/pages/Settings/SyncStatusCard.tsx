import { useEffect, useState } from "react";
import type { SyncHost, SyncStatusSnapshot } from "../../host";
import { syncStatusLine } from "./syncStatusLine";

import { useT } from "../../i18n";
/**
 * The sync status WITNESS: the RESOLVED environment (the one the switch set, never
 * inferred from the channel — a 0.5.0-staging build can talk to production, which is
 * exactly what this card reveals) and this session's last actual exchange.
 *
 * Rendered by BOTH branches of `SyncSection` — paywall included: the environment
 * isn't a paid secret, and a free account needs just as much to know who its
 * app is talking to. `status` is optional on the Host: absent (preview, mobile not
 * wired up), the card doesn't render — better than a made-up state.
 */
export function SyncStatusCard({ sync }: { sync: SyncHost }) {
  const t = useT();
  const [status, setStatus] = useState<SyncStatusSnapshot | null>(null);

  useEffect(() => {
    // Same pattern as the device list: mount + window focus.
    const refresh = () => void sync.status?.().then(setStatus).catch(() => setStatus(null));
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [sync]);

  if (!status) return null;
  const line = syncStatusLine(status, t);
  return (
    <div className="settings-card sync-status-card">
      <div className="sync-status-row">
        <span className="cv-eyebrow">{t.syncTab.envEyebrow}</span>
        <span className="sync-status-env">
          {status.env === "production" ? t.syncTab.envProduction : status.env === "staging" ? t.syncTab.envStaging : status.env}
          <code className="sync-status-host">{status.backendHost}</code>
        </span>
      </div>
      <div className="sync-status-row">
        <span className="cv-eyebrow">{t.syncTab.statusEyebrow}</span>
        <span className={`sync-status-line is-${line.tone}`}>{line.text}</span>
      </div>
    </div>
  );
}
