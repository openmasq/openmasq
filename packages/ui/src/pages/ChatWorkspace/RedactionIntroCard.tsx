import { ArrowRightIcon, ShieldIcon, XIcon } from "../../components/brand";

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
  return (
    <div className="redintro" role="group" aria-label="Comprendre mon redaction">
      <button type="button" className="redintro-open" onClick={onOpen}>
        <span className="redintro-ic">
          <ShieldIcon size={14} />
        </span>
        <span className="redintro-copy">
          <span className="redintro-title">Comprendre mon redaction</span>
          <span className="redintro-sub">
            Ce qui est masqué, ce qui reste en clair, et pourquoi le compteur peut rester à zéro
          </span>
        </span>
        <ArrowRightIcon size={13} />
      </button>
      <button
        type="button"
        className="redintro-close"
        title="Fermer pour toujours — le chapitre reste dans l'Aide"
        aria-label="Fermer pour toujours"
        onClick={(e) => {
          e.stopPropagation();
          onDismiss();
        }}
      >
        <XIcon size={12} />
        <span>Fermer pour toujours</span>
      </button>
    </div>
  );
}
