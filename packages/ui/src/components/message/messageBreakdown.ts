/** "1 name · 1 email · 2 companies" from a message's redacted spans. */
// Covers EVERY redaction category so the breakdown always sums to the total
// (`message.redactions`). Any unmapped kind falls into an "other" bucket — never
// silently dropped, otherwise the detail wouldn't reconcile with the count.
const BREAKDOWN_LABELS: Record<string, [string, string]> = {
  name: ["nom", "noms"],
  dob: ["date de naissance", "dates de naissance"],
  health: ["donnée de santé", "données de santé"],
  email: ["e-mail", "e-mails"],
  phone: ["téléphone", "téléphones"],
  address: ["adresse", "adresses"],
  location: ["lieu", "lieux"],
  company: ["entreprise", "entreprises"],
  card: ["carte", "cartes"],
  iban: ["IBAN", "IBAN"],
  national_id: ["identifiant", "identifiants"],
  ip: ["IP", "IP"],
  number: ["numéro", "numéros"],
  secret: ["secret", "secrets"],
  apikey: ["clé d'accès", "clés d'accès"],
};
const BREAKDOWN_ORDER = Object.keys(BREAKDOWN_LABELS);

export function breakdown(spans: { value: string; kind: string }[]): string {
  const counts: Record<string, number> = {};
  let other = 0;
  for (const s of spans) {
    if (BREAKDOWN_LABELS[s.kind]) counts[s.kind] = (counts[s.kind] ?? 0) + 1;
    else other += 1;
  }
  const parts = BREAKDOWN_ORDER.filter((k) => counts[k]).map(
    (k) => `${counts[k]} ${BREAKDOWN_LABELS[k][counts[k] > 1 ? 1 : 0]}`,
  );
  if (other) parts.push(`${other} autre${other > 1 ? "s" : ""}`);
  return parts.join(" · ");
}
