import { captureError } from "../analytics";
import { BRAND } from "@openmasq/branding";

/**
 * Un échec de la base chiffrée n'est JAMAIS silencieux — c'était la pire classe de
 * l'audit observabilité (13/08) : `saveConversation(...).catch(() => {})` laissait un
 * disque plein / une base verrouillée / une corruption « réussir » en mémoire, et les
 * dernières heures de conversations ET LEURS VAULTS disparaissaient au redémarrage sans
 * une ligne nulle part. Ici : console (le poste) + `captureError` (le canal $exception,
 * borné et sans contenu — scope/code/nom/message d'erreur seulement, jamais une donnée).
 *
 * Le comportement de SECOURS ne change pas : un save raté reste non-bloquant (l'app vit
 * en mémoire), un load raté rend `null` et laisse le miroir COUPÉ — le réactiver ferait
 * ré-écrire par-dessus une base qu'on n'a pas su lire avec la copie EXPURGÉE du
 * localStorage (sans vaults), c'est-à-dire transformer une panne de lecture en perte de
 * données. On dit la panne ; on ne « répare » pas à l'aveugle.
 */
export const dbFailure =
  (code: string) =>
  (e: unknown): void => {
    // eslint-disable-next-line no-console
    console.error(`[${BRAND.slug}] db.${code} a échoué :`, e);
    captureError({
      scope: "db",
      code,
      name: e instanceof Error ? e.name : undefined,
      message: e instanceof Error ? e.message : String(e),
    });
  };

/** Le repli du chargement : rapporte, puis rend `null` (même contrat qu'avant — le
 *  miroir reste coupé, voir l'en-tête). */
export const dbLoadFailure = (e: unknown): null => {
  dbFailure("load")(e);
  return null;
};
