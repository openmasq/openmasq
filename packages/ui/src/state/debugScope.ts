import { DRAFT_CONV, type DebugEntry } from "./debug";

/**
 * Qui peut voir quelle entrée du journal — la seule question de confidentialité du
 * journal de débogage, donc son propre module (règle 10 : un contrôle de frontière se lit
 * d'un bloc, il ne se dilue pas dans le tampon circulaire qui le stocke).
 *
 * **C'est LA règle, et il n'y en a qu'une** : la modale, l'export joint à un avis
 * (`journalExportFor`) et le pont e2e passent tous par ici. Les trois portaient leur propre
 * copie du prédicat, et les deux dernières sont restées sur la version d'avant le 11/08 —
 * une règle de confidentialité recopiée à trois endroits n'est corrigée qu'au premier
 * (règle 9). N'en réécrivez pas une quatrième : appelez celle-ci.
 *
 * Le BROUILLON (`DRAFT_CONV`, debug.ts) en fait partie : un document redacted avant qu'une
 * conversation existe est estampillé d'un sentinel, visible seulement sur un chat encore
 * vierge, puis ADOPTÉ par la conversation que le premier envoi crée — les entrées
 * atteignent leur conversation au lieu d'être perdues.
 */

/**
 * Les entrées que le journal d'une conversation a le droit d'afficher.
 *
 *  • estampillée conversation → seulement la sienne ;
 *  • estampillée BROUILLON → seulement un chat sans conversation (avant l'adoption) ;
 *  • sans `conv` → NULLE PART.
 *
 * ⚠️ Cette dernière branche a été RENVERSÉE (12/08). Elle montrait une entrée non
 * attribuée partout, à condition qu'elle ne porte pas de valeurs réelles : un « événement
 * de niveau application » (étape de cycle de vie, erreur de démarrage) n'a rien à fuir, et
 * l'afficher valait mieux que le perdre. Deux choses ont eu raison de ce compromis :
 *
 *  1. **Le journal est PAR CONVERSATION, sans exception** — la modale l'annonce en toutes
 *     lettres (« pour cette conversation »). Une ligne présente dans les cinq onglets fait
 *     douter des quatre autres : on ne sait plus si elle vient d'ici.
 *  2. **Plus aucun émetteur ne produit d'entrée non attribuée.** Ils estampillent tous, et
 *     « pas encore de conversation » n'est pas « pas de conversation » — c'est `DRAFT_CONV`
 *     (`ocrDebug.ts` refuse même l'`undefined`). La branche ne servait donc plus les
 *     événements d'app qu'elle protégeait : elle ne servait plus que les entrées PERSISTÉES
 *     avant le 11/08, non estampillées, que l'anneau chiffré ressort à chaque démarrage —
 *     dans chaque conversation, indéfiniment. C'est le symptôme rapporté (« en changeant de
 *     conversation le journal reste le même »). `attachDebugStore` les jette à
 *     l'hydratation, et ceci les rend invisibles si elles arrivent par un autre chemin.
 *
 * Le corollaire, assumé : le jour où un émetteur d'app légitime apparaîtra (un diagnostic
 * de démarrage), il n'aura pas de conversation à nommer et son entrée ne s'affichera pas.
 * Il lui faudra une surface à lui, pas une place d'emprunt dans le journal d'un fil.
 */
export function isEntryVisibleIn(e: DebugEntry, convId?: string | null): boolean {
  if (e.conv === DRAFT_CONV) return convId == null;
  return e.conv != null && e.conv === convId;
}
