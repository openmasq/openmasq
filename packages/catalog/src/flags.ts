/**
 * La QUATRIÈME liste gouvernable : les accès aux sections qu'on peut fermer à distance
 * (drapeaux PostHog, servis par le relais `apps/analytics-fn`).
 *
 * Elle vit ICI, à côté des modèles / connecteurs / catégories, pour la même raison
 * qu'eux : la clé de drapeau est écrite dans PostHog par un humain et lue par le
 * produit — deux endroits qui doivent nommer la MÊME chaîne, donc une seule source
 * (règle 9). Un drapeau tapé à la main dans un composant est un drapeau qui ne
 * s'éteindra jamais le jour où il faudra.
 *
 * ══ POURQUOI LE DRAPEAU DIT « CACHER », ET JAMAIS « AUTORISER » ══════════════════
 *
 * Mesuré contre le vrai PostHog (17/08), et c'est ce qui a décidé de la polarité :
 * **un drapeau DÉSACTIVÉ n'est pas rendu à `false` — il est ABSENT de la réponse.**
 * Avec une clé `access-*` (vrai = ouvert), le bouton « Disable » de l'interface — le
 * geste le plus évident du tableau de bord — produisait donc une réponse où la clé
 * manquait, que le client lit comme « pas d'avis » : la porte restait grande ouverte.
 * Un levier qui ne fait rien, en silence.
 *
 * Avec `hide-*` (vrai = fermé), les trois façons de ne rien dire retombent toutes sur
 * la MÊME valeur sûre :
 *   • drapeau jamais créé          → absent → `false` → ouvert
 *   • drapeau désactivé            → absent → `false` → ouvert
 *   • PostHog / relais injoignable → absent → `false` → ouvert
 * et le seul geste qui ferme est celui qui se lit comme tel : activer « cacher » à
 * 100 %. La polarité n'est pas un goût — c'est ce qui rend le fail-open structurel
 * au lieu de dépendre d'une consigne que personne ne relit.
 *
 * ⚠️ **Ce sont des portes d'INTERFACE, jamais des gardes.** Le pire qu'un drapeau
 * puisse faire ici, c'est faire apparaître ou disparaître un écran. Aucun ne décide
 * de ce qui sort de la machine : le redaction, les allow-lists et les confirmations
 * d'écriture ne se pilotent pas depuis le réseau (règle 7). Ajouter une entrée dont
 * la valeur ABAISSERAIT une protection est un contresens — un relais injoignable
 * deviendrait une désactivation de garde.
 */

/** Les fonctionnalités dont l'ACCÈS est gouvernable. Chaque id est aussi une section
 *  de l'app (`Section` dans `@openmasq/ui`) — la correspondance est vérifiée là-bas,
 *  ce paquet ne connaît pas les types de l'UI. */
export type FeatureId = "memory" | "library" | "competences";

export interface FeatureAccessSpec {
  id: FeatureId;
  /** La clé EXACTE du drapeau côté PostHog. **Vrai = CACHÉ** (voir l'en-tête). */
  hideFlag: string;
  /**
   * `true` ⇒ fermer l'accès arrête AUSSI l'utilisation de la fonctionnalité.
   *
   * C'est la distinction qui porte tout le dispositif. La Mémoire et la Bibliothèque
   * continuent de FONCTIONNER porte fermée — la mémoire s'injecte, s'interroge et
   * s'extrait comme avant, les fichiers continuent d'arriver ; seul l'écran
   * d'inventaire disparaît. Les Compétences, elles, cessent d'être mises en scène :
   * plus de palette « / », plus d'épinglées, plus de proposition du modèle.
   */
  cutsUsage: boolean;
}

export const FEATURE_ACCESS: readonly FeatureAccessSpec[] = [
  { id: "memory", hideFlag: "hide-memory", cutsUsage: false },
  { id: "library", hideFlag: "hide-library", cutsUsage: false },
  { id: "competences", hideFlag: "hide-competences", cutsUsage: true },
] as const;

const BY_ID = new Map(FEATURE_ACCESS.map((f) => [f.id, f]));

export function featureSpec(id: FeatureId): FeatureAccessSpec {
  // Non-null : la table est exhaustive sur `FeatureId` et `flags.test.ts` l'épingle.
  return BY_ID.get(id) as FeatureAccessSpec;
}

/** L'état de départ : **tout ouvert**. Le défaut sûr est « le produit tel qu'il est
 *  livré », pas « fermé » — fermer trois sections sur une panne de réseau serait le
 *  vrai dégât. Une fonctionnalité NOUVELLE livrée éteinte le temps d'un déploiement
 *  progressif ne s'exprime pas ici : elle n'est simplement pas encore branchée. */
export function featureAccessDefaults(): Record<FeatureId, boolean> {
  return Object.fromEntries(FEATURE_ACCESS.map((f) => [f.id, true])) as Record<
    FeatureId,
    boolean
  >;
}

/** clé de drapeau « cacher » → id, pour lire une réponse PostHog sans réécrire la table. */
export function featureIdForHideFlag(flag: string): FeatureId | undefined {
  return FEATURE_ACCESS.find((f) => f.hideFlag === flag)?.id;
}
