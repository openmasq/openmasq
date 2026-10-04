// What a value ALREADY in the vault looks like on its way back to the model: the send-time
// substitution, as one function. `pseudonymize` runs it on the text it has just detected;
// every later replay of a past text — the conversation history, its summary, what memory
// extraction reads — runs the SAME one. A replay with `applyVault` alone was the gap: a
// value masked at send time only by the tolerant pass ("DUPONT" for a vaulted "Dupont")
// went out in clear on every later turn.
import { applyVault, applyVaultVariants } from "../../engine/vault";
import type { UrlOccurrenceGuard } from "../../engine/urls";
import type { Vault } from "../../types";
import { applyTokenFragments } from "./tokenFragments";

export interface ReplayOptions {
  /** Tokens whose category is turned off: left in clear, as at send time. */
  exclude?: Set<string>;
  /** Spares the EXACT spelling inside a URL's structure (`urlOccurrenceGuard`). */
  urlGuard?: UrlOccurrenceGuard;
  /** The conversation's pinned mode: token mode has no per-word aliases in the vault, so
   *  a standalone surname of a known person is caught by its own pass. */
  mode?: "fake" | "token";
}

export function replayForModel(input: string, vault: Vault, o: ReplayOptions = {}): string {
  // Exact pass first (longest-first), then the TOLERANT residual pass for the variants an
  // entity comes back as ("KARL_STUDIO" in a filename, a slug, an upper-cased heading).
  // ⚠️ The variant pass gets NO url guard on purpose: a slugified real value inside a URL is
  // the user's data wearing a URL's clothes. Only the EXACT spelling is spared, which is
  // what the structural parts of a link (host, id, query flag) actually are.
  const replayed = applyVaultVariants(applyVault(input, vault, o.exclude, o.urlGuard), vault, o.exclude);
  return o.mode === "token" ? applyTokenFragments(replayed, vault, o.exclude ?? new Set()) : replayed;
}
