import { useEffect, useState } from "react";
import { RefreshIcon, GridIcon, ArrowRightIcon, EmptyState } from "../../components/brand";
import type { SyncDeviceInfo, SyncHost } from "../../host";
import { SyncStatusCard } from "./SyncStatusCard";
import { SyncPassphraseCard } from "./SyncPassphraseCard";
import { useAppSelector } from "../../state/redux";
import { selectBillingCache } from "../../state/settingsCache";
import { BILLING_CTA } from "../../help";

import { PLATFORM_LABEL, relTime } from "./syncFormat";

/**
 * Settings section for cross-device sync: the E2E passphrase (the key that never
 * leaves the user's devices) + the list of connected devices with revoke. Uses
 * `host.sync`; the caller renders it only when that capability exists.
 *
 * Sync is a PAID feature: a free account sees the premium info container instead of
 * the controls (`onUpgrade` deep-links to the Paiement tab). The gate keys off the
 * billing cache's `loaded` flag so a paid user is never walled while it's still
 * fetching (unknown ⇒ show the controls).
 */
export function SyncSection({ sync, onUpgrade }: { sync: SyncHost; onUpgrade?: () => void }) {
  const { sub, loaded } = useAppSelector(selectBillingCache);
  const isFree = loaded && (sub?.tier ?? "free") === "free";
  const [devices, setDevices] = useState<SyncDeviceInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  useEffect(() => {
    // Rechargée au FOCUS aussi : la liste ne se chargeait qu'au montage, donc « je viens
    // d'installer l'app sur l'autre Mac, je reviens ici » montrait l'ancienne liste tant
    // qu'on ne rouvrait pas les Réglages.
    const refresh = () => void sync.listDevices().then(setDevices).catch(() => setDevices([]));
    refresh();
    window.addEventListener("focus", refresh);
    return () => window.removeEventListener("focus", refresh);
  }, [sync]);

  async function saveName() {
    const name = nameDraft.trim();
    if (!name) return;
    setBusy(true);
    try {
      await sync.setDeviceName(name);
      setRenaming(false);
      setDevices(await sync.listDevices());
    } finally {
      setBusy(false);
    }
  }


  async function revoke(deviceId: string) {
    setBusy(true);
    try {
      await sync.revokeDevice(deviceId);
      setDevices((d) => d.filter((x) => x.deviceId !== deviceId));
    } finally {
      setBusy(false);
    }
  }

  if (isFree) {
    return (
      <section className="settings-section sync-tab">
        <SyncStatusCard sync={sync} />
        <EmptyState
          tone="violet"
          eyebrow="Fonctionnalité payante"
          icon={<RefreshIcon size={26} />}
          title="La synchro, sur tous vos appareils."
          body="Vos règles, votre coffre et votre historique sur tous vos appareils, chiffrés de bout en bout. Inclus dans les offres payantes."
          points={[
            { glyph: "⇄", label: "Multi-appareils en temps réel", tone: "violet" },
            { glyph: "🔒", label: "Chiffré de bout en bout", tone: "sky" },
            { glyph: "★", label: "Inclus dans les abonnements payants", tone: "amber" },
          ]}
          cta={BILLING_CTA.see}
          ctaIcon={<ArrowRightIcon size={16} />}
          onCta={onUpgrade}
        />
      </section>
    );
  }

  return (
    <section className="settings-section sync-tab">
      <div className="cv-eyebrow">Synchronisation</div>

      <SyncPassphraseCard sync={sync} />

      <SyncStatusCard sync={sync} />

      <section>
        <div className="sync-devices-head">
          <div className="cv-eyebrow">Appareils connectés</div>
          <span className="sync-devices-count">
            {devices.length} {devices.length === 1 ? "appareil" : "appareils"}
          </span>
        </div>
        {devices.length === 0 ? (
          <p className="modal-note">
            Aucun autre appareil pour l'instant. Connectez-vous avec la même phrase secrète
            sur un autre appareil pour le voir apparaître ici.
          </p>
        ) : (
          <div className="settings-card clip sync-devices-card">
            {devices.map((d) => {
              const isEditing = d.current && renaming;
              return (
                <div key={d.deviceId} className="sync-device-row">
                  <span className="sync-tile">
                    <GridIcon size={17} />
                  </span>
                  <div className="sync-device-main">
                    {isEditing ? (
                      <div className="sync-pass-row">
                        <input
                          className="sync-pass-input"
                          type="text"
                          autoComplete="off"
                          spellCheck={false}
                          value={nameDraft}
                          onChange={(e) => setNameDraft(e.target.value)}
                        />
                        <button className="primary" disabled={busy || !nameDraft.trim()} onClick={saveName}>
                          OK
                        </button>
                        <button className="link-btn" onClick={() => setRenaming(false)}>
                          Annuler
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="sync-device-name">
                          {d.name || "Appareil"}
                          {d.current && <span className="sync-device-cur">● actuel</span>}
                        </span>
                        <span className="sync-device-meta">
                          {PLATFORM_LABEL[d.platform] ?? (d.platform || "—")} · vu{" "}
                          {relTime(d.lastSeenAt)}
                        </span>
                      </>
                    )}
                  </div>
                  {d.current && !isEditing && (
                    <button
                      className="link-btn"
                      disabled={busy}
                      onClick={() => {
                        setNameDraft(d.name || "");
                        setRenaming(true);
                      }}
                    >
                      Renommer
                    </button>
                  )}
                  {!d.current && (
                    <button className="ghost sync-device-revoke" disabled={busy} onClick={() => revoke(d.deviceId)}>
                      Révoquer
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </section>
  );
}
