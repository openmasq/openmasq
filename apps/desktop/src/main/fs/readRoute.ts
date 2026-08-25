/**
 * QUI lit un fichier pour le modèle : le worker, ou le pipeline d'extraction de MAIN.
 *
 * Deux règles, une seule décision — pure, donc testable sans forker quoi que ce soit.
 *
 * 1. `read_document` se scinde par FORMAT (la règle d'origine) : un `.docx` est lu dans le
 *    WORKER par la logique de paragraphes que `edit_document` sait retrouver ; tout le
 *    reste passe par MAIN (pdf.js, OOXML, OCR — hors de portée d'un worker Node nu).
 *
 * 2. ⚠️ `read_file` sur un DOCUMENT est routé vers la même extraction, au lieu du refus.
 *    Mesuré le 15/08/2026 sur de vraies factures : le modèle appelle `read_file` sur un
 *    PDF, le refus du worker NOMME pourtant `read_document`… et le même appel repart à
 *    l'identique, trois fois par fichier, jusqu'au cap de la boucle — l'utilisateur reçoit
 *    « Boucle d'outils interrompue » sur un dossier que l'app sait parfaitement lire. Un
 *    modèle faible ne se corrige pas sur un message, si juste soit-il — vérifié sur deux
 *    modèles, deux jours de suite.
 *
 *    Ce n'est PAS un élargissement de capacité (règle 7) : `read_document` est déjà offert
 *    au même modèle, sur le même chemin, derrière le même `grant.resolve`, et le résultat
 *    repart redacted par le même chemin. Et le mal que `binaryGuard` prévient — 16 000
 *    caractères de charabia puis 4,5 s de NER dessus — ne revient pas : une extraction rend
 *    du VRAI texte. Le refus reste entier pour ce qui n'a rien à extraire (image, archive,
 *    exécutable) : là, aucun autre outil ne ferait mieux.
 */
import { BRAND } from "@openmasq/branding";


/** Formats dont l'app sait extraire du texte — la liste de `binaryGuard.ts`, son seul
 *  autre lecteur, gardée à UN endroit (règle 9). */
export const EXTRACTABLE = /\.(pdf|docx|doc|xlsx|xlsm|xls|pptx|ppt|odt|ods|odp|rtf|pages|numbers|key)$/i;

export type ReadRoute =
  /** L'op part au worker telle quelle. */
  | "worker"
  /** Le worker, mais par `read_document` : la lecture .docx par paragraphes. */
  | "docx-worker"
  /** Le pipeline d'extraction de MAIN (PDF, tableurs, présentations, scans + OCR). */
  | "main-extract";

export function readRoute(tool: string, path: unknown): ReadRoute {
  if (typeof path !== "string" || !path) return "worker";
  const isDoc = EXTRACTABLE.test(path);
  const isDocx = /\.docx$/i.test(path);
  if (tool === "read_document") return isDocx ? "docx-worker" : "main-extract";
  // Le repli ne vaut QUE pour un document : un `.txt`, un `.csv` ou une extension inconnue
  // restent la lecture texte paginée du worker, verdict d'octets compris.
  if (tool === "read_file" && isDoc) return isDocx ? "docx-worker" : "main-extract";
  return "worker";
}

/** Ce que le modèle lit en tête d'un `read_file` rerouté : le résultat DIT ce qui s'est
 *  passé (il n'a pas lu des octets) et nomme l'outil direct pour la prochaine fois. Une
 *  substitution muette apprendrait au modèle que `read_file` lit les PDF — faux ailleurs. */
export function extractedNote(name: string): string {
  return (
    `[« ${name} » est un document : ${BRAND.name} en a extrait le texte avec \`read_document\` ` +
    `— appelle-le directement la prochaine fois, \`read_file\` ne lit que du texte brut.]\n`
  );
}
