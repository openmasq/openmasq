// The PROSE form of account and secret fields (« mon pseudo est arvio92 »,
// « le mot de passe est corbeau83 ») — extracted from contextFields.ts for the 300-line
// cap (rule 1). Same Detection contract, re-exported by contextFields.
import type { Detection } from "../types";

/**
 * The PROSE form of an account field: « mon pseudo est arvio92 », « my login is
 * jdoe ». The labeled detector below requires a COLON — measured on a manual
 * bench, « Pseudo : arvio92 » passed and « Mon pseudo est arvio92 » didn't,
 * even though the second is how it's actually written in a chat.
 *
 * ⚠️ The POSSESSIVE is mandatory, and it's what makes the rule safe: « le login est
 * obligatoire » must not redact « obligatoire ». The value stops at the first
 * space or punctuation mark — it can't swallow the rest of the sentence.
 *
 * Three extensions, all resting on this same possessive (measured on the
 * `campagne-v1` corpus: 6 of the 13 missed identifiers):
 *  • `gamertag` — an account name like any other, simply missing from the list;
 *  • ONE qualifier between the name and the copula (« mon identifiant CLIENT est … »,
 *    « mon login WINDOWS est … ») — a single word, never two, so as not to cross
 *    an entire clause;
 *  • the COLON form (« mon id Discord : augustin#4521 »).
 *
 * ⚠️ `id` is admitted HERE and nowhere else, and the possessive is what makes the
 * difference: `LABEL_GROUPS` deliberately excludes bare `id`/`identifiant`/`utilisateur`
 * because « Identifiant : » over-triggers. « MON id … » doesn't over-trigger. The
 * `(?![\p{L}])` stops `id` from catching the start of « idée » or « identité » — and it's
 * a `(?!…)` rather than a `\b` because `\b` is ASCII-only in JS (see `gate()`).
 */
const SELF_HANDLE =
  /\b(?:mon|ma|notre|my|our)\s+(?:pseudo(?:nyme)?|login|identifiant|gamertag|nom d['’ ]utilisateur|username|handle|nickname|id)(?![\p{L}])(?:\s+[\p{L}]{2,12})?\s*(?:\s(?:est|is)\s|[:：])\s*([^\s.,;:!?«»"']{3,60})/giu;

/**
 * The prose form of a SECRET: « le mot de passe est corbeau83 », « my password is
 * hunter2secret ». Same architecture as SELF_HANDLE (bounded copula, value = ONE token),
 * but the precision anchor differs: the ARTICLE is allowed (a password is said "le
 * mot de passe", not "mon"), so it's the VALUE that carries the guard — it must
 * contain a digit, a capital letter or a symbol. « le mot de passe est obligatoire »
 * never redacts « obligatoire »; all-lowercase « azerty » is the accepted trade-off.
 * ONE qualifier tolerated (« le mot de passe applicatif est … »), like SELF_HANDLE.
 *
 * ⚠️ The « code DE something » cases are an ALLOW-LIST of things you unlock
 * (`CODE_OF`), never a generic `code de \p{L}+`: « le code de la route est clair »
 * would be one. Reported on 11/08 — « Le code du coffre est 4581 » went out in clear while
 * « Code du coffre : 4581 » was correctly redacted: the colon form was
 * covered, the spoken form wasn't, and that's the one people write in a chat.
 */
const CODE_OF =
  "coffre(?:-fort)?|porte|portail|entr[ée]e|immeuble|alarme|cadenas|digicode|interphone|" +
  "bo[îi]te aux lettres|valise|carte|badge|wifi|box";
const SELF_SECRET = new RegExp(
  String.raw`\b(?:le|la|el|das|der|die|the|mon|ma|notre|my|our|mein|meine|mi|meu|minha)\s+` +
    String.raw`(?:mot de passe|mdp|password|passphrase|passwort|kennwort|contraseña|senha|` +
    String.raw`code (?:secret|confidentiel|pin|wifi|d['’]acc[èe]s|de s[ée]curit[ée]|` +
    String.raw`(?:du |de la |de l['’]|des )(?:${CODE_OF})))` +
    String.raw`(?![\p{L}])(?:\s+[\p{L}]{2,12})?\s*(?:\s(?:est|is|ist|es|é)\s|[:：])\s*([^\s.,;:!?«»"']{3,60})`,
  "giu",
);

export function detectSelfHandles(text: string): Detection[] {
  const out: Detection[] = [];
  for (const m of text.matchAll(SELF_HANDLE)) {
    const value = m[1]?.replace(/[.,;:!?)\]]+$/u, "");
    if (value && value.length >= 3) out.push({ value, category: "USERNAME" });
  }
  for (const m of text.matchAll(SELF_SECRET)) {
    const value = m[1]?.replace(/[.,;:!?)\]]+$/u, "");
    if (value && value.length >= 3 && /[\d\p{Lu}\p{P}\p{S}]/u.test(value))
      out.push({ value, category: "SECRET" });
  }
  return out;
}
