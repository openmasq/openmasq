import type { Settings } from "../types";

/**
 * Redaction of NUMBERS, removed from the product.
 *
 * The « Masquer aussi les nombres » setting has disappeared from every surface. The field
 * itself survives in already-persisted blobs — and an account that had turned it on would
 * keep tokenizing every number indefinitely, with no way left to turn it off: a setting
 * with no switch is a trap, not a feature.
 *
 * A single read, here, so the neutralization cannot be bypassed by a caller
 * reading `settings.redactNumbers` directly (rule 9: a shared fact has ONE
 * home). The day number redaction comes back, it comes back through this function.
 */
export function redactNumbersOn(_settings: Pick<Settings, "redactNumbers"> | undefined): boolean {
  return false;
}
