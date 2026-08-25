// Où FINIT une adresse — le seul sujet de ce fichier, sorti de `addresses.ts` pour le
// garder sous le plafond ET parce que le champ étiqueté « Adresse : … » a besoin de la
// MÊME coupe (règle 9 : une seconde implémentation dériverait).

// A French/EU street address ENDS at its "postal code + city". The NAME/CITY
// sub-patterns are permissive (they allow spaces + `.` so multi-word streets and
// cities match), so a span sometimes over-runs into trailing legal boilerplate glued
// to the city — "… 75012 PARIS. SIRET 863 471 587", "…75012 PARISsiège",
// "…75012 Paris.Capital: 100€.". Because the captured VALUE is the vault key, the
// SAME address written with different trailing text became DIFFERENT spans → a
// DIFFERENT fake each time (the reported bug). `trimAddressTail` cuts the value right
// after the city so every trailing variant collapses to ONE span (→ one fake).
//
// City = a run of Capitalised words (all-caps "PARIS" OR Title "Paris"), joined by
// space/hyphen, French connectors (en/de/la/sur…) lowercased — so it STOPS at a
// period, a digit, or a lowercase-glued continuation ("PARIS"→ drops "siège"). Only
// the FR/EU "code → city" order is handled (EN "City ST ZIP" / CJK are left as-is).
const CITY_WORD = "\\p{Lu}\\p{Ll}+|\\p{Lu}+";
// Les connecteurs qui vivent DANS un toponyme (« Neuilly sur Seine », « Villeneuve-d'Ascq »).
const CITY_CONN = "en|de|du|des|la|le|les|l[eè]s|sur|sous|aux?|d['’]";
// ⚠️ « et » n'est dans un nom de commune qu'à TRAIT D'UNION (« Ille-et-Vilaine ») ; espacé,
// c'est la conjonction la plus courante du français.
const CITY_CONN_HYPHEN = "et";
// ⚠️ Un connecteur doit être ENCADRÉ par deux mots de ville : une course ne peut pas s'y
// terminer. Remonté par un utilisateur (12/08/2026) — « … 67000 Strasbourg et je travaille »
// vaultait « Strasbourg et », donc le faux EFFAÇAIT le « et » et le modèle recevait un texte
// mutilé. Idem « Strasbourg sur le papier » → « Strasbourg sur le ». `detectors.test.ts`.
const CITY_RUN = `(?:${CITY_WORD})(?:(?:[ -](?:${CITY_WORD}|${CITY_CONN})|-(?:${CITY_CONN_HYPHEN})){0,3}[ -](?:${CITY_WORD}))?`;
const ADDR_END = new RegExp(
  `(?:\\d{5}|\\d{4}-\\d{3}|\\d{4}\\s?[A-Z]{2}|\\d{4})[,\\s]+(?:${CITY_RUN})`,
  "u",
);
/** Coupe à la FIN de l'adresse. Exportée parce que le champ étiqueté « Adresse : … » a le
 *  même besoin (sa capture va au bout de la LIGNE) et qu'une 2ᵉ implémentation dériverait. */
export function trimAddressTail(v: string): string {
  const m = ADDR_END.exec(v);
  return m ? v.slice(0, m.index + m[0].length) : v;
}
