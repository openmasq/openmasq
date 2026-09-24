// The token-mode counterpart of the fake path's per-word aliases. When « Jean Dupont » is
// faked, `allocate.ts` also vaults `Jean → Lubin` and `Dupont → Mabille`, so a later « Dupont »
// alone is replaced and reversed on its own. A token has no words to share: every alias would
// be the same `[PERSON1]`, and a vault's keys are unique. So the fragments are not vaulted —
// they are REPLAYED, forward only, from what the vault already holds: each PERSON entry's
// distinctive words (`linkWords`: ≥4 letters, which rules out particles and initials) point
// at the entry's canonical token, and a standalone occurrence becomes that token. Nothing
// reverses a fragment: the model only ever emits `[PERSON1]`, which unredacts to the full
// name — « Dupont est parti » reaches the reader as « Jean Dupont est parti », one identity.
//
// What it replaces: the Title-case and ALL-CAPS forms only (« Dupont », « DUPONT »). A
// lower-case fragment is left alone — written small, a surname is more often the common word
// it also is (« petit », « blanc ») than a person. It is the same trade `linkWords` already
// makes when it merges two spellings into one index, applied to the replay.
//
// It runs AFTER `applyVault`, so a full name is already a token and only the loose fragments
// remain; and it is what makes « what a stricter source vaulted stays masked » true in
// token mode as it is in fake mode: a chat that detects no name at all still replays them.
import type { Vault } from "../../types";
import { linkWords, TOKEN_RE } from "./allocateTokens";

export function applyTokenFragments(
  text: string,
  vault: Vault,
  exclude: ReadonlySet<string>,
): string {
  const canonical = new Map<number, string>();
  const persons: [string, string][] = [];
  for (const [token, value] of Object.entries(vault)) {
    const m = TOKEN_RE.exec(token);
    if (!m || m[1].toUpperCase() !== "PERSON" || exclude.has(token)) continue;
    persons.push([token, value]);
    // `[PERSON1]` is the canonical key of index 1; `[PERSON1b]` and `[person1]` are its
    // variants. A fragment points at the canonical one, which always exists first.
    if (!m[3] && m[1] === "PERSON") canonical.set(Number(m[2]), token);
  }
  if (!persons.length) return text;
  const byWord = new Map<string, string>();
  for (const [token, value] of persons) {
    const target = canonical.get(Number(TOKEN_RE.exec(token)?.[2])) ?? token;
    for (const w of linkWords(value)) if (!byWord.has(w)) byWord.set(w, target);
  }
  // A run of letters is a whole word by construction. The `[` guard keeps a token's own
  // word (`[PERSON1]`) out of it.
  return text.replace(/\p{L}{4,}/gu, (w, offset: number) => {
    const token = byWord.get(w.toLowerCase());
    if (!token || text[offset - 1] === "[") return w;
    const rest = w.slice(1);
    const title = w[0] === w[0].toUpperCase() && rest === rest.toLowerCase();
    return title || w === w.toUpperCase() ? token : w;
  });
}
