import type { AskTarget } from "@openmasq/schema";

/**
 * The « Demander » target's two renderings — the ONE home for both (rule 9), because
 * they must tell the same story: the context line the model receives, and the chip
 * label the user reads. If they forked, the tag could claim a folder while the payload
 * says nothing, which is the exact bug this feature closes (a bare "patrons" in the
 * draft read as a concept, and the model went off explaining Dropbox plans).
 *
 * The line rides the MODEL payload only (`store.sendMessage` prefixes it, like a
 * compétence prompt) — never the displayed bubble, which shows the tag instead. It
 * goes through the same redaction as typed text.
 */

/** The context line prepended to the model payload — situates the target and points
 *  the model at the right tools instead of letting it guess (or web-search) the name. */
export function askTargetLaunchText(t: AskTarget): string {
  const noun = t.kind === "folder" ? "dossier" : "fichier";
  const where = t.path
    ? ` (chemin local : ${t.path})`
    : t.source
      ? ` stocké sur ${t.source}`
      : "";
  const how = t.path
    ? "les outils de fichiers"
    : t.source
      ? `les outils ${t.source}`
      : "les outils du connecteur";
  return (
    `Ma question porte sur le ${noun} « ${t.name} »${where}. ` +
    `Si besoin, utilise ${how} pour le retrouver et lire son contenu avant de répondre.`
  );
}

/** The chip label (composer + sent bubble): what the target IS, then where it lives. */
export function askTargetLabel(t: AskTarget): string {
  const noun = t.kind === "folder" ? "Dossier" : "Fichier";
  return `${noun} : ${t.name}${t.source ? ` — ${t.source}` : ""}`;
}
