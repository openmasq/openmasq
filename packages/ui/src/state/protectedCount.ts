import { entityKey } from "@openmasq/redact";
import type { Conversation } from "../types";

/**
 * "How many values did the app protect" — the ONE definition every surface that shows
 * that number must use (rule 9): the sidebar shield, the chat header, the mobile
 * thread badge, the Réglages → Confidentialité « tout ce qui a été redacted » card,
 * l'encart Transparence et son comparatif, et l'onglet Journal. The user compares them
 * side by side, so a second formula reads as a bug about their data, not as a nuance.
 *
 * A protected item = **one distinct VALUE the engine recognised**, read off the
 * conversation's persisted vault (fake → original). That source is reload-safe and
 * covers every path a value can be redacted by — typed text, MCP tool results,
 * documents, exports.
 *
 * ⚠️ **Le coffre porte PLUSIEURS entrées pour une seule valeur, et elles ne se comptent
 * pas.** Pour un nom, le moteur y écrit aussi chaque MOT et ses variantes de casse
 * (« Claire », « claire », « Berliand », « berliand ») ; pour une adresse, son DOMAINE.
 * Elles existent pour que la substitution attrape toutes les graphies — ce sont des
 * alias d'une même information, pas des informations de plus. Comptées, un message
 * portant un nom, un e-mail, un téléphone et un IBAN annonçait « 9 informations
 * protégées » au-dessus d'un comparatif qui n'en montrait que 4 : le chiffre
 * contredisait la preuve qu'il introduit.
 *
 * `redactionKinds` (⊕ les `redactedSpans` des messages) ne contient QUE les valeurs
 * reconnues comme correspondances — jamais un alias — donc il dit lesquelles sont
 * canoniques. Une entrée non canonique dont la clé est un fragment d'une canonique est
 * un alias ; tout le reste est gardé. Une conversation d'avant `redactionKinds` n'a
 * rien de canonique : on ne devine pas, on rend le coffre tel quel (pas de sous-compte).
 *
 * The rail used to sum each message's `redactions` instead, which is a different
 * quantity twice over: it counts a send's match OCCURRENCES (a value typed twice
 * counts twice) and only the ones found in typed message text, so documents and tool
 * results were missing. `Settings/privacy/privacyStats.test.ts` pins the parity.
 */

/** Les valeurs réelles que le moteur a RECONNUES dans cette conversation — l'union du
 *  `redactionKinds` persisté et des `redactedSpans` encore en mémoire. */
function canonicalValues(c: Conversation): Set<string> {
  const out = new Set<string>(Object.keys(c.redactionKinds ?? {}));
  for (const m of c.messages ?? []) for (const s of m.redactedSpans ?? []) out.add(s.value);
  return out;
}

/** Les entrées BRUTES du coffre, alias compris — la substitution les utilise toutes. */
export function vaultEntries(c: Conversation): [fake: string, original: string][] {
  return Object.entries(c.redactionVault ?? {}).filter(
    (e): e is [string, string] => !!e[0] && !!e[1],
  );
}

/** Une entrée par valeur protégée : les alias du coffre repliés sur la leur. */
export function protectedEntries(c: Conversation): [fake: string, original: string][] {
  const all = vaultEntries(c);
  const canonKeys = [...canonicalValues(c)].map(entityKey).filter(Boolean);
  if (!canonKeys.length) return all;
  const canonical = new Set(canonKeys);
  const seen = new Set<string>();
  const out: [string, string][] = [];
  for (const [fake, original] of all) {
    const key = entityKey(original);
    if (!key) continue;
    // Un alias : la valeur n'est pas reconnue pour elle-même, et sa clé n'est qu'un
    // fragment d'une valeur qui l'est. (Le test de fragment ne s'applique JAMAIS à une
    // canonique : « Claire Berliand » est contenu dans « claire.berliand@… » sans être
    // un alias de l'adresse — ce sont deux informations.)
    if (!canonical.has(key) && canonKeys.some((ck) => ck.includes(key))) continue;
    if (seen.has(key)) continue; // variantes de casse/ponctuation de la même valeur
    seen.add(key);
    out.push([fake, original]);
  }
  return out;
}

/** Values protected in ONE conversation (the chat header's number). */
export function conversationProtectedCount(c: Conversation): number {
  return protectedEntries(c).length;
}

/** Values protected across the account (the sidebar shield's number). */
export function protectedCount(conversations: readonly Conversation[]): number {
  return conversations.reduce((n, c) => n + conversationProtectedCount(c), 0);
}
