// The reversible pairs the allocator vaults BESIDE a fake, one family per kind:
//   path  — each distinctive segment (`paths.ts` `buildFakePath().pairs`): a recomposed or
//           standalone segment reverses, and the same real segment reuses one fake tree-wide;
//   email — the domain (`identity/email.ts` `emailDomainPair`): colleagues share a fake domain,
//           two real domains never collide on one, the bare domain in prose masks the same;
//   ip    — the /24 (`fakes/ip.ts` `ipPrefixPairs`): a subnet or CIDR the model writes from the
//           fake it saw reverses to the real network.
// One loop and one set of guards for the three, so a pair can never be vaulted under a looser
// rule than another: never an alias equal to its real, never one already present in the input
// (it would forward-alias prose), never one another identity already wears.
import type { Vault } from "../../types";
import { ipPrefixPairs } from "../fakes/ip";
import { emailDomainPair } from "../identity";

export interface PairSink {
  vault: Vault;
  reverse: Map<string, string>;
  taken: Set<string>;
  input: string;
}

export interface SidePairsArgs {
  /** The engine's normalised category (`redactionCategory`). */
  cat: string;
  value: string;
  fake: string;
  /** The path segments computed with the fake — only meaningful for `cat === "path"`. */
  pathPairs: [string, string][];
}

export function registerSidePairs(sink: PairSink, a: SidePairsArgs): void {
  const pairs: [string, string][] =
    a.cat === "path"
      ? a.pathPairs
      : a.cat === "email"
        ? (() => {
            const p = emailDomainPair(a.value, a.fake);
            return p ? [p] : [];
          })()
        : a.cat === "ip"
          ? ipPrefixPairs(a.value, a.fake)
          : [];
  for (const [alias, real] of pairs) {
    if (alias === real || sink.input.includes(alias)) continue;
    if (sink.taken.has(alias) || sink.vault[alias] !== undefined) continue;
    sink.vault[alias] = real;
    if (!sink.reverse.has(real)) sink.reverse.set(real, alias);
    sink.taken.add(alias);
  }
}
