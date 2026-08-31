import { useEffect, useState } from "react";
import { RefreshIcon, GridIcon, ArrowRightIcon, EmptyState } from "../../components/brand";
import type { SyncDeviceInfo, SyncHost } from "../../host";
import { SyncStatusCard } from "./SyncStatusCard";
import { SyncPassphraseCard } from "./SyncPassphraseCard";
import { useAppSelector } from "../../state/redux";
import { selectBillingCache } from "../../state/settingsCache";
import { knownTier } from "../../state/billing";
import { subscriptionsSold } from "../../send/platformAccess";

import { platformLabel, relTime } from "./syncFormat";

import { useT } from "../../i18n";
/**
 * Settings section for cross-device sync: the E2E passphrase (the key that never
 * leaves the user's devices) + the list of connected devices with revoke. Uses
 * `host.sync`; the caller renders it only when that capability exists.
 *
 * Sync is a PAID feature ONLY in a build that sells subscriptions (`subscriptionsSold`,
 * off by default — then it is simply included with the account): there, a KNOWN free
 * tier sees the premium info container instead of the controls (`onUpgrade` deep-links
 * to the Paiement tab). Unknown (still fetching, no `billing` host, a failed fetch —
 * `knownTier` reads all three as null) never walls anyone: unknown ⇒ show the controls.
 */
export function SyncSection({ sync, onUpgrade }: { sync: SyncHost; onUpgrade?: () => void }) {
  const t = useT();
  const { sub, loaded } = useAppSelector(selectBillingCache);
  const isFree = subscriptionsSold() && loaded && knownTier(sub) === "free";
  const [devices, setDevices] = useState<SyncDeviceInfo[]>([]);
  const [busy, setBusy] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  useEffect(() => {
    // Reloaded on FOCUS too: the list only loaded on mount, so "I just installed
    // the app on the other Mac, I'm coming back here" showed the old list until
    // Settings was reopened.
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
          eyebrow={t.syncTab.paidEyebrow}
          icon={<RefreshIcon size={26} />}
          title={t.syncTab.paidTitle}
          body={t.syncTab.paidBody}
          points={[
            { glyph: "⇄", label: t.syncTab.paidPoint1, tone: "violet" },
            { glyph: "🔒", label: t.syncTab.paidPoint2, tone: "sky" },
            { glyph: "★", label: t.syncTab.paidPoint3, tone: "amber" },
          ]}
          cta={t.billing.ctaSee}
          ctaIcon={<ArrowRightIcon size={16} />}
          onCta={onUpgrade}
        />
      </section>
    );
  }

  return (
    <section className="settings-section sync-tab">
      <div className="cv-eyebrow">{t.syncTab.eyebrow}</div>

      <SyncPassphraseCard sync={sync} />

      <SyncStatusCard sync={sync} />

      <section>
        <div className="sync-devices-head">
          <div className="cv-eyebrow">{t.syncTab.devicesEyebrow}</div>
          <span className="sync-devices-count">
            {t.syncTab.deviceCount(devices.length)}
          </span>
        </div>
        {devices.length === 0 ? (
          <p className="modal-note">
            {t.syncTab.noDevices}
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
                          {t.syncTab.ok}
                        </button>
                        <button className="link-btn" onClick={() => setRenaming(false)}>
                          {t.syncTab.cancel}
                        </button>
                      </div>
                    ) : (
                      <>
                        <span className="sync-device-name">
                          {d.name || t.syncTab.device}
                          {d.current && <span className="sync-device-cur">{t.syncTab.current}</span>}
                        </span>
                        <span className="sync-device-meta">
                          {platformLabel(d.platform, t) ?? (d.platform || "—")} · {t.syncTab.seen}{" "}
                          {relTime(d.lastSeenAt, t)}
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
                      {t.syncTab.rename}
                    </button>
                  )}
                  {!d.current && (
                    <button className="ghost sync-device-revoke" disabled={busy} onClick={() => revoke(d.deviceId)}>
                      {t.syncTab.revoke}
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
