import { useMemo, useState } from "react";
import { ModalShell } from "./ModalShell";
import { ModalTitle } from "./ModalTitle";
import { Switch, CheckIcon, FeedbackIcon, ShieldIcon } from "../../components/brand";
import { useHost } from "../../host";
import { journalExportFor } from "./DebugLogModal/entryText";
import {
  buildFeedback,
  canSendFeedback,
  capJournal,
  carriesJournal,
  EMPTY_FEEDBACK,
  MAX_AVIS_MESSAGE,
  FEEDBACK_CATEGORIES,
  FEEDBACK_MOODS,
  type FeedbackContext,
  type FeedbackDraft,
} from "../../avis/avis";

/**
 * "Votre avis" — the rail's feedback modal.
 *
 * ⚠️ The success screen renders ONLY after `host.avis.send` RESOLVES, i.e. after
 * the backend accepted the message. The design kit fakes this (`setSent(true)` on
 * click, with no transport at all), which would tell the user "votre message est
 * bien arrivé chez l'équipe" while it went nowhere. A failure surfaces as an error
 * with the text still in the box, so nothing the user wrote is lost.
 *
 * `context` is assembled by the caller and passed in; `buildFeedback` is the choke
 * point that keeps it to version + screen (never conversation content).
 */
export function AvisModal({
  onClose,
  context,
  prefill,
  convId,
}: {
  onClose: () => void;
  context: FeedbackContext;
  /** Optional seeded draft (a « Signaler » affordance — `redactionProblemDraft`).
   *  A template + category only, never conversation content; the send gate is
   *  unchanged (the user still picks a mood and finishes the message). */
  prefill?: FeedbackDraft;
  /** The conversation whose debug journal may be OFFERED on a Bug report. Scopes the
   *  export exactly like the journal modal does; absent ⇒ app-level entries only. */
  convId?: string | null;
}) {
  const host = useHost();
  const [draft, setDraft] = useState<FeedbackDraft>(prefill ?? EMPTY_FEEDBACK);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const patch = (p: Partial<FeedbackDraft>) => setDraft((d) => ({ ...d, ...p }));
  const canSend = canSendFeedback(draft) && !busy;
  // Derived from the SAME predicate the send gate uses, never a second reading of
  // `journal && attachJournal` — so the label can't say "facultatif" while the button
  // still refuses, or the reverse.
  const moodOptional = carriesJournal(draft);

  /**
   * A bug report with no logs costs a round-trip — the team asks, the user re-does the
   * scenario. So the journal is OFFERED as soon as the category is « Bug », not only
   * behind the journal modal's own button.
   *
   * PRÉ-COCHÉ depuis le 13/08 (décision produit, avec la collecte permanente) : un
   * rapport de bug sans journal coûte un aller-retour, et l'exiger d'un clic de plus
   * le perdait presque toujours. Ce qui rend le pré-cochage honnête : l'aperçu
   * VERBATIM s'affiche sous l'interrupteur (ce qui part est à l'écran), l'export est
   * « sans mapping » (texte wire redacted, jamais une valeur du coffre), et le refus
   * reste un geste unique, mémorisé pour ce rapport.
   */
  const offer = useMemo(
    () => (draft.category === "bug" && !draft.journal ? capJournal(journalExportFor(convId)) : ""),
    [draft.category, draft.journal, convId],
  );
  const journal = draft.journal || offer;

  const submit = async () => {
    // The offer is folded in at the last moment rather than written into the draft, so
    // leaving « Bug » takes it back out with no state to unwind.
    const payload = buildFeedback({ ...draft, journal }, context);
    if (!payload || !host.avis) return;
    setBusy(true);
    setError(null);
    try {
      await host.avis.send(payload);
      setSent(true); // ONLY on a resolved send — see the note above.
    } catch (e) {
      setError(
        e instanceof Error && e.message
          ? e.message
          : "Votre avis n'a pas pu être envoyé. Réessayez dans un instant — votre message est conservé.",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <ModalShell onClose={onClose} width="540px" maxHeight="90vh">
      <div className="om-avis-head">
        <span className="om-avis-glyph">
          <FeedbackIcon size={22} />
        </span>
        <div className="om-avis-head-text">
          <ModalTitle marker={false}>Votre avis</ModalTitle>
          <div className="om-avis-sub">Dites-nous ce qui marche — ou ce qui coince. On lit tout.</div>
        </div>
      </div>

      {sent ? (
        <div className="om-avis-done">
          <span className="om-avis-done-glyph">
            <CheckIcon size={30} />
          </span>
          <div className="cv-display om-avis-done-title">Merci !</div>
          <p className="om-avis-done-text">
            {journal && draft.attachJournal !== false
              ? "Message reçu, avec le journal de débogage — sans la table de correspondance, donc sans vos valeurs réelles."
              : "Message reçu. Aucun contenu de vos conversations n'a été joint."}
          </p>
          <button type="button" className="btn-primary" onClick={onClose}>
            Fermer
          </button>
        </div>
      ) : (
        <>
          <div className="om-avis-body">
            <div className="om-avis-field">
              {/* The mood stops being mandatory once the journal rides (`canSendFeedback`)
                  — so the label has to SAY so. A field that silently stopped gating the
                  send would still read as required, and the user would still pick one to
                  be safe: the friction we removed would just move into their head. */}
              <label className="cv-eyebrow">
                Comment ça se passe ?{moodOptional && <span className="om-avis-optional"> · facultatif</span>}
              </label>
              <div className="om-avis-moods">
                {FEEDBACK_MOODS.map((m) => {
                  const on = draft.mood === m.id;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      className={`om-avis-mood${on ? " on" : ""}`}
                      onClick={() => patch({ mood: m.id })}
                      aria-pressed={on}
                      // The selected tone is data-driven → the sanctioned inline case.
                      style={on ? { background: `var(--hl-${m.tone}-soft)` } : undefined}
                    >
                      <span className="om-avis-mood-glyph">{m.glyph}</span>
                      <span className="om-avis-mood-label">{m.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="om-avis-field">
              <label className="cv-eyebrow">Type de retour</label>
              <div className="om-avis-cats">
                {FEEDBACK_CATEGORIES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`om-avis-cat${draft.category === c.id ? " on" : ""}`}
                    onClick={() => patch({ category: c.id })}
                    aria-pressed={draft.category === c.id}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="om-avis-field">
              <label className="cv-eyebrow" htmlFor="om-avis-msg">
                Votre message
              </label>
              <textarea
                id="om-avis-msg"
                className="om-avis-textarea"
                value={draft.message}
                onChange={(e) => patch({ message: e.target.value })}
                placeholder="Ce que vous aimez, ce qui vous a bloqué, ce qui manque…"
                rows={5}
                maxLength={MAX_AVIS_MESSAGE}
                autoFocus
              />
            </div>

            <label className="om-avis-attach">
              <Switch checked={draft.attachContext} onChange={(v) => patch({ attachContext: v })} />
              <span>
                <span className="om-avis-attach-title">Joindre le contexte technique</span>
                <span className="om-avis-attach-sub">
                  Version de l'app, écran actuel et identifiant d'installation. Jamais le
                  contenu de vos conversations.
                </span>
              </span>
            </label>

            {/* The debug journal — seeded by « Envoyer aux développeurs », or offered
                here on a Bug report. VISIBLE on purpose: the preview shows the exact
                text that would ride the payload — the « sans mapping » export, wire
                form only, no vault value — so attaching is an informed act, and its
                own switch turns it off. */}
            {journal && (
              <div className="om-avis-journal">
                <label className="om-avis-attach">
                  <Switch
                    checked={draft.attachJournal !== false}
                    onChange={(v) => patch({ attachJournal: v })}
                  />
                  <span>
                    <span className="om-avis-attach-title">Joindre le journal de débogage</span>
                    <span className="om-avis-attach-sub">
                      Le texte parti au modèle (déjà redacted), les outils et les erreurs — sans la
                      table de correspondance, donc aucune valeur réelle. Aperçu ci-dessous.
                    </span>
                  </span>
                </label>
                {draft.attachJournal !== false && (
                  <pre className="om-avis-journal-preview">{journal}</pre>
                )}
              </div>
            )}

            {error && <div className="om-avis-error">{error}</div>}
          </div>

          <div className="om-avis-foot">
            <span className="om-avis-confidential">
              <ShieldIcon size={13} />
              Confidentiel
            </span>
            <span className="om-avis-spacer" />
            <button type="button" className="btn-ghost" onClick={onClose} disabled={busy}>
              Annuler
            </button>
            <button type="button" className="btn-primary" onClick={submit} disabled={!canSend}>
              {busy ? "Envoi…" : "Envoyer"}
            </button>
          </div>
        </>
      )}
    </ModalShell>
  );
}
