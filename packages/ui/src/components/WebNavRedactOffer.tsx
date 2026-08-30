import { BrowserIcon, ShieldIcon, ArrowRightIcon } from "./brand";
import { AgentCard, GlyphTile, AgentCardTitle, AgentCardDesc } from "./agent/AgentCard";
import { privacyLevelMeta } from "../privacy/privacyLevel";
import { useT } from "../i18n";
import type { Messages } from "@openmasq/i18n";
import type { RedactCategoryKey } from "../types";

/** Le niveau que la carte propose — son vocabulaire vit chez les niveaux, jamais ici
 *  (règle 9 : deux surfaces qui réécrivent « Standard » finissent par en dire deux
 *  choses). `tradeoff` est justement la phrase qui nomme ce qu'il laisse lisible.
 *  Une FONCTION, plus une constante de module : le vocabulaire suit maintenant la langue,
 *  donc il se résout au rendu et non au chargement du module. */
const standardLevel = (t: Messages) => privacyLevelMeta(t).find((l) => l.id === "standard")!;

/**
 * BLOCKING pre-search gate, rendered inline UNDER the pending assistant bubble while the
 * agentic loop is PAUSED before its first web search. Built on the shared `AgentCard`
 * shell so it reads as one family with the action-confirmation / integration cards.
 *
 * Public web content's place/org/person names are usually the answer's substance, so
 * redacting them makes the model summarise gibberish. La carte propose donc **un
 * NIVEAU, pas des types** : « Standard » — exactement les cinq catégories que ce niveau
 * laisse lisibles (`state/webNavReveal.ts` dit pourquoi les deux ensembles ne peuvent pas
 * diverger). Un choix, deux boutons, aucune case à cocher.
 *
 * ⚠️ **Pourquoi ce n'est plus une liste de cases.** Elle en montrait cinq, chacune avec sa
 * teinte et son œil, sur l'écran qui INTERROMPT une recherche : c'était demander à
 * quelqu'un d'arbitrer catégorie par catégorie au milieu d'autre chose. Le produit sait
 * déjà nommer ce compromis — c'est un niveau de protection — et un niveau se choisit d'un
 * clic. Qui veut l'arbitrage fin l'a toujours, à sa place : Réglages → Confidentialité.
 *
 * ⚠️ **CE MESSAGE SEULEMENT.** Le choix ne s'écrit pas dans la conversation : l'envoi
 * suivant repart redacted (`send/sendOrchestrator.ts`). C'est ce qui rend un défaut
 * généreux acceptable — et la carte le DIT, parce qu'une portée qu'on ne lit pas est une
 * portée qu'on croit plus courte qu'elle n'est.
 *
 * ⚠️ Il ne s'agit PAS d'une décision d'egress : elle ne change que ce que le MODÈLE lit.
 * La requête part avec la vraie valeur dans tous les cas (règle 11). Et la sélection est
 * de l'UX : le store re-filtre ce qui revient contre l'offrable (règle 7), donc renvoyer
 * une catégorie imposée par l'organisation ne la révèle pas.
 */
export function WebNavRedactOffer({
  categories,
  onDecide,
}: {
  categories: RedactCategoryKey[];
  /** Les catégories à révéler pour CET envoi — `[]` = aucune. */
  onDecide: (reveal: RedactCategoryKey[]) => void;
}) {
  const t = useT();
  const standard = standardLevel(t);
  if (!categories.length) return null;

  return (
    <AgentCard
      className="webnav-offer"
      role="group"
      ariaLabel={t.webNav.ariaLabel}
      eyebrow={t.webNav.eyebrow}
      tile={
        <GlyphTile>
          <BrowserIcon size={18} />
        </GlyphTile>
      }
      footer={
        <>
          <span className="agent-card-note">
            <ShieldIcon size={13} />
            {/* ⚠️ COURT par obligation : `.agent-card-note` est une ligne unique coupée à
                l'ellipse, et deux boutons larges lui laissent peu de place. Or c'est LA
                phrase qui rend un défaut généreux honnête — tronquée, elle ne vaut rien.
                Le détail (« le suivant repart redacted ») vivait ici et se faisait
                couper ; la portée seule tient. */}
            <span>{t.webNav.thisMessageOnly}</span>
          </span>
          <span className="agent-card-spacer" />
          <button className="btn-ghost btn-inline" onClick={() => onDecide([])}>
            {t.webNav.keepMasking}
          </button>
          {/* « Tout l'offert » = le niveau : la carte ne compose pas un sous-ensemble, elle
              applique celui que « Standard » désigne (le store le re-filtre). */}
          <button className="btn-primary btn-inline" onClick={() => onDecide(categories)}>
            {t.webNav.switchTo(standard.label)} <ArrowRightIcon size={14} />
          </button>
        </>
      }
    >
      <AgentCardTitle>{t.webNav.title(standard.label)}</AgentCardTitle>
      <AgentCardDesc>
        {standard.tradeoff} {t.webNav.rest}
      </AgentCardDesc>
    </AgentCard>
  );
}
