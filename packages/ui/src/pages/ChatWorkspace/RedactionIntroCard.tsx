import { ArrowRightIcon, ShieldIcon, XIcon } from "../../components/brand";
import { useT } from "../../i18n";

/**
 * « Comprendre mon redaction » — le petit conteneur sous les premières réponses.
 * Quand il se montre (et pourquoi « Fermer pour toujours » est définitif) :
 * `privacy/redactionIntro.ts`. Il ouvre le chapitre redaction du guide — jamais une
 * seconde explication : le chapitre EST l'explication, ce conteneur n'est qu'une porte.
 *
 * Volontairement plus petit que les encarts voisins (`TransparencyCard`…) : c'est une
 * invitation récurrente jusqu'à fermeture, pas une annonce — une carte pleine qui
 * reviendrait à chaque conversation prendrait la place d'une réponse.
 *
 * ⚠️ Le conteneur ENTIER est le bouton d'ouverture, la croix est un bouton DANS le
 * bouton : d'où le `stopPropagation` — fermer ne doit pas ouvrir ce qu'on ferme.
 */
export function RedactionIntroCard({
  onOpen,
  onDismiss,
}: {
  onOpen: () => void;
  onDismiss: () => void;
}) {
  const t = useT();
  return (
    <div className="redintro" role="group" aria-label={t.cards.redactionIntro.ariaLabel}>
      <button type="button" className="redintro-open" onClick={onOpen}>
        <span className="redintro-ic">
          <ShieldIcon size={14} />
        </span>
        <span className="redintro-copy">
          <span className="redintro-title">{t.cards.redactionIntro.title}</span>
          <span className="redintro-sub">{t.cards.redactionIntro.sub}</span>
        </span>
        <ArrowRightIcon size={13} />
      </button>
      <button
        type="button"
        className="redintro-close"
        title={t.cards.redactionIntro.closeTip}
        aria-label={t.cards.redactionIntro.close}
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
      >
        <XIcon size={12} />
        <span>{t.cards.redactionIntro.close}</span>
      </button>
    </div>
  );
}
