// La forme EN PROSE des champs de compte et de secret (« mon pseudo est arvio92 »,
// « le mot de passe est corbeau83 ») — extraite de contextFields.ts pour le plafond
// des 300 lignes (règle 1). Même contrat Detection, re-exportée par contextFields.
import type { Detection } from "../types";

/**
 * La forme EN PROSE d'un champ de compte : « mon pseudo est arvio92 », « my login is
 * jdoe ». Le détecteur étiqueté ci-dessous exige un DEUX-POINTS — mesuré sur un bench
 * manuel, « Pseudo : arvio92 » passait et « Mon pseudo est arvio92 » ne passait pas,
 * alors que la seconde est la façon dont on l'écrit dans un chat.
 *
 * ⚠️ Le POSSESSIF est obligatoire, et c'est lui qui rend la règle sûre : « le login est
 * obligatoire » ne doit pas redact « obligatoire ». La valeur s'arrête au premier
 * blanc ou signe de ponctuation — elle ne peut pas avaler la fin de la phrase.
 *
 * Trois élargissements, tous adossés à ce même possessif (mesurés sur le corpus
 * `campagne-v1` : 6 des 13 identifiants manqués) :
 *  • `gamertag` — un nom de compte comme les autres, simplement absent de la liste ;
 *  • UN qualificatif entre le nom et la copule (« mon identifiant CLIENT est … »,
 *    « mon login WINDOWS est … ») — un seul mot, jamais deux, pour ne pas franchir
 *    une proposition entière ;
 *  • la forme à DEUX-POINTS (« mon id Discord : augustin#4521 »).
 *
 * ⚠️ `id` est admis ICI et nulle part ailleurs, et c'est le possessif qui fait la
 * différence : `LABEL_GROUPS` exclut délibérément `id`/`identifiant`/`utilisateur` nus
 * parce que « Identifiant : » sur-déclenche. « MON id … » ne sur-déclenche pas. Le
 * `(?![\p{L}])` empêche `id` d'attraper le début d'« idée » ou d'« identité » — et c'est
 * un `(?!…)` plutôt qu'un `\b` parce que `\b` est ASCII-only en JS (cf. `gate()`).
 */
const SELF_HANDLE =
  /\b(?:mon|ma|notre|my|our)\s+(?:pseudo(?:nyme)?|login|identifiant|gamertag|nom d['’ ]utilisateur|username|handle|nickname|id)(?![\p{L}])(?:\s+[\p{L}]{2,12})?\s*(?:\s(?:est|is)\s|[:：])\s*([^\s.,;:!?«»"']{3,60})/giu;

/**
 * La forme en prose d'un SECRET : « le mot de passe est corbeau83 », « my password is
 * hunter2secret ». Même architecture que SELF_HANDLE (copule bornée, valeur = UN jeton),
 * mais l'ancre de précision diffère : l'ARTICLE est admis (un mot de passe se dit « le
 * mot de passe », pas « mon »), donc c'est la VALEUR qui porte la garde — elle doit
 * contenir un chiffre, une capitale ou un symbole. « le mot de passe est obligatoire »
 * ne redacted jamais « obligatoire » ; « azerty » tout-minuscules est le trade assumé.
 * UN qualificatif toléré (« le mot de passe applicatif est … »), comme SELF_HANDLE.
 *
 * ⚠️ Les « code DE quelque chose » sont une ALLOW-LIST de choses qu'on déverrouille
 * (`CODE_OF`), jamais un `code de \p{L}+` générique : « le code de la route est clair »
 * en serait un. Remonté le 11/08 — « Le code du coffre est 4581 » passait en clair alors
 * que « Code du coffre : 4581 » était bien redacted : la forme à deux-points était
 * couverte, la forme parlée non, et c'est celle qu'on écrit dans un chat.
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
