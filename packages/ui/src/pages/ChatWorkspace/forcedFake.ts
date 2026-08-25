import { pseudonymize, redactionCategory } from "@openmasq/redact";

/**
 * Mint the vault entry for a MANUALLY forced value (select text → "Redact" → a type).
 *
 * Why this exists: `store.forceRedact` only records `forcedRedactions`, which the SEND
 * path reads. But a message shows a value as redacted — the coloured pill — purely from
 * `toSegments(text, vault, kinds)`, i.e. from the VAULT. So forcing a value in a message
 * changed nothing on screen: the gesture was recorded and invisible, which reads exactly
 * like a broken button. Seeding the vault is what makes the pill appear.
 *
 * `convVault` is COPIED, then handed to the engine, which reuses the canonical fake when
 * this value already has one — that is what keeps "one real value → ONE fake,
 * conversation-wide" (see `packages/redact/src/model/CLAUDE.md`) intact when the send
 * later re-redacts the same value. Passing `{}` instead would mint a SECOND fake.
 *
 * Returns the merged vault + the `kinds` entry to hand `store.mergeVaultInto`, or `null`
 * when nothing could be minted — in which case the caller keeps the forced redaction it
 * already recorded, so the value still never reaches the model.
 */
export async function forcedVaultPatch(
  value: string,
  /** A canonical `REDACT_TYPES` token (`NAME`, `ORG`, …). */
  token: string,
  convVault: Record<string, string> | undefined,
  /** Le mode de la CONVERSATION : une valeur redacted à la main doit prendre la même
   *  forme que les autres, sinon un coffre porte un faux au milieu de ses marqueurs. */
  mode?: "fake" | "token",
): Promise<{ vault: Record<string, string>; kinds: Record<string, string> } | null> {
  const v = value.trim();
  if (!v) return null;
  // The engine MUTATES the vault it is given — hand it a copy and read the result back.
  const vault = { ...(convVault ?? {}) };
  const { matches } = await pseudonymize(v, {
    // `forced` bypasses every FP-prevention gate: the user asked for this span, as this
    // type, so the engine must not second-guess whether it looks sensitive.
    forced: [{ value: v, category: token }],
    vault,
    mode: mode ?? "fake",
    numbers: false,
  });
  const m = matches.find((x) => x.value === v) ?? matches[0];
  if (!m?.placeholder) return null;
  // `kinds` is keyed by the REAL value and holds the FINE category — the shape
  // `toSegments` reads for the pill's label + hue, and the send records for its spans.
  return { vault, kinds: { [v]: redactionCategory(m.category ?? token) } };
}
