/**
 * Which vault entries are PATH SEGMENTS vaulted beside a whole path — and must therefore
 * never act as a forward alias.
 *
 * The engine vaults each distinctive segment of a path next to the path itself
 * (`model/pseudonymize/sidePairs.ts`), and both stated reasons for it live in the REVERSE
 * direction: a path the model recomposes rather than echoes verbatim still reverses, and the
 * same real segment keeps one fake tree-wide. Nothing wanted the forward direction.
 *
 * It arrived anyway, because a vault entry drives both passes. So a project folder called
 * `echo` made `applyVault` rewrite the word « echo » everywhere it appeared afterwards —
 * including inside the shell command an agent was about to run, which then failed with
 * « command not found: JVeoNe ». It is the same failure the name path already guards against
 * for particles, civilities and countries (`model/identity/name.ts`: « faking them without
 * aliasing them keeps both properties »), reached through a third door.
 *
 * Derived from the vault's own SHAPE rather than remembered in a side table, because a vault
 * outlives the turn that filled it: it is persisted with the conversation and re-applied on
 * every later one, so a marker held in memory would protect only the first turn.
 */
import type { Vault } from "../../types";

const SEP = /[\\/]+/;

/** Split on separators, dropping empties — `/a/b/` and `a/b` give the same segments. */
const segmentsOf = (value: string): string[] => value.split(SEP).filter(Boolean);

const looksLikePath = (value: string): boolean => SEP.test(value);

/**
 * The tokens to keep out of the forward pass. An entry qualifies when it is a BARE value
 * (no separator of its own) that appears as a whole segment of some other entry's value,
 * with the two tokens standing in the same relation — the fake segment sits inside the fake
 * path. Requiring BOTH sides is what keeps an ordinary word that merely happens to occur in
 * a path (a client's name, vaulted on its own merits as a company) out of the set: its token
 * was not minted as part of that path's fake, so it never matches.
 */
export function pathSegmentAliases(vault: Vault): Set<string> {
  const out = new Set<string>();
  const paths: [string, string][] = [];
  const bare: [string, string][] = [];
  for (const [token, value] of Object.entries(vault)) {
    if (!value) continue;
    (looksLikePath(value) ? paths : bare).push([token, value]);
  }
  if (!paths.length || !bare.length) return out;

  const pathSegments = new Map<string, Set<string>>(); // real segment -> fake segments seen
  for (const [token, value] of paths) {
    const reals = segmentsOf(value);
    const fakes = segmentsOf(token);
    // Only a fake built segment-wise from this path can vouch for it; a token of another
    // shape (a `[REDACTED_PATH_1]` label, a truncated fake) says nothing about segments.
    if (reals.length !== fakes.length) continue;
    for (let i = 0; i < reals.length; i++) {
      const set = pathSegments.get(reals[i]) ?? new Set<string>();
      set.add(fakes[i]);
      pathSegments.set(reals[i], set);
    }
  }

  for (const [token, value] of bare) {
    if (pathSegments.get(value)?.has(token)) out.add(token);
  }
  return out;
}
