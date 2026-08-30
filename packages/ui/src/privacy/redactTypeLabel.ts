import type { Messages } from "@openmasq/i18n";
import type { RedactType } from "@openmasq/redact";

/**
 * L'étiquette LUE d'un type de redaction manuel.
 *
 * Le vocabulaire technique — la clé et le `token` du moteur — reste dans
 * `@openmasq/redact` : c'est SA langue, et le moteur tourne aussi côté serveur, sans
 * catalogue. Seul le mot montré à l'utilisateur vient d'ici.
 *
 * Le `label` français porté par `REDACT_TYPES` reste le repli : deux paquets ne peuvent pas
 * s'imposer une clé par le compilateur, et l'extension de navigateur — hors de ce dépôt —
 * lit encore ce champ. Ce qui empêche les deux listes de diverger n'est donc pas un type
 * mais un test qui LIT les deux (`redactTypeLabel.test.ts`, règle 9).
 */
export function redactTypeLabel(type: RedactType, t: Messages): string {
  // `as unknown as` : le catalogue est une interface FERMÉE (ses clés sont un littéral),
  // la liste du moteur un tableau de `string` — TypeScript refuse de les rapprocher, et il
  // a raison : c'est précisément le trou que `redactTypeLabel.test.ts` bouche.
  const table = t.redactTypes as unknown as Record<string, string | undefined>;
  return table[type.key] ?? type.label;
}
