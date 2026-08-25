import { pseudonymize, redactionCategory, type RedactionMatch } from "@openmasq/redact";
import type { Conversation } from "../types";

/**
 * The EDIT-time redaction pass — same rationale as `import/redact.ts` (rule 11's
 * honest edge): `buildWireHistory` redacts past turns by REPLAYING the conversation
 * vault, never by re-detecting them. Text the user types into an edited assistant
 * document lands in exactly that history — so save time is the one shot to put its
 * new values in the vault, or a hand-typed email would reach the model in clear on
 * the next turn. Runs the deterministic engine tier of `pseudonymize` (no model, no
 * network — same scope as the import pass; AI-only categories share its residual),
 * EXTENDING the conversation's existing vault/kinds/salt so values already redacted
 * keep their fake. A throw propagates: the caller must REFUSE the save (rule 7 —
 * an edit that skipped this pass is a leak, not a degraded save).
 */

/** Same 31-bit CSPRNG mint as the send pipeline's first-redaction path. */
function mintSalt(): number {
  return ((globalThis.crypto?.getRandomValues(new Uint32Array(1))[0] ?? 1) & 0x7fffffff) || 1;
}

export async function redactEditedText(
  conv: Conversation,
  text: string,
  disabledKinds: string[],
  // Dispense de notoriété du NIVEAU effectif — même paire que le chemin d'envoi, pour
  // qu'une marque ou personnalité en clair dans la conversation le reste à l'édition.
  notoriety?: { commercial: boolean; people: boolean },
): Promise<Pick<Conversation, "redactionVault" | "redactionKinds" | "redactionSalt">> {
  const vault = { ...(conv.redactionVault ?? {}) };
  const kinds = { ...(conv.redactionKinds ?? {}) };
  const salt = conv.redactionSalt ?? mintSalt();
  // Le mode de la CONVERSATION, jamais celui des réglages courants : ce texte rejoint un
  // coffre déjà constitué, et lui donner l'autre forme y mélangerait faux et marqueurs.
  const r = await pseudonymize(text, {
    vault,
    kinds,
    salt,
    mode: conv.redactionMode ?? "fake",
    numbers: false,
    disabledKinds,
    commercialNotoriety: notoriety?.commercial,
    peopleNotoriety: notoriety?.people,
  });
  // Same fine-kind derivation as the live send + the import pass.
  for (const match of r.matches as (RedactionMatch & { category?: string })[])
    kinds[match.value] = redactionCategory(match.category ?? match.type);
  return { redactionVault: vault, redactionKinds: kinds, redactionSalt: salt };
}
