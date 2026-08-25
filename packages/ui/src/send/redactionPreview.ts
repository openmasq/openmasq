// Pre-send redaction reveal — pure logic. The user can un-redact a span before the
// wire leaves the machine (via the composer's keep-list chips); the send hook
// `reviewWire` restores the chosen tokens — an instant, reversible operation (no
// model re-call): the vault maps token→original, so `unredact` on the chosen tokens
// restores them and they're dropped from the vault. (The old standalone modal was
// replaced by that inline flow — see `ChatView`'s `reviewWire`.)
import { unredact } from "@openmasq/redact";
import type { RedactionMatch, Vault } from "@openmasq/redact";

/** What the send pipeline hands the review hook: the wire that would be sent,
 *  the conversation vault (token→original), and the spans it redacted. */
export interface WirePreview {
  wire: string;
  vault: Vault;
  matches: RedactionMatch[];
}

/** The review hook (provided by ChatView). Resolves to the tokens the user chose
 *  to reveal, or null to CANCEL the send. */
export type ReviewWire = (p: WirePreview) => Promise<{ restoreTokens: string[] } | null>;

/** Restore the chosen tokens in the wire (instant) AND drop them from the vault
 *  (mutated in place — it's the conversation vault) so the reply un-redaction +
 *  persisted history match. Returns the adjusted wire. */
export function applyRestore(wire: string, vault: Vault, tokens: string[]): string {
  const subset: Vault = {};
  for (const t of tokens) if (t in vault) subset[t] = vault[t];
  const restored = unredact(wire, subset);
  for (const t of tokens) delete vault[t];
  return restored;
}
