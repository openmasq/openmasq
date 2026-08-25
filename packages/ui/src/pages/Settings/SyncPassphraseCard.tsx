import { useEffect, useState } from "react";
import { RefreshIcon } from "../../components/brand";
import type { SyncHost } from "../../host";

/**
 * La carte de la PHRASE E2E — poser, changer, désactiver. Sortie de `SyncSection` quand
 * celle-ci a passé les 300 lignes (règle 1) : la phrase et la liste des appareils sont deux
 * concerns qui ne partagent aucun état, la coupe était donc déjà écrite dans le fichier.
 *
 * ⚠️ **On RELIT l'hôte après chaque geste au lieu de supposer qu'il a réussi.** L'ancienne
 * version affichait « désactivée » sur son propre optimisme : quand l'effacement échouait,
 * l'interface l'annonçait quand même, le fichier chiffré restait, et la phrase réapparaissait
 * au rechargement — une synchro qu'on croit éteinte et qui tourne toujours. C'est le pire des
 * deux états, et c'est le symptôme par lequel le défaut d'association au compte s'est
 * manifesté. Un geste qui n'a pas pris se DIT (`failure`).
 *
 * La phrase est rangée PAR COMPTE côté hôte (`main/store/syncPass.ts` sur le bureau,
 * `@openmasq/sync` `accountPassphrase` ailleurs) : cette carte n'a donc rien à faire du
 * changement de compte, elle relit simplement ce que l'hôte rend pour le compte courant.
 */
export function SyncPassphraseCard({ sync }: { sync: SyncHost }) {
  const [pass, setPass] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  /** « mismatch » = la phrase posée n'ouvre pas les clés déjà synchronisées (une autre
   *  phrase règne sur le serveur) — dit tout de suite, au lieu d'une synchro morte. */
  const [passMismatch, setPassMismatch] = useState(false);
  /** Un geste qui a ÉCHOUÉ — voir l'en-tête : le silence était le vrai défaut. */
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
      // On RELIT plutôt que de supposer : ce qui compte est ce que l'hôte a réellement
      // rangé, pas ce qu'on vient de lui demander.
      const stored = await sync.getPassphrase();
      setPass(stored);
      if (!stored) {
        setFailure("La phrase n'a pas pu être enregistrée. Reconnectez-vous, puis réessayez.");
        return;
      }
      setDraft("");
      setEditing(false);
      // La phrase est posée quoi qu'il arrive (une phrase volontairement neuve est
      // légitime) — mais si le serveur porte des enveloppes qu'elle n'ouvre pas, on le
      // DIT maintenant plutôt que de laisser chaque canal se sceller en silence.
      setPassMismatch((await sync.verifyPassphrase?.(phrase)) === "mismatch");
    } catch {
      setFailure("La phrase n'a pas pu être enregistrée. Reconnectez-vous, puis réessayez.");
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
        setFailure("La synchronisation n'a pas pu être désactivée. Réessayez.");
        return;
      }
      setEditing(true);
      setPassMismatch(false);
    } catch {
      setPass(await sync.getPassphrase().catch(() => null));
      setFailure("La synchronisation n'a pas pu être désactivée. Réessayez.");
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
          <div className="sync-key-title">Synchroniser cet appareil</div>
          <div className="sync-key-desc">
            Règles, historique et catégories, chiffrés de bout en bout
          </div>
        </div>
        <span className={`keyless-badge ${hasPass ? "on" : "off"}`}>
          {hasPass ? "Active" : "Non définie"}
        </span>
      </div>
      <p className="modal-note sync-key-note">
        Vos données redacted sont chiffrées de bout en bout avec cette phrase{" "}
        <b>avant</b> d'être synchronisées — elle ne quitte jamais vos appareils et nous ne
        pouvons pas la récupérer. Saisissez la <b>même</b> phrase sur chacun de vos appareils
        pour qu'ils se synchronisent.
      </p>
      {failure && <p className="modal-note sync-key-note sync-pass-warn">{failure}</p>}
      {passMismatch && (
        <p className="modal-note sync-key-note sync-pass-warn">
          Cette phrase n'ouvre pas les données déjà synchronisées : un autre de vos appareils
          utilise une phrase différente. Tant qu'elles ne sont pas identiques, ce qu'il
          synchronise restera illisible ici (et inversement). Saisissez la même phrase sur
          chaque appareil — celle-ci, ou la sienne.
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
              placeholder="Au moins 8 caractères…"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
            />
            <button className="ghost" disabled={busy} onClick={() => setDraft(sync.generatePassphrase())}>
              Générer
            </button>
            <button className="primary" disabled={busy || !canSave} onClick={save}>
              Enregistrer
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
              Annuler
            </button>
          )}
        </>
      ) : (
        <div className="keyless-actions">
          <button className="ghost" disabled={busy} onClick={() => setEditing(true)}>
            Changer
          </button>
          <button className="ghost text-err" disabled={busy} onClick={disable}>
            Désactiver
          </button>
        </div>
      )}

      {!sync.enabled && (
        <p className="keyless-hint">
          La synchronisation réseau n'est pas encore configurée sur cette version — la phrase
          est enregistrée localement et s'activera dès que le backend sera branché.
        </p>
      )}
    </div>
  );
}
