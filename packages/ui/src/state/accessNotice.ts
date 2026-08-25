import type { BillingSubscription, CreditBalance, OrgProfileInfo } from "../host";

/**
 * « Vous n'avez aucun accès » — la décision, pure.
 *
 * Deux voies mènent au catalogue complet : un **abonnement** (les modèles passent par les
 * crédits d'abonnement) ou **votre propre clé** chez un fournisseur. Sans ni l'un ni l'autre, le
 * sélecteur se réduit aux modèles gratuits — et l'utilisateur ne l'apprend qu'en voyant une
 * liste courte, ou en butant sur le quota journalier d'un modèle gratuit.
 *
 * ⚠️ Ce que la bannière ne dit PAS : « vous ne pouvez rien envoyer ». C'est faux — les
 * modèles gratuits marchent sans rien. Elle annonce ce qui MANQUE, pas un blocage.
 */
export interface AccessNoticeInput {
  /** Les fournisseurs dont une clé est enregistrée sur cette machine. */
  keyConfigured: ReadonlySet<string>;
  /** L'abonnement individuel. `null` = pas encore chargé. */
  personalSub: BillingSubscription | null;
  /** Le solde prépayé individuel. `null` = pas encore chargé. */
  personalCredits: CreditBalance | null;
  /** Membre d'une organisation ⇒ ses accès sont gérés par un admin. */
  orgProfile: OrgProfileInfo | null;
  /** La plateforme expose-t-elle une surface de facturation ? Sinon rien à proposer. */
  hasBilling: boolean;
}

export function needsAccessNotice(p: AccessNoticeInput): boolean {
  // Un membre d'organisation ne choisit pas : lui dire de prendre un abonnement le
  // renverrait vers une page qui ne le concerne pas.
  if (p.orgProfile) return false;
  // Rien à vendre sur cette plateforme (aperçu web) ⇒ pas de bannière.
  if (!p.hasBilling) return false;
  // Une seule clé, n'importe laquelle, suffit à ouvrir une voie.
  if (p.keyConfigured.size > 0) return false;
  // ⚠️ `null` = PAS ENCORE CHARGÉ, et ne vaut pas « aucun abonnement » : au démarrage la
  // facturation arrive après le premier rendu, et annoncer un manque avant de savoir
  // ferait clignoter la bannière chez quelqu'un qui paie.
  if (!p.personalSub) return false;
  if ((p.personalSub.tier ?? "free") !== "free") return false;
  // Un crédit restant (offert, promo) est un accès : il s'épuisera, et c'est le blocage
  // d'envoi qui le dira alors — pas une bannière permanente au-dessus du composeur.
  if (p.personalCredits && !p.personalCredits.blocked) return false;
  return true;
}
