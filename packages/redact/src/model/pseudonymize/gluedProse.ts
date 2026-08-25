/** Words a French sentence glues onto the next when the OCR loses its spaces. Deliberately
 *  a CLOSED list of function words: they open a phrase, never a credential. */
const GLUED_PREFIX =
  /^(?:le|la|les|du|de|des|au|aux|un|une|et|ou|en|par|pour|sur|sous|dans|avec|sans|ce|cette|ces|son|sa|ses|leur|leurs|the|of|and|for|with)(?=[\p{L}\d])/iu;

/** OCR run-together prose masquerading as an opaque token ("le20juin2024", "du20juin2024a").
 *
 *  ⚠️ Shape alone CANNOT separate this from a real credential — `wja29fhq0284hfqp2` and
 *  `du20juin2024a` are the same shape, and dropping a real secret is a LEAK, the one error
 *  this engine must never make. So the gate fires only on the one signal a credential never
 *  carries: the value OPENS with a function word glued to what follows. The rest of the
 *  glued-prose false positives are left in place on purpose — over-redacting a scan is
 *  noise, under-redacting a key is a breach. */
export function isGluedProse(value: string): boolean {
  const v = value.trim();
  // ⚠️ Une valeur SANS AUCUNE MINUSCULE n'est pas de la prose : l'OCR qui colle les mots
  // rend « le20juin2024 », jamais « UNCRITMMXXX ». Le préfixe étant testé sans égard à la
  // casse, la garde tirait sur tout code en capitales ouvrant par un mot-outil — « UN »CR…,
  // « CE »PA…, « DE »812345678 — et le moteur, qui avait pourtant DÉTECTÉ la donnée,
  // l'envoyait en clair sans rien signaler (fail-open : ni `matches`, ni `modelError`).
  // Mesuré sur le banc : 3 valeurs sur 2 333, dont deux BIC et un numéro de TVA allemand.
  if (!/\p{Ll}/u.test(v)) return false;
  return v.length >= 10 && !/[\s\-_./@]/.test(v) && GLUED_PREFIX.test(v);
}
