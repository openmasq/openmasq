import { CheckIcon, LevelsIcon } from "../../components/brand";
import { levelBars, PRIVACY_LEVEL_META, type PrivacyLevel } from "../../privacy/privacyLevel";

export type AppliedLevel = Exclude<PrivacyLevel, "custom">;

export interface RedactLevelApi {
  /** Le niveau EFFECTIF de la conversation ouverte (override ⊕ global), ou du défaut
   *  global quand aucune conversation n'existe encore. */
  level: PrivacyLevel;
  /** Combien de traits le glyphe du bouton porte — `levelBars` du niveau courant. */
  bars: 1 | 2 | 3;
  /** Poser le niveau sur CETTE conversation. Absent tant qu'aucune conversation n'existe
   *  (premier message) : il n'y a alors rien à surcharger, et c'est le défaut qui reçoit. */
  onApplyConversation?: (level: AppliedLevel) => void;
  /** Poser le niveau PARTOUT — le défaut, celui de Réglages → Confidentialité. */
  onApplyAlways: (level: AppliedLevel) => void;
}

/**
 * Le niveau de redaction, DEPUIS LE COMPOSEUR.
 *
 * Il ne vivait que dans le menu ⋯ de la conversation et dans les Réglages : c'est-à-dire
 * à deux gestes de l'endroit où l'on constate qu'un envoi va trop — ou pas assez — masquer.
 * La décision est la même qu'ailleurs, elle est juste ATTEIGNABLE là où on la prend.
 *
 * ⚠️ **UN clic pose le niveau, et il le pose sur LA CONVERSATION.** Le composeur agit sur ce
 * qu'on a devant soi : c'est le périmètre le moins surprenant depuis une barre de saisie, et
 * le seul qui se défait en trois secondes (rouvrir, reprendre l'autre). Le défaut global se
 * change là où on le pèse — Réglages → Confidentialité, ou l'onglet « Par défaut » du menu ⋯.
 * SEULE exception, et elle est forcée : sans conversation (premier message), il n'y a rien à
 * surcharger, donc c'est le défaut qui reçoit — sinon le geste ne ferait rien du tout.
 *
 * ⚠️ **Le texte des cartes vient de `PRIVACY_LEVEL_META` (`short`), jamais d'ici.** C'est le
 * registre COURT du même vocabulaire — ce que le niveau COUVRE. Les Réglages en gardent le
 * registre long (`desc` + la contrepartie qu'impose la règle 8), parce que c'est là que la
 * décision se prend en connaissance de cause ; ici elle se change en passant, et on revient
 * toujours au même endroit pour la peser. Écrire les phrases dans ce fichier serait le
 * début de deux vocabulaires (règle 9).
 */
export function ComposerRedactMenu({
  api,
  onDone,
}: {
  api: RedactLevelApi;
  /** Fermer le menu — appelé après une application. */
  onDone: () => void;
}) {
  const apply = (level: AppliedLevel) => {
    (api.onApplyConversation ?? api.onApplyAlways)(level);
    onDone();
  };

  return (
    <>
      <div className="cv-eyebrow crm-eyebrow">Niveau de redaction</div>
      <div className="crm-levels" role="radiogroup" aria-label="Niveau de redaction">
        {PRIVACY_LEVEL_META.map((m) => {
          const current = api.level === m.id;
          return (
            <button
              key={m.id}
              type="button"
              role="radio"
              aria-checked={current}
              className="crm-level"
              onClick={() => apply(m.id)}
            >
              {/* Chaque carte porte SON niveau : la liste se lit comme une échelle. */}
              <span className="crm-level-ico">
                <LevelsIcon size={15} bars={levelBars(m.id)} />
              </span>
              <span className="crm-level-body">
                <span className="crm-level-head">
                  <span className="crm-level-name">{m.label}</span>
                  {current && (
                    <span className="crm-level-check" aria-label="Niveau actuel">
                      <CheckIcon size={14} />
                    </span>
                  )}
                </span>
                <span className="crm-level-desc">{m.short}</span>
              </span>
            </button>
          );
        })}
      </div>
    </>
  );
}
