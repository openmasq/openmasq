import { useEffect, useState } from "react";
import { confirmationModeLocked } from "@openmasq/catalog/mcp";
import { Switch, ShieldIcon } from "../../../components/brand";
import { useHost } from "../../../host";
import { useChatStore } from "../../../state";
import { captureEvent } from "../../../analytics";
import {
  setWriteAutoApproveAll,
  isWriteAutoApproveAll,
  getConfirmationModeMirror,
  setConfirmationModeMirror,
} from "../../ChatWorkspace/writeConfirm";
import { BRAND } from "@openmasq/branding";

/**
 * Réglages → MCP « Confirmation des actions » : the two knobs over
 * `CONFIRMATION_POLICY` (`@openmasq/catalog/mcp` — WHERE the behaviour itself is
 * declared; this screen only picks the MODE).
 *
 * « Mode renforcé » — persisted, main-owned (`host.mcp.setConfirmationMode`): every write
 * confirms, the risky ones on main's un-spoofable window. OFF (the default `standard`
 * mode): one in-conversation card per conversation, only after a web search, plus the
 * exfil/attachment floors. ⚠️ SECURITY (root rule 7): the toggle is NOT the gate —
 * DISABLING renforcé pops the un-spoofable window in main, so a renderer XSS can call the
 * IPC but cannot lower the posture; the returned value is the REAL resulting mode.
 *
 * The session auto-approve toggle (unchanged) skips even those confirmations for the
 * session; enabling it is confirmed the same way. Both rows hide when the host can't
 * honour them (browser preview / un-restarted preload) — there the defaults stand.
 *
 * ⚠️ An ORG can impose `renforce` as a FLOOR (`orgProfile.confirmationFloor`). The row then
 * shows ON and LOCKED with the reason, because main refuses the downgrade anyway
 * (`composeConfirmationMode`) — a switch that silently springs back reads as a bug, and a
 * policy the member can appear to defeat is not a policy.
 */
export function McpWriteConfirm() {
  const host = useHost();
  const { orgProfile } = useChatStore();
  const floor = orgProfile?.confirmationFloor;
  const locked = confirmationModeLocked(floor);
  const setAuto = host.mcp?.setWriteAutoApprove;
  const setMode = host.mcp?.setConfirmationMode;
  // Init from the module-level renderer mirrors so the toggles reflect reality across a
  // remount (navigating away and back) — the flags outlive this component.
  const [renforce, setRenforce] = useState(() => getConfirmationModeMirror() === "renforce");
  const [on, setOn] = useState(isWriteAutoApproveAll);
  const [busy, setBusy] = useState(false);

  // The persisted mode lives in MAIN — read it so the toggle is true after a restart.
  useEffect(() => {
    host.mcp
      ?.getConfirmationMode?.()
      .then((m) => {
        setConfirmationModeMirror(m);
        setRenforce(m === "renforce");
      })
      .catch(() => {});
  }, [host]);

  if (!setAuto && !setMode) return null;

  const toggleMode = async (v: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      // The RESULTING mode is authoritative — leaving renforcé may be refused on the
      // main window (fail closed: the stricter mode stays).
      const result = await setMode!(v ? "renforce" : "standard");
      setConfirmationModeMirror(result);
      setRenforce(result === "renforce");
      captureEvent({ name: "setting_changed", key: "mcpConfirmationMode" });
    } catch {
      // Unknown outcome ⇒ re-read main rather than guess.
      const m = await host.mcp?.getConfirmationMode?.().catch(() => "standard" as const);
      if (m) {
        setConfirmationModeMirror(m);
        setRenforce(m === "renforce");
      }
    } finally {
      setBusy(false);
    }
  };

  const toggleAuto = async (v: boolean) => {
    if (busy) return;
    setBusy(true);
    try {
      // The RESULTING state is authoritative — enabling may be refused on the main window.
      const result = await setAuto!(v);
      setOn(result);
      // Mirror to the RENDERER gate so the inline card is skipped too — but only the REAL
      // result (a refused enable stays false), so this never becomes a renderer-only bypass.
      setWriteAutoApproveAll(result);
      captureEvent({ name: "setting_changed", key: "mcpWriteAutoApprove" });
    } catch {
      setOn(false); // fail closed on any error
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="settings-section">
      <div className="cv-eyebrow">Confirmation des actions</div>
      <div className="settings-card">
        {setMode && (
          <div className="toggle-row">
            <span className="row-icon tone-coral">
              <ShieldIcon size={16} />
            </span>
            <div className="row-body">
              <div className="row-title">Mode renforcé</div>
              <div className="row-desc">
                Chaque action d'écriture (envoi d'email, création ou modification sur un compte
                connecté) demande votre confirmation — les plus sensibles dans une fenêtre
                dédiée. Désactivé, {BRAND.name} ne demande qu'une confirmation par conversation,
                après une recherche internet (et toujours en cas de signal de fuite ou de
                pièce jointe). Conservé au redémarrage.
                {locked && (
                  <>
                    {" "}
                    <strong>Imposé par votre organisation</strong> — vous pouvez le renforcer,
                    pas l'assouplir.
                  </>
                )}
              </div>
            </div>
            <Switch
              checked={locked || renforce}
              disabled={locked}
              onChange={(v) => void toggleMode(v)}
            />
          </div>
        )}
        {setAuto && (
          <div className="toggle-row">
            <span className="row-icon tone-coral">
              <ShieldIcon size={16} />
            </span>
            <div className="row-body">
              <div className="row-title">Tout autoriser sans demander (cette session)</div>
              <div className="row-desc">
                Les actions s'exécutent sans confirmation pendant cette session — une fenêtre vous
                le fera confirmer une fois. Tout redevient protégé au redémarrage.
              </div>
            </div>
            <Switch checked={on} onChange={(v) => void toggleAuto(v)} />
          </div>
        )}
      </div>
    </section>
  );
}
