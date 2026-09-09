/**
 * Which vault entries stay OUT of the forward pass — the last phase before `applyVault`
 * rewrites the input. Three reasons, and they are not the same reason:
 *
 *   1. the user turned the category off (or numbers)      — `disabledVaultTokens`
 *   2. the value is allow-listed (`keep`)                  — tool routing needs it verbatim
 *   3. the entry is a PATH SEGMENT                         — reverses, but never aliases
 *
 * The third is the subtle one. A path's distinctive segments are vaulted beside the path
 * itself so a recomposed path still restores and one real segment keeps one fake tree-wide —
 * both REVERSE-direction properties. Nothing wanted the forward one, but a vault entry drives
 * both passes, so a project folder named `echo` made every later « echo » in the conversation
 * come out as its fake, inside the shell command an agent was about to run included. It is
 * the rule `identity/name.ts` already applies to particles, civilities and countries, reached
 * through a third door.
 */
import { disabledVaultTokens } from "../../engine/vault";
// Direct, not through the vault barrel: this is internal to the package, and the barrel
// sits exactly at the 300-LOC cap.
import { pathSegmentAliases } from "../../engine/vault/pathSegments";
import type { Vault } from "../../types";

export interface ExclusionOptions {
  numbers?: boolean;
  disabledKinds?: string[];
  kinds?: Record<string, string>;
  /** Allow-listed originals, already normalised by the caller. */
  keep: Set<string>;
  isKept: (value: string, keep: Set<string>) => boolean;
}

export function forwardExclusions(vault: Vault, o: ExclusionOptions): Set<string> {
  const exclude = disabledVaultTokens(vault, {
    numbers: o.numbers,
    disabledKinds: o.disabledKinds,
    kinds: o.kinds,
  });
  if (o.keep.size) {
    for (const [token, value] of Object.entries(vault)) {
      if (o.isKept(value, o.keep)) exclude.add(token);
    }
  }
  for (const token of pathSegmentAliases(vault)) exclude.add(token);
  return exclude;
}
