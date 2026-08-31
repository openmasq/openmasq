import { BRAND } from "@openmasq/branding";
import { useState } from "react";
import { MAX_PROFILE_CHARS } from "../../memory";
import type { MemoryData } from "../../types";

import { useT } from "../../i18n";
/** The PROFILE card above the stage — the always-injected standing context, with its
 *  own edit draft. Split out of `MemoryView` (300-LOC cap, rule 1); the draft state
 *  lives here because nothing else reads it. */
export function MemoryProfile({
  memoire,
  onSetProfile,
}: {
  memoire: MemoryData;
  onSetProfile: (profile: string) => void;
}) {
  const t = useT();
  const [draft, setDraft] = useState<string | null>(null);
  return (
    <section className="om-skill-card om-mem-profile">
      <div className="om-skill-card-head">
        <span className="om-skill-name">{t.lists.memory.profile.title}</span>
        <span className="om-skill-spacer" />
        {draft === null ? (
          <button type="button" className="om-skill-use" onClick={() => setDraft(memoire.profile ?? "")}>
            Modifier
          </button>
        ) : (
          <>
            <button
              type="button"
              className="om-skill-use"
              onClick={() => {
                onSetProfile(draft);
                setDraft(null);
              }}
            >
              Enregistrer
            </button>
            <button type="button" className="om-skill-use" onClick={() => setDraft(null)}>
              Annuler
            </button>
          </>
        )}
      </div>
      {draft === null ? (
        // Clic-pour-modifier — le même contrat que la carte document du chat : le texte
        // EST l'affordance ; une sélection en cours (copie) avale le clic.
        <p
          className="om-skill-desc om-mem-profile-text"
          title={t.lists.memory.profile.editTip}
          onClick={() => {
            const sel = window.getSelection();
            if (sel && !sel.isCollapsed) return;
            setDraft(memoire.profile ?? "");
          }}
        >
          {memoire.profile?.trim() ||
            `Qui vous êtes et ce que ${BRAND.name} doit garder en tête — votre métier, vos préférences, votre façon de travailler.`}
        </p>
      ) : (
        <>
          <textarea
            className="om-mem-textarea"
            value={draft}
            maxLength={MAX_PROFILE_CHARS}
            rows={4}
            onChange={(e) => setDraft(e.target.value)}
            placeholder={t.lists.memory.profile.placeholder}
            aria-label={t.lists.memory.profile.aria}
          />
          {/* La borne, dite : le profil accompagne CHAQUE envoi, sa taille est un
              budget — pas un champ libre qui se tronque en silence. */}
          <span className="om-mem-limit">
            {draft.length}/{MAX_PROFILE_CHARS} — le profil accompagne chaque envoi ;
            court, il laisse la place aux fiches.
          </span>
        </>
      )}
    </section>
  );
}
