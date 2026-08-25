import { applyVault } from "@openmasq/redact";
import { conversationProtectedCount, protectedEntries } from "../state/protectedCount";
import type { Conversation, Message } from "../types";

/**
 * TRANSPARENCE — « voyez ce que le modèle a vu ».
 *
 * Le produit tient déjà sa promesse, mais il ne la MONTRE qu'à qui sait où regarder :
 * une marque au survol, une ligne sous chaque message, et un comparatif message-par-
 * message qui n'existait que dans le journal technique, réservé aux comptes internes.
 * Un utilisateur ordinaire ne pouvait donc pas VÉRIFIER — seulement croire. C'est le
 * constat de l'audit du 27/07 : la fonction existait, cachée dans « Développeur ».
 *
 * Rien ici n'a besoin d'être enregistré au moment de l'envoi : ce que le modèle a reçu
 * se REDÉRIVE du texte réel et du coffre de la conversation, par la même substitution
 * que le send (`applyVault`). Le comparatif ne peut donc pas mentir en dérivant d'une
 * copie prise à part — il rejoue la même fonction, sur les mêmes données.
 */

/** Un message et sa contrepartie telle qu'elle est partie. */
export interface TransparencyPair {
  id: string;
  role: Message["role"];
  /** Ce que l'utilisateur a écrit — valeurs réelles. */
  real: string;
  /** Ce que le modèle a reçu — valeurs remplacées par leurs pseudonymes. */
  wire: string;
  /** Nombre de valeurs effectivement remplacées dans CE message. */
  swapped: number;
}

/**
 * Le texte du message tel qu'il compte pour la transparence : `modelContent` quand il
 * existe (il porte les documents dépliés, donc ce qui est VRAIMENT parti), sinon le
 * contenu affiché.
 */
function sourceText(m: Message): string {
  return m.modelContent ?? m.content ?? "";
}

/**
 * Combien de valeurs protégées apparaissent réellement dans ce texte.
 *
 * ⚠️ Sur `protectedEntries`, jamais sur le coffre brut : celui-ci porte les ALIAS d'une
 * même valeur (chaque mot d'un nom, ses casses, le domaine d'une adresse), et les compter
 * annonçait « 9 remplacements » au-dessus de deux colonnes qui en montrent 4.
 */
function countSwapped(real: string, wire: string, entries: [string, string][]): number {
  let n = 0;
  for (const [token, value] of entries) if (real.includes(value) && wire.includes(token)) n++;
  return n;
}

/**
 * Le comparatif d'une conversation : un couple par message qui a réellement quelque
 * chose à montrer.
 *
 * ⚠️ Les messages SANS substitution sont écartés — un couple identique des deux côtés
 * n'apprend rien et dilue ceux qui comptent. C'est aussi ce qui rend l'encart honnête :
 * s'il annonce « N infos protégées », les N sont visibles.
 */
export function transparencyPairs(conv: Conversation): TransparencyPair[] {
  const vault = conv.redactionVault ?? {};
  if (!Object.keys(vault).length) return [];
  const entries = protectedEntries(conv);
  const out: TransparencyPair[] = [];
  for (const m of conv.messages ?? []) {
    const real = sourceText(m);
    if (!real.trim()) continue;
    // La substitution reste celle du send : le coffre ENTIER, alias compris. Seul le
    // COMPTE se lit sur les valeurs distinctes.
    const wire = applyVault(real, vault);
    if (wire === real) continue;
    out.push({ id: m.id, role: m.role, real, wire, swapped: countSwapped(real, wire, entries) });
  }
  return out;
}

/**
 * Combien de valeurs distinctes ont été protégées dans cette conversation — le N de
 * l'encart. Ré-export de la définition unique (`state/protectedCount.ts`) : l'encart, le
 * bouclier du rail et l'en-tête du chat sont lus côte à côte, deux formules s'y liraient
 * comme un bug sur les données de l'utilisateur.
 */
export const protectedValueCount = conversationProtectedCount;

/**
 * L'encart doit-il s'afficher ?
 *
 * Quatre conditions, et la première est celle qui le rend supportable : il ne se montre
 * QU'UNE FOIS, jamais par conversation. Un bandeau de réassurance qui revient à chaque
 * nouveau chat cesse d'être lu au troisième, et devient le bruit dont l'utilisateur
 * apprend à se débarrasser — l'inverse de ce que l'audit demande.
 *
 * Il attend AUSSI la première réponse : avant elle, l'utilisateur n'a encore rien vu
 * partir, et « voyez ce que le modèle a vu » ne désigne rien.
 */
export function shouldShowTransparencyCard(
  conv: Conversation | null | undefined,
  alreadySeen: boolean | undefined,
): boolean {
  if (!conv || alreadySeen) return false;
  if (protectedValueCount(conv) === 0) return false;
  const settledReply = (conv.messages ?? []).some((m) => m.role === "assistant" && !m.pending);
  if (!settledReply) return false;
  return transparencyPairs(conv).length > 0;
}
