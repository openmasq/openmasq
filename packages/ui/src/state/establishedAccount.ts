import type { BillingSubscription, OrgProfileInfo } from "../host";

/**
 * « Ce compte est déjà installé quelque part » — la décision, pure.
 *
 * `Settings.onboarded` est LOCAL à la machine (localStorage scopé par compte + DB locale,
 * jamais synchronisé) : un abonné qui se connecte sur un NOUVEL appareil retombait donc
 * sur l'accueil complet, étape « Abonnement, ou votre clé » comprise — proposer de payer
 * à quelqu'un qui paie déjà. Cette règle dit quand le compte est manifestement ÉTABLI :
 * l'accueil n'a alors plus rien à lui apprendre ni à lui vendre, et `ShellChrome` pose
 * `onboarded` sans le faire repasser par la modale.
 *
 * ⚠️ `null` = PAS ENCORE CHARGÉ, et ne vaut ni « libre » ni « établi » (même règle que
 * `needsAccessNotice`) : au démarrage la facturation arrive après le premier rendu, et
 * trancher avant de savoir ferait sauter l'accueil à un vrai nouveau venu — ou l'infligerait
 * à un abonné. Tant qu'on ne sait pas, on ne saute pas.
 *
 * On ne touche PAS `billingMode` en sautant : sans clé sur cette machine, le routage
 * retombe déjà sur l'abonnement (`send/routing.ts` — le défaut « byo » n'est un choix
 * que lorsqu'une clé existe), et pré-répondre à sa place est exactement ce que
 * `KeyChoice` refuse de faire.
 */
export function hasEstablishedAccount(p: {
  /** L'abonnement individuel. `null` = pas encore chargé. */
  personalSub: BillingSubscription | null;
  /** Membre d'une organisation ⇒ ses accès existent déjà, gérés par un admin. */
  orgProfile: OrgProfileInfo | null;
}): boolean {
  if (p.orgProfile) return true;
  return !!p.personalSub && (p.personalSub.tier ?? "free") !== "free";
}
