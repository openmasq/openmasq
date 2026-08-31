import { useEffect, useState } from "react";
import type { SyncHost, SyncStatusSnapshot } from "../../host";
import { syncStatusLine } from "./syncStatusLine";

import { useT } from "../../i18n";
/**
 * Le TÉMOIN d'état de la synchro : l'environnement RÉSOLU (celui de la bascule, jamais
 * déduit du canal — une 0.5.0-staging peut parler à la production, c'est précisément ce
 * que cette carte révèle) et le dernier échange vécu par cette session.
 *
 * Rendue par les DEUX branches de `SyncSection` — paywall comprise : l'environnement
 * n'est pas un secret payant, et un compte gratuit a autant besoin de savoir à qui son
 * app parle. `status` est optionnel sur le Host : absent (aperçu, mobile pas câblé), la
 * carte ne se rend pas — mieux qu'un état inventé.
 */
export function SyncStatusCard({ sync }: { sync: SyncHost }) {
  const t = useT();
  const [status, setStatus] = useState<SyncStatusSnapshot | null>(null);

  useEffect(() => {
    // Même patron que la liste d'appareils : montage + focus fenêtre.
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
