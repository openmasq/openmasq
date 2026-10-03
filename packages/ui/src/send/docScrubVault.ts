import type { DocReplacement } from "./foldPayload";
import type { RedactionSetup } from "./sendOrchestrator/redactionSetup";

/**
 * The vault the library's masked copy of ONE attached document is scrubbed with
 * (`files:redact-and-save`): the send's vault PLUS the document's own drop-time pairs.
 *
 * Why both: the send's vault holds what THIS send detected, and the send re-detects only
 * what rides the wire — the first `MAX_FILE_CHARS` of a document. The drop-time map covers
 * the WHOLE text (`pages/ChatWorkspace/redactAttachment.ts`): with both, a name seen only past
 * the wire cut is in the vault, so the scrubbed DOCX/XLSX masks it.
 *
 * Additive only (fail closed): a pair is added unless its real value already has a fake.
 * A fake already owned by ANOTHER real gets a unique variant instead of being dropped —
 * a dropped pair is a value left in clear. Never mutates `vault`.
 */
export function docScrubVault(
  vault: Record<string, string>,
  replacements: readonly DocReplacement[] | undefined,
): Record<string, string> {
  if (!replacements?.length) return vault;
  const out = { ...vault };
  const reals = new Set(Object.values(out));
  for (const { real, fake } of replacements) {
    if (!real || !fake || reals.has(real)) continue;
    let key = fake;
    for (let n = 2; key in out; n++) key = `${fake} (${n})`;
    out[key] = real;
    reals.add(real);
  }
  return out;
}

/** Real value → category for that vault (the conversation's, this send's, the document's
 *  own — the most specific last), so main files a name it replaces from the vault as a
 *  name, never under a guessed category. */
export function docScrubKinds(
  r: Pick<RedactionSetup, "convKinds" | "extraKinds">,
  replacements: readonly DocReplacement[] | undefined,
): Record<string, string> {
  const own = Object.fromEntries((replacements ?? []).filter((x) => x.kind).map((x) => [x.real, x.kind as string]));
  return { ...r.convKinds, ...r.extraKinds, ...own };
}
