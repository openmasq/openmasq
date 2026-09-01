/**
 * PII ratchet — REAL identities do not come back into the repository.
 *
 * The product is a redaction engine: its tests need data that LOOKS like PII, and that is
 * legitimate. What they must not be is somebody's. `packages/redact/src/__fixtures__/`
 * carries the convention — invented personas, a README that says so — and this gate is what
 * stops the second convention ("I'll take what I have to hand") from coming back on the
 * evening of a hotfix.
 *
 * ⚠️ **The list is HASHED, and that is the only way this file can exist.** A cleartext
 * denylist would put back into the public repository exactly the strings just removed from
 * it — the gate would be the leak. So we compare fingerprints: the file never says WHO it
 * protects, only that something known has reappeared.
 *
 * Adding a term: `node scripts/checks/check-pii.mjs --hash "the value"`, then paste the
 * fingerprint below with a comment stating the CATEGORY, never the value.
 *
 * What the gate does NOT do: ban a bare first name. « thomas » and « numa » are first names
 * from the `firstNames.data.ts` lexicon and must stay there — it is the identity (surname,
 * glued form, company bigram, identifier) that is forbidden, not a dictionary word.
 *
 *   node scripts/checks/check-pii.mjs        # ou: pnpm check:pii
 *
 * Exit codes: 0 = clean; 1 = a real identity has reappeared.
 */
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";

/** Forbidden fingerprints (sha256 of the folded term, first 16 characters). */
const BANNED = new Map([
  ["54c291eb2346853f", "surname of a real person"],
  ["0ff9174a9925fad0", "real identity, glued form (path/handle)"],
  ["2152d9b597ab24a2", "local-part of a personal e-mail address"],
  ["c54743b08ce03dfe", "real company, glued form"],
  ["3040da40375141ae", "real company"],
  ["4661da1efb155361", "real company, domain form"],
  ["531f6edabf0149d8", "real company, filename form"],
  ["a34abf3a6bdfff46", "identifiant administratif personnel"],
  ["c30f39054eb0f384", "identifiant administratif personnel"],
  ["337c4f2603570d8f", "real invoice reference"],
  ["e74d2792c5bb3f78", "real project/client name"],
  ["f48164934dd7d674", "real project/client name"],
  // Real identities removed from a fixture taken from a log: two named researchers, and a
  // first name distinctive enough to identify on its own.
  ["69ac038132139275", "surname of a real person"],
  ["ea72e0ba02eb0c3d", "real identity, first name + surname"],
  ["d2e4e2e840510929", "distinctive first name of a real person"],
  ["5b3c14cb49cc2868", "real handle (account handle)"],
  // ⚠️ The FIRST NAME of this identity is NOT banned, and that is deliberate: it lives in
  // `firstNames.data.ts`, in the masculine list of `gender.ts` and in the surnames of
  // `surnamesGuard.data.ts`, where it is a dictionary word — removing it would blind the
  // engine to everyone who bears it. We ban what DESIGNATES: the bigram, the surname, the
  // company.
  ["5d896dc9ab526f7a", "real identity, first name + surname"],
  ["4085c11577b99640", "surname of a real person"],
  ["3784b6419c484732", "real company"],
  // A real firm. The gate compares whole WORDS, so « gideon » (a gazetteer first name) and
  // « frigideira » (vocabulary) do not match — a substring is not an identity.
  ["89c986e7b5d11b1d", "real firm"],
  // The publisher's infrastructure identifiers, removed when they moved to environment
  // variables — public by design but tied to ONE account, they do not come back: base/auth
  // project ref, publishable key, analytics ingestion key, telemetry DSN and org, OAuth
  // client (id + secret fragment),
  // ids d'apps connecteurs.
  ["3f1bd64743dd4d37", "publisher's base/auth project ref"],
  ["093b9b0d7845c95a", "base/auth project publishable key"],
  ["d05d49e1adce6ecb", "publisher's analytics ingestion key"],
  ["3b51360fe9dae2de", "publisher's telemetry DSN key"],
  ["92fbd8ee7a95a811", "publisher's telemetry org"],
  ["c404f776449aa468", "publisher's Google OAuth client"],
  ["f8668e516c7cbcc9", "fragment of the publisher's Google OAuth secret"],
  ["643412d1893ab2a0", "publisher's GitHub OAuth client"],
  ["64333a2e044ab6c0", "publisher's Slack app"],
  ["e4ae09db72ecbb10", "publisher's Microsoft app"],
]);

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

console.log(`✓ ${files.length} files — no real identity (${BANNED.size} fingerprints watched).`);
