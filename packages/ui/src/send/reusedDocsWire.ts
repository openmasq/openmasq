import { applyVault, type Vault } from "@openmasq/redact";
import type { ReusePart } from "./foldPayload";

// Coarse tone → a representative redaction category, for the reused-document spans
// (a `PdfReplacement` carries only a tone). Drives their audit kind + preview label;
// the real per-value kinds are persisted by the file-redaction path (`redactAndSave`).
const TONE_CATEGORY: Record<string, string> = {
  coral: "secret",
  blue: "email",
  violet: "name",
  mint: "location",
  amber: "card",
  emerald: "number",
};

/** A redacted span the pre-send preview / audit reads (a `RedactionMatch`-shaped row). */
export interface WireMatch {
  type: string;
  category: string;
  value: string;
  placeholder: string;
}

/** The in-flight user wire: the redacted text + the spans that produced it. */
export interface UserWire {
  text: string;
  matches: unknown[];
  modelError?: string;
}

/**
 * Append the REUSED documents' wire to the user wire (pure) — applied DETERMINISTICALLY
 * from their drop-time fakes (already loaded into the vault), never re-detected. Each
 * reused rep is added as a `match` so (a) the pre-send preview can restore a value the
 * user revealed in the file preview, and (b) the redaction count includes it. The visible
 * highlighting still resolves from the vault (`wireSegments`), not these matches.
 * `exclude` = the disabled-vault-token set (a turned-off category isn't re-applied).
 */
export function appendReusedDocsWire(
  userWire: UserWire,
  reuseParts: ReusePart[],
  vault: Vault,
  exclude: Set<string> | undefined,
): UserWire {
  if (!reuseParts.length) return userWire;
  let extraText = "";
  const extraMatches: WireMatch[] = [];
  for (const p of reuseParts) {
    extraText += p.header + applyVault(p.text, vault, exclude);
    for (const r of p.reps) {
      if (!r.fake || !r.real) continue;
      const cat = TONE_CATEGORY[r.tone ?? ""] ?? "secret";
      extraMatches.push({ type: cat, category: cat, value: r.real, placeholder: r.fake });
    }
  }
  return {
    ...userWire,
    text: userWire.text + extraText,
    matches: [...userWire.matches, ...extraMatches],
  };
}
