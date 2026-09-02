/** "1 name · 1 email · 2 companies" from a message's redacted spans. */
// Covers EVERY redaction category so the breakdown always sums to the total
// (`message.redactions`). Any unmapped kind falls into an `other` bucket — never
// silently dropped, otherwise the detail wouldn't reconcile with the count.
//
// The WORDS live in the catalogue (`t.conversation.bubble.breakdownLabels`, rule 14):
// they were hardcoded in French here, so an English build read "1 nom · 1 téléphone".
// The ORDER stays here — it is structure, not copy.
const BREAKDOWN_ORDER = [
  "name", "dob", "health", "email", "phone", "address", "location",
  "company", "card", "iban", "national_id", "ip", "number", "secret", "apikey",
];

export function breakdown(
  spans: { value: string; kind: string }[],
  labels: Record<string, [string, string]>,
): string {
  const counts: Record<string, number> = {};
  let other = 0;
  for (const s of spans) {
    if (labels[s.kind] && s.kind !== "other") counts[s.kind] = (counts[s.kind] ?? 0) + 1;
    else other += 1;
  }
  const word = (kind: string, n: number): string => {
    const pair = labels[kind];
    return pair ? pair[n > 1 ? 1 : 0] : kind;
  };
  const parts = BREAKDOWN_ORDER.filter((k) => counts[k]).map((k) => `${counts[k]} ${word(k, counts[k])}`);
  if (other) parts.push(`${other} ${word("other", other)}`);
  return parts.join(" · ");
}
