import type { Messages } from "@openmasq/i18n";
import type { RedactType } from "@openmasq/redact";

/**
 * The READ label of a manual redaction type.
 *
 * The technical vocabulary — the engine's key and `token` — stays in `@openmasq/redact`:
 * that is ITS language, and the engine also runs server-side, with no catalogue. Only the
 * word shown to the user comes from here.
 *
 * The French `label` carried by `REDACT_TYPES` stays the fallback: two packages cannot
 * force a key on each other through the compiler, and the browser extension — outside this
 * repo — still reads that field. What keeps the two lists from diverging is therefore not
 * a type but a test that READS both (`redactTypeLabel.test.ts`, rule 9).
 */
export function redactTypeLabel(type: RedactType, t: Messages): string {
  // `as unknown as`: the catalogue is a CLOSED interface (its keys are a literal), the
  // engine's list an array of `string` — TypeScript refuses to bring them together, and it
  // is right: that is precisely the hole `redactTypeLabel.test.ts` plugs.
  const table = t.redactTypes as unknown as Record<string, string | undefined>;
  return table[type.key] ?? type.label;
}
