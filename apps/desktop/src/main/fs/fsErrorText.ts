/**
 * Le texte d'erreur rendu au MODÈLE — la moitié « guidage » du refus, pure et testée.
 *
 * ⚠️ Un ENOENT sur la surface outil est presque toujours un chemin RECOMPOSÉ : les
 * chemins reviennent au modèle redacted segment par segment, il ne peut pas les
 * mémoriser — alors il en assemble un à partir de fragments (un nom lu dans un contenu,
 * un dossier deviné) et `stat` échoue. Mesuré le 15/08 : trois `get_file_info` ENOENT
 * d'affilée sur des chemins plausibles mais inexistants, jusqu'au cap de la boucle.
 * Le brut Node (« ENOENT: no such file or directory ») ne lui apprend rien ; la sortie
 * existe (relister, recopier exactement) — même remède que le refus « hors des dossiers
 * autorisés » (`grant.ts`) et que le domaine deviné du navigateur.
 *
 * La surface UI garde l'erreur BRUTE : elle parle à du code, pas à un modèle, et un
 * guidage en français dans une erreur programmatique serait du bruit.
 */
const ENOENT_GUIDANCE =
  ". Ce chemin n'existe pas — ne recompose JAMAIS un chemin à partir de fragments : " +
  "liste d'abord le dossier (list_directory) et recopie un chemin EXACTEMENT tel " +
  "qu'un résultat l'a rendu.";

export function fsErrorText(err: unknown, surface: "tool" | "ui"): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (surface !== "tool") return msg;
  if ((err as NodeJS.ErrnoException)?.code === "ENOENT") return msg + ENOENT_GUIDANCE;
  return msg;
}
