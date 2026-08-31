import type { ReactNode } from "react";
import { useT } from "../../i18n";
import { EmptyPromptSuggestions } from "./EmptyPromptSuggestions";

/**
 * L'accueil d'une conversation VIDE — le bonjour, la promesse, le composeur, les amorces.
 *
 * Aucune marque produit en tête : le rail et la barre latérale la portent déjà à l'écran,
 * et un accueil qui s'ouvre sur SON logo parle de lui avant de parler à l'utilisateur.
 *
 * Purement présentationnel : tout ce qu'il déclenche arrive en prop, et le composeur est
 * l'instance QUE `ChatView` rend aussi en bas d'un fil — la même, pas une seconde.
 */
export function WelcomeScreen({
  greeting,
  composer,
  startersOff,
  onPick,
  onSeeAll,
  onSetStartersOff,
}: {
  greeting: string;
  composer: ReactNode;
  startersOff: boolean;
  /** Envoie l'amorce — le MÊME chemin qu'un message tapé, jamais un raccourci qui
   *  contournerait le redaction. */
  onPick: (prompt: string) => void;
  /** « Voir les autres » : la liste complète des connecteurs. */
  onSeeAll?: () => void;
  /** Absent ⇒ les amorces ne peuvent ni se masquer ni revenir (aucun réglage à écrire). */
  onSetStartersOff?: (off: boolean) => void;
}) {
  const t = useT();
  return (
    <div className="welcome">
      <h1 className="cv-display">{greeting}</h1>
      {/* ⚠️ A privacy CLAIM (root rule 8), kept to ONE short line: name only what the
          DEFAULT categories actually catch. Names are honest here because the AI set
          defaults ON (catalog.test.ts pins it) with the offline NER as the default
          engine — if that default changes, this sentence changes with it. */}
      <p>{t.cards.welcome.subtitle}</p>
      {/* Composer right under the subtitle on home — in the action immediately. */}
      <div className="welcome-composer">{composer}</div>
      {startersOff ? (
        // La sortie du cul-de-sac : « ne plus proposer » se défait d'un clic, au même
        // endroit. Un lien, pas des cartes — l'écran reste calme.
        onSetStartersOff && (
          <button type="button" className="om-starters-back" onClick={() => onSetStartersOff(false)}>
            {t.cards.welcome.seeExamples}
          </button>
        )
      ) : (
        <EmptyPromptSuggestions
          onPick={onPick}
          onSeeAll={onSeeAll}
          onDismiss={onSetStartersOff && (() => onSetStartersOff(true))}
        />
      )}
    </div>
  );
}
