import type { Detection, RedactionType, Vault } from "../../types";
import { redactionCategory } from "../../kinds";
import { entityKey } from "../../util";
import { CATEGORY_TOKEN } from "../../highlight/tokens";

/**
 * Phase 3, TOKEN MODE — the alternative to `allocate.ts` when the model must only see
 * markers (`[PERSON1]`) and never a believable fake.
 *
 * This mode doesn't compete with fake allocation: it REPLACES it. Everything
 * `allocate.ts` carries — fake pool, 60-attempt collision search, block-level geo
 * coherence, `avoid`, word index, `salt`, email/name/place aliases — exists only so
 * a fake stays plausible AND doesn't collide with the text or another fake. A token isn't
 * plausible for anything and can't collide with anyone: the only thing to guarantee here
 * is the key's uniqueness in the vault.
 *
 * What is KEPT, because these are product invariants and not properties
 * of the fakes:
 *  - **one real value → a single token**, across the whole conversation (the vault, reread
 *    every turn, is the memory of that choice);
 *  - **one entity → a single NUMBER**, whatever its casing. `applyVault` is
 *    case-sensitive, so each casing needs its own vault entry;
 *    they share the number and differ only by the token's casing
 *    (`[COMPANY1]` / `[Company1]` / `[company1]`), which a model reads as a single
 *    token while three distinct entries each stay reversible to THEIR casing.
 *    Numbering by value would give `[COMPANY1]`/`[COMPANY2]` for a single company —
 *    the model would reason about two companies.
 *  - **never a real value left on the wire**: if the computed key is already taken
 *    (or present verbatim in the user's text), we increment until
 *    finding a free one. The loop terminates — the counter is monotonic.
 *
 * The numbering is ALWAYS suffixed with an index, where the display
 * (`highlight/tokens.ts`) leaves `[IBAN]` bare when the category has only one value: that
 * display knows the complete set, the wire doesn't — it allocates on the fly, with no
 * way to know if a second value will follow.
 */
export interface AllocateTokensCtx {
  vault: Vault;
  reverse: Map<string, string>;
  taken: Set<string>;
  entityValues: string[];
  record: (type: RedactionType, value: string, token: string, category: string) => void;
  input: string;
}

/** `[PERSON12]` → its family + its index. Used to resume the numbering of an existing
 *  vault: casing is ignored, the three variants of an entity sharing the index. */
const TOKEN_RE = /^\[([A-Za-z][A-Za-z_]*?)(\d+)([a-z]?)\]$/;

/** The family word of a fine-grained category, via the SAME table as the display (rule 9).
 *  `INFO` is the neutral fallback: a value with no usable category must not inherit
 *  `redactionCategory`'s `secret` fallback and read as `[SECRET]`. */
function tokenWord(category: string): string {
  return CATEGORY_TOKEN[redactionCategory(category)] ?? "INFO";
}

/** The families where the same entity is commonly rewritten in several casings (a name in
 *  capitals in a header, a company in lowercase in an email address). STRUCTURED
 *  values (IBAN, email, phone, path…) don't have this variance: they
 *  always keep the canonical form, which avoids a needlessly noisy `[Iban1]`. */
const CASED_KINDS = new Set(["name", "company", "location", "address", "health", "username"]);

/**
 * The token's casing MIRRORS the value's — that's what gives a vault key
 * distinct per casing while keeping ONE number per entity (`applyVault` is case-
 * sensitive, so each casing needs its own entry).
 *
 * The CANONICAL form is `[PERSON1]`, and it serves ordinary prose (« Augustin Vaudel »,
 * title case): that's by far the majority case, and it's also the form the
 * display shows. The other two exist only to avoid colliding with the canonical one —
 * an all-lowercase value gives `[person1]`, an all-caps value `[Person1]`.
 * This last choice is arbitrary (all-caps would have "deserved" the canonical form), but
 * it's the rarest casing and the token remains visibly the same.
 */
function caseMirror(word: string, n: number, value: string, cat: string): string {
  if (!CASED_KINDS.has(cat)) return `[${word}${n}]`;
  const letters = value.replace(/[^\p{L}]/gu, "");
  if (!letters) return `[${word}${n}]`;
  if (value === value.toLowerCase()) return `[${word.toLowerCase()}${n}]`;
  if (value === value.toUpperCase()) return `[${word[0]}${word.slice(1).toLowerCase()}${n}]`;
  return `[${word}${n}]`;
}

/** The words by which two spellings of a person are recognised: ≥4 letters, which
 *  rules out particles (de/la/du/van) and initials without having to list them. */
function linkWords(value: string): string[] {
  return value
    .split(/[\s._-]+/)
    .filter((w) => /^\p{L}{4,}$/u.test(w))
    .map((w) => w.toLowerCase());
}

export function allocateTokens(deNested: Detection[], ctx: AllocateTokensCtx): void {
  const { vault, reverse, taken, entityValues, record, input } = ctx;
  // Per-family counter, resumed from the vault: turn 2 must continue turn 1's
  // numbering, else two different people get `[PERSON1]`.
  const counters = new Map<string, number>();
  for (const key of Object.keys(vault)) {
    const m = TOKEN_RE.exec(key);
    if (!m) continue;
    const word = m[1].toUpperCase();
    counters.set(word, Math.max(counters.get(word) ?? 0, Number(m[2])));
  }
  // `category|entity key` → the index already assigned to this entity in THIS pass.
  // Casings seen in previous turns, meanwhile, are recovered via the vault.
  const entityIndex = new Map<string, number>();
  // Distinctive word → index of the person who carries it. This is the CATCH for partial
  // spellings: « Léa Morvan » then « L. Morvan » or just « Morvan ». Without it, an
  // ordinary minutes document (« Present: Léa Morvan, L. Morvan (excused)… ») gives FOUR
  // tokens for TWO people, and the model counts four people. The fake path
  // handles this via its per-word aliases (`identity/name.ts`), which don't exist here: a token
  // has no words to share. So we share the INDEX instead, and the variant takes a letter
  // (`[PERSON1b]`) — close enough to read as the same person, distinct enough to
  // stay a separate vault key, reversible to ITS own spelling.
  // ⚠️ Two homonyms (« Jean Morvan » / « Léa Morvan ») end up linked. It's the same
  // trade-off as on the fake side, where they share the fake surname: wrongly merging two
  // people who share the same name costs less than splitting one person into four.
  const nameIndex = new Map<string, number>();
  // An entity already known (another casing is in the vault) must recover ITS number
  // rather than consume a new one.
  for (const [key, value] of Object.entries(vault)) {
    const m = TOKEN_RE.exec(key);
    if (!m) continue;
    const word = m[1].toUpperCase();
    const n = Number(m[2]);
    entityIndex.set(`${word}|${entityKey(value)}`, n);
    if (word === "PERSON") for (const w of linkWords(value)) if (!nameIndex.has(w)) nameIndex.set(w, n);
  }

  for (const { value, category } of deNested) {
    if (reverse.has(value)) {
      if (!entityValues.includes(value)) entityValues.push(value);
      record("secret", value, reverse.get(value)!, category);
      continue;
    }
    const cat = redactionCategory(category);
    const word = tokenWord(category);
    const idKey = `${word}|${entityKey(value)}`;
    const free = (t: string) => !taken.has(t) && !input.includes(t);
    const at = (n: number, suffix = "") =>
      caseMirror(word, n, value, cat).replace(/\]$/, `${suffix}]`);

    let n = entityIndex.get(idKey);
    let token = n !== undefined ? at(n) : "";
    // 2) Same person spelled differently (« L. Morvan » after « Léa Morvan »): we keep ITS
    //    number and take the first free variant letter.
    if (n === undefined && cat === "name") {
      for (const w of linkWords(value)) {
        const known = nameIndex.get(w);
        if (known === undefined) continue;
        for (const s of "bcdefghijklmnopqrstuvwxyz") {
          if (free(at(known, s))) {
            n = known;
            token = at(known, s);
            break;
          }
        }
        if (n !== undefined) break;
      }
    }
    if (n === undefined || !free(token)) {
      // New entity — or collision (the user themselves wrote « [PERSON1] », or
      // two casings collapsed to the same form). We advance until a free key;
      // the counter never decreases, so the loop terminates.
      do {
        n = (counters.get(word) ?? 0) + 1;
        counters.set(word, n);
        token = at(n);
      } while (!free(token));
      entityIndex.set(idKey, n);
    }
    if (cat === "name") for (const w of linkWords(value)) if (!nameIndex.has(w)) nameIndex.set(w, n);
    vault[token] = value;
    reverse.set(value, token);
    taken.add(token);
    entityValues.push(value);
    record("secret", value, token, category);
  }
}
