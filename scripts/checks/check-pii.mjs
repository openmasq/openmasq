/**
 * PII ratchet — REAL identities do not come back into the repository.
 *
 * The product is a redaction engine: its tests need data that LOOKS like PII, and that is
 * legitimate. What they must not be is somebody's. `packages/redact/src/__fixtures__/`
 * carries the convention — invented personas, a README that says so — and this gate is what
 * stops the second convention ("I'll take what I have to hand") from coming back on the
 * evening of a hotfix.
 *
 * ⚠️ **The watch list lives OUTSIDE the tracked tree, and that is the only way this gate can
 * exist in a public repository.** A cleartext denylist would put back exactly the strings
 * just removed from it — the gate would be the leak. Hashing alone does not fix that: a
 * surname, a first-name bigram or an e-mail local-part is a preimage puzzle over a space of
 * a few hundred thousand candidates, and the folding and digest functions are right here in
 * the file. A published fingerprint of a low-entropy human name IS that name, to anyone
 * willing to spend a second on it. So the fingerprints are never committed, and the tracked
 * file carries no entry a reader could attack.
 *
 * The list is read, in order, from:
 *   1. `OPENMASQ_PII_RATCHET` — the JSON itself, base64-encoded (how CI holds it, as a secret)
 *   2. `OPENMASQ_PII_RATCHET_FILE` — a path
 *   3. `scripts/checks/.pii-banned.json` — the local default, git-ignored
 * Shape: `[{ "fp": "<16 hex>", "why": "<category, never the value>" }]`.
 *
 * With no list the gate reports that half as INACTIVE and still runs its self-check. That
 * is the right default rather than a hard failure: the list names the identities ONE
 * publisher removed, so it protects that publisher and no one else — a fork has nothing to
 * compare against, and a clone that cannot build is a worse outcome than a clone that is
 * told which guarantee it is not getting.
 *
 * Adding a term: `node scripts/checks/check-pii.mjs --hash "the value"`, then add the
 * fingerprint to the local list with a comment stating the CATEGORY, never the value.
 *
 * What the gate does NOT do: ban a bare first name. First names from the
 * `firstNames.data.ts` lexicon must stay there — it is the identity (surname, glued form,
 * company bigram, identifier) that is forbidden, not a dictionary word.
 *
 *   node scripts/checks/check-pii.mjs        # ou: pnpm check:pii
 *
 * Exit codes: 0 = clean; 1 = a real identity has reappeared, or one leaked into the tree.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

const LOCAL_LIST = "scripts/checks/.pii-banned.json";

/** The watch list, or an empty map when this checkout holds none. */
function loadBanned() {
  const b64 = process.env.OPENMASQ_PII_RATCHET;
  const path = process.env.OPENMASQ_PII_RATCHET_FILE ?? LOCAL_LIST;
  let raw;
  try {
    raw = b64 ? Buffer.from(b64, "base64").toString("utf8") : readFileSync(path, "utf8");
  } catch {
    return new Map();
  }
  const entries = JSON.parse(raw);
  if (!Array.isArray(entries)) throw new Error("PII ratchet: expected a JSON array");
  return new Map(
    entries.map(({ fp, why }) => {
      if (!/^[0-9a-f]{16}$/.test(fp ?? "")) throw new Error(`PII ratchet: bad fingerprint`);
      return [fp, why ?? "watched term"];
    }),
  );
}

const BANNED = loadBanned();

/** Comparison folding: lowercase + diacritics removed (an OCR loses them too). */
const fold = (s) => s.normalize("NFD").replace(/\p{M}+/gu, "").toLowerCase();
const digest = (s) => createHash("sha256").update(fold(s)).digest("hex").slice(0, 16);

if (process.argv[2] === "--hash") {
  const value = process.argv[3];
  if (!value) {
    console.error("usage: node scripts/checks/check-pii.mjs --hash \"the value\"");
    process.exit(2);
  }
  console.log(digest(value));
  process.exit(0);
}

// The gate itself contains fingerprints, never values — nothing to look for in it.
const SELF = "scripts/checks/check-pii.mjs";
const BINARY = /\.(png|jpe?g|gif|webp|ico|icns|pdf|docx?|xlsx?|zip|woff2?|ttf|otf|wasm|onnx|node|dylib|so|dll|exe|traineddata|mp[34]|mov)$/i;
const MAX_BYTES = 4_000_000;

const files = execFileSync("git", ["ls-files"], { encoding: "utf8", maxBuffer: 64 << 20 })
  .split("\n")
  .filter((f) => f && f !== SELF && !BINARY.test(f));

// ── Self-check: the watch list must never become tracked ────────────────────────────────
// The gate's guarantee is that the repository publishes no fingerprint of a real name — a
// fingerprint of a surname or an e-mail local-part is a preimage puzzle over a space of a
// few hundred thousand candidates, so publishing it publishes the value. That holds only
// while the list stays out of the tree, so it is enforced rather than trusted: the loaded
// fingerprints are searched for, verbatim, in every tracked file. Exact, not heuristic —
// the tree legitimately carries other 16-hex tokens (bench corpora, identifier fixtures).
// With no list loaded there is nothing to leak, and nothing to check.
const leaked = [];
if (files.includes(LOCAL_LIST)) leaked.push(`${LOCAL_LIST} is tracked`);
if (BANNED.size) {
  for (const file of files) {
    let text;
    try {
      if (statSync(file).size > MAX_BYTES) continue;
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const n = [...BANNED.keys()].filter((fp) => text.includes(fp)).length;
    if (n) leaked.push(`${file} — ${n} watch-list fingerprint(s)`);
  }
}
if (leaked.length) {
  console.error(`\n✗ the PII watch list has leaked into the tracked tree:\n`);
  for (const l of leaked) console.error(`  ${l}`);
  console.error(`\n  Publishing a fingerprint of a low-entropy name publishes the name.\n`);
  process.exit(1);
}

const hits = [];
for (const file of files) {
  let text;
  try {
    if (statSync(file).size > MAX_BYTES) continue;
    text = readFileSync(file, "utf8");
  } catch {
    continue; // unreadable or an extension-less binary — nothing to say
  }
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    // The line's words, then adjacent bigrams: a company fits in two words, a surname in
    // one. Beyond that, the gate has nothing to protect.
    const words = fold(lines[i]).match(/[a-z0-9]{4,}/g);
    if (!words) continue;
    for (let w = 0; w < words.length; w++) {
      for (const candidate of [words[w], w + 1 < words.length ? `${words[w]} ${words[w + 1]}` : null]) {
        if (!candidate) continue;
        const why = BANNED.get(digest(candidate));
        if (why) hits.push({ file, line: i + 1, why });
      }
    }
  }
}

if (hits.length) {
  console.error(`\n✗ ${hits.length} occurrence(s) of a real identity:\n`);
  // The report names the PLACE and the CATEGORY, never the value: a CI log is public.
  for (const h of hits.slice(0, 40)) console.error(`  ${h.file}:${h.line} — ${h.why}`);
  if (hits.length > 40) console.error(`  … et ${hits.length - 40} de plus`);
  console.error(
    `\n  PII fixtures are INVENTED: see packages/redact/src/__fixtures__/README.md.\n` +
      `  Reuse an existing persona, or create one holding the same properties\n` +
      `  (length, a first name from the lexicon, consonant/vowel initial) as the replaced value.\n`,
  );
  process.exit(1);
}

console.log(
  BANNED.size
    ? `✓ ${files.length} files — no real identity (${BANNED.size} fingerprints watched).`
    : `✓ ${files.length} files — list INACTIVE (no ${LOCAL_LIST}); self-check only.`,
);
