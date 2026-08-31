import { useEffect, useState } from "react";
import { RefreshIcon } from "../../components/brand";
import type { SyncHost } from "../../host";

import { useT } from "../../i18n";
/**
 * The E2E PASSPHRASE card — set, change, disable. Pulled out of `SyncSection` when
 * that one crossed 300 lines (rule 1): the passphrase and the device list are two
 * concerns sharing no state, so the cut was already written into the file.
 *
 * ⚠️ **We RE-READ the host after every action instead of assuming it succeeded.** The old
 * version showed "disabled" on its own optimism: when clearing failed,
 * the UI announced it anyway, the encrypted file stayed, and the passphrase reappeared
 * on reload — a sync you believe is off but that is still running. That's the worst of
 * both states, and it's the symptom through which the account-association bug
 * manifested. An action that didn't take gets SAID (`failure`).
 *
 * The passphrase is stored PER ACCOUNT on the host side (`main/store/syncPass.ts` on
 * desktop, `@openmasq/sync` `accountPassphrase` elsewhere): so this card has nothing to do about
 * account switching, it simply re-reads what the host returns for the current account.
 */
export function SyncPassphraseCard({ sync }: { sync: SyncHost }) {
  const [pass, setPass] = useState<string | null>(null);
  const t = useT();
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  /** "mismatch" = the passphrase set doesn't open the already-synced keys (another
   *  passphrase rules on the server) — said right away, instead of a dead sync. */
  const [passMismatch, setPassMismatch] = useState(false);
  /** An action that FAILED — see the header: silence was the real bug. */
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    void sync.getPassphrase().then((p) => {
      setPass(p);
      setEditing(!p);
    });
  }, [sync]);

  const hasPass = !!pass;
  const canSave = draft.trim().length >= 8;

  async function save() {
    if (!canSave) return;
    setBusy(true);
    setFailure(null);
    try {
      const phrase = draft.trim();
      await sync.setPassphrase(phrase);
      // We RE-READ rather than assume: what matters is what the host actually
      // stored, not what we just asked it to.
      const stored = await sync.getPassphrase();
      setPass(stored);
      if (!stored) {
        setFailure(t.syncTab.passSaveFailed);
        return;
      }
      setDraft("");
      setEditing(false);
      // The passphrase is set no matter what (a deliberately new passphrase is
      // legitimate) — but if the server holds envelopes it doesn't open, we
      // SAY so now rather than let each channel seal itself in silence.
      setPassMismatch((await sync.verifyPassphrase?.(phrase)) === "mismatch");
    } catch {
      setFailure(t.syncTab.passSaveFailed);
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    setBusy(true);
    setFailure(null);
    try {
      await sync.clearPassphrase();
      const stored = await sync.getPassphrase();
      setPass(stored);
      if (stored) {
        setFailure(t.syncTab.passDisableFailed);
        return;
      }
      setEditing(true);
      setPassMismatch(false);
    } catch {
      setPass(await sync.getPassphrase().catch(() => null));
      setFailure(t.syncTab.passDisableFailed);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="settings-card pad sync-key-card">
      <div className="sync-key-head">
        <span className="sync-tile sync-tile--lime">
          <RefreshIcon size={19} />
        </span>
        <div className="sync-key-body">
          <div className="sync-key-title">{t.syncTab.passTitle}</div>
          <div className="sync-key-desc">
            {t.syncTab.passDesc}
          </div>
        </div>
        <span className={`keyless-badge ${hasPass ? "on" : "off"}`}>
          {hasPass ? t.syncTab.passActive : t.syncTab.passUnset}
        </span>
      </div>
      <p className="modal-note sync-key-note">
        {t.syncTab.passNote.lead}
        <b>{t.syncTab.passNote.before}</b>
        {t.syncTab.passNote.mid}
        <b>{t.syncTab.passNote.same}</b>
        {t.syncTab.passNote.tail}
      </p>
      {failure && <p className="modal-note sync-key-note sync-pass-warn">{failure}</p>}
      {passMismatch && (
        <p className="modal-note sync-key-note sync-pass-warn">
          {t.syncTab.passMismatch}
        </p>
      )}

      {editing ? (
        <>
          <div className="sync-pass-row">
            <input
              className="sync-pass-input"
              type="text"
              autoComplete="off"
              spellCheck={false}
              placeholder={t.syncTab.passPlaceholder}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button className="ghost" disabled={busy} onClick={() => setDraft(sync.generatePassphrase())}>
              {t.syncTab.generate}
            </button>
            <button className="primary" disabled={busy || !canSave} onClick={save}>
              {t.syncTab.save}
            </button>
          </div>
          {hasPass && (
            <button
              className="link-btn"
              onClick={() => {
                setEditing(false);
                setDraft("");
              }}
            >
              {t.syncTab.cancel}
            </button>
          )}
        </>
      ) : (
        <div className="keyless-actions">
          <button className="ghost" disabled={busy} onClick={() => setEditing(true)}>
            {t.syncTab.change}
          </button>
          <button className="ghost text-err" disabled={busy} onClick={disable}>
            {t.syncTab.disable}
          </button>
        </div>
      )}

      {!sync.enabled && (
        <p className="keyless-hint">
          {t.syncTab.passOffline}
        </p>
      )}
    </div>
  );
}
