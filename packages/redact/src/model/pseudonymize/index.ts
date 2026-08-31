// Pseudonymisation: a stronger privacy mode for the model engine. Instead of
// conspicuous `[REDACTED_…]` placeholders, each sensitive span is swapped for
// believable fake data of the same kind (see ../fakes). Standalone numbers that
// match no entity ("meaningless" figures) are LEFT UNTOUCHED by default; only when
// `numbers: true` is set are they replaced with `n1`, `n2`, … tokens. Everything is
// stored in the same Vault (token -> original) and restored on the reply by `unredact`.
//
// This orchestrator threads the four pure phases — gather → filter → (geo) → allocate —
// each split into its own module (hard rule 2); the intricate mutable-state allocation
// loop lives in ./allocate over an explicit context.
import type { RedactionMatch, RedactionResult, RedactionType } from "../../types";
import { keepSet, isKept, capitalize, entityKey } from "../../util";
import { applyVault, applyVaultVariants, disabledVaultTokens } from "../../engine/vault";
import { detectHostedUrlSpans, detectUrlSpans, detectEmailSpans, urlOccurrenceGuard } from "../../engine/urls";
import { resolveGeoBlocks } from "../../engine/geo/geoBlocks";
import { createGeoAnchors, seedGeoAnchors } from "../../engine/geo/cityAnchor";
import { PLACES_BY_COUNTRY } from "../../engine/geo/index";
import { NUMBER_RE, isBareYear } from "../pseudonymizeNumbers";
import { redactionCategory, URL_EXEMPT_KINDS } from "../../kinds";
import { gatherCandidates } from "./gather";
import { buildExistingFakeGuard, buildAvoidGuard, expandVariants } from "./guards";
import { filterCandidates, deNest, dropUnanchoredProseGeo, disabledValueSpans } from "./filter";
import { splitLineCrossing } from "./lineSplit";
import { allocateEntities } from "./allocate";
import { allocateTokens } from "./allocateTokens";
import type { PseudonymizeOptions } from "./options";

export type { PseudonymizeOptions };

/**
 * Pseudonymise `input`: swap every sensitive span for believable fake data and
 * (only when `numbers` is enabled) every standalone number for a `n1`/`n2`/… token,
 * registering each mapping in the vault so `unredact` restores the originals in the
 * reply. Best-effort and reversible: a missing/failing model just means less coverage,
 * never corruption — only verbatim spans are ever touched.
 */
export async function pseudonymize(
  input: string,
  options: PseudonymizeOptions = {},
): Promise<RedactionResult> {
  if (!input) return { text: input, matches: [] };
  const vault = options.vault ?? {};
  const reverse = new Map<string, string>(); // original value -> token
  const taken = new Set<string>(); // tokens in use
  let numberCounter = 0;
  for (const [token, value] of Object.entries(vault)) {
    reverse.set(value, token);
    taken.add(token);
    const m = token.match(/^n(\d+)$/);
    if (m) numberCounter = Math.max(numberCounter, Number(m[1]));
  }

  const matches: RedactionMatch[] = [];
  const recorded = new Set<string>();
  const record = (type: RedactionType, value: string, token: string, category: string) => {
    if (recorded.has(token)) return;
    recorded.add(token);
    matches.push({ type, value, placeholder: token, category });
  };

  // Phase 1 — gather candidates (model + rules + deterministic detectors + forced/secrets).
  const { candidates, modelError } = await gatherCandidates(input, options);

  // Tokenising bare numbers into n1/n2 is opt-in (default off).
  const tokenizeNumbers = options.numbers === true;

  const isExistingFake = buildExistingFakeGuard(taken);
  const collidesAvoid = buildAvoidGuard(options, vault, input);

  const disabled = new Set(options.disabledKinds ?? []);
  const keep = keepSet(options.keep);
  // UI categories the org mandates — `keep` must NOT override them (audit). Empty ⇒ unchanged.
  const unrevealable = new Set(options.unrevealableCategories ?? []);
  // `url` category OFF (default) ⇒ never redact a value that only occurs inside a URL.
  // …plus, INDEPENDENTLY of that toggle, the URLs addressing a CONNECTED integration's
  // own host (an ALLOW-list — see `detectHostedUrlSpans` and `structuralUrlHosts`).
  const urlSpansRaw = [
    ...(disabled.has("url") ? detectUrlSpans(input) : []),
    ...detectHostedUrlSpans(input, options.structuralUrlHosts ?? []),
  ];
  const urlSpans = urlSpansRaw.length ? urlSpansRaw : null;
  // A NON-email value seen ONLY inside email addresses is suppressed (leaks the local-part).
  const emailSpansRaw = input.includes("@") ? detectEmailSpans(input) : [];
  const emailSpans = emailSpansRaw.length ? emailSpansRaw : null;

  // A NAME/COMPANY span glued ACROSS list lines ("Laure\nDPO\nVergnaud" → one NER span)
  // is split at its line boundaries FIRST — else the variant expansion below would
  // faithfully redact two people and a role label as ONE fake (`lineSplit.ts`).
  // ⚠️ COPY before clearing: on a single-line input `splitLineCrossing` returns its
  // input array UNCHANGED — same reference — and `length = 0` would wipe every
  // candidate before the push re-read it (the aliasing bug the forced tests caught).
  const lineSafe = [...splitLineCrossing(candidates, input)];
  candidates.length = 0;
  candidates.push(...lineSafe);
  // Expand each entity candidate to every spelling variant present in the text.
  candidates.push(...expandVariants(input, candidates));

  // Phase 2 — the fail-closed FP-prevention filter, then drop subsumed (nested) candidates.
  // The disabled zones are computed from the SAME candidate list (variants included), so a
  // fragment of a released value is recognised whichever detector named it.
  const zones = disabledValueSpans(candidates, input, disabled);
  const kept = filterCandidates(candidates, {
    keep,
    unrevealable,
    reFakeExisting: options.reFakeExisting,
    isExistingFake,
    disabled,
    urlSpans,
    emailSpans,
    disabledSpans: zones.spans.length ? zones.spans : null,
    releasedValues: zones.values,
    notoriety: {
      commercial: options.commercialNotoriety === true,
      people: options.peopleNotoriety !== false,
    },
    input,
  });
  // Prose geo (REGION/DEPARTMENT): redacted only if personal data
  // is present (another surviving candidate, or a vault already seeded) — see
  // `dropUnanchoredProseGeo`. A general-geography question goes out in clear.
  const anchored = dropUnanchoredProseGeo(kept, Object.keys(vault).length === 0);
  const deNested = deNest(anchored, input);

  // Cross-field GEO coherence: one coherent real place per address block (Commune/Dépt/…).
  // City anchoring: the same real city receives ONE fake place — across two blocks,
  // across two addresses, and from one send to the next (seeded from the vault).
  const geoAnchors = createGeoAnchors();
  seedGeoAnchors(geoAnchors, vault, PLACES_BY_COUNTRY);
  const geoFakes = resolveGeoBlocks(deNested, taken, { anchors: geoAnchors, vault });

  // The value's existing canonical fake (a name token, a domain), tried across case
  // variants so a lowercase alias and a capitalised NAME resolve to the same identity.
  const resolveFakeCI = (real: string): string | undefined =>
    reverse.get(real) ??
    reverse.get(real.toLowerCase()) ??
    reverse.get(capitalize(real));
  // A whole-value entity re-mentioned in a different casing must reuse the SAME fake —
  // scan the reverse map for ANY case-insensitive match (multi-word / whole-value).
  const resolveEntityFakeCI = (real: string): string | undefined => {
    const direct = resolveFakeCI(real);
    if (direct) return direct;
    const lc = real.toLowerCase();
    for (const [orig, token] of reverse) if (orig.toLowerCase() === lc) return token;
    // ⚠️ …and the GLUED form of the same entity, which is what a domain name or an
    // identifier looks like. Measured 16/08/2026 (personas benchmark IN CONVERSATION): turn 1
    // vaults « Karl Studio », the tool returns « karlstudio.fr » at turn 2, and the allocator
    // was minting a NEW identity — the company behind two unrelated fakes, one of them a
    // PERSON, and a website attributed to someone else.
    //
    // This is not a widening: `applyVaultVariants` was ALREADY mapping this spelling to
    // the entity's token, at the end of the pass. The two were simply in DISAGREEMENT —
    // the allocator was claiming the value before the variants pass saw it. They are
    // aligned on the same identity definition (`entityKey`: casing + separators folded).
    const glue = entityKey(real);
    if (glue.length >= 4) {
      for (const [orig, token] of reverse) if (entityKey(orig) === glue) return token;
    }
    return undefined;
  };

  // `salary` was RETIRED as a redaction category (its amounts are left in clear), so the
  // n-token path it used to own is gone with it — a salary amount is now an ordinary
  // number, governed by the `numbers` toggle like any other.
  const entityCandidates = deNested;

  // Phase 3 — allocate a reversible substitute per entity (mutates the vault, fail-closed).
  // Two allocators, one single contract (« reported ⇒ vaulted ⇒ substituted », checked below):
  // TOKEN mode doesn't degrade fake allocation, it replaces it — a marker has
  // no plausibility to uphold and no collision to avoid, so none of the identity
  // machinery applies to it. See `allocateTokens.ts`.
  const entityValues: string[] = [];
  const entityCanon = new Map<string, string>();
  if (options.mode === "token") {
    allocateTokens(entityCandidates, { vault, reverse, taken, entityValues, record, input });
  } else {
    allocateEntities(entityCandidates, {
      vault, reverse, taken, entityValues, entityCanon, record, input, geoFakes, geoAnchors,
      resolveFakeCI, resolveEntityFakeCI, collidesAvoid, salt: options.salt ?? 0,
      notorietyCommercial: options.commercialNotoriety === true,
    });
  }

  // Standalone numbers -> n1, n2, … ONLY when explicitly enabled. Mask entity values
  // first so digits inside a replaced phone/IBAN aren't tokenised twice.
  if (tokenizeNumbers) {
    let masked = input;
    for (const v of [...entityValues].sort((a, b) => b.length - a.length)) {
      masked = masked.split(v).join(" ".repeat(v.length));
    }
    for (const mm of masked.matchAll(NUMBER_RE)) {
      const m = mm[0];
      const at = mm.index ?? 0;
      // Skip a digit run GLUED to letters — it's part of an alphanumeric identifier (a stock
      // ticker, an ISIN like FR0011871110, a product/ref code), NOT a standalone quantity.
      // Tokenising it fragments the identifier and corrupts financial output ("FR0011871110"
      // → "FRn1"). Adjacency is read on `masked`, where entity values are already blanked.
      const before = masked[at - 1];
      const after = masked[at + m.length];
      if (/[A-Za-z]/.test(before ?? "") || /[A-Za-z]/.test(after ?? "")) continue;
      // Skip a bare calendar year (millésime) — see `isBareYear`.
      if (isBareYear(m)) continue;
      if (reverse.has(m)) {
        record("secret", m, reverse.get(m)!, "NUMBER");
        continue;
      }
      const token = `n${++numberCounter}`;
      vault[token] = m;
      reverse.set(m, token);
      taken.add(token);
      record("secret", m, token, "NUMBER");
    }
  }

  // Apply every mapping in one safe pass — skip vault entries whose category the user
  // turned off (or numbers, when disabled), and never re-apply an allow-listed original.
  const exclude = disabledVaultTokens(vault, {
    numbers: tokenizeNumbers,
    disabledKinds: options.disabledKinds,
    kinds: options.kinds,
  });
  if (keep.size) {
    for (const [token, value] of Object.entries(vault)) {
      if (isKept(value, keep)) exclude.add(token);
    }
  }
  // A vaulted value must not rewrite the INSIDE of a URL — see `urlOccurrenceGuard`. The
  // kind comes from the caller's map ⊕ THIS pass's own matches (a value vaulted a moment
  // ago is in neither `options.kinds` nor the conversation's, and it is precisely the one
  // that corrupted the host of every link in the same result). No proven kind ⇒ EXEMPT,
  // i.e. substituted as before: unknown fails CLOSED, like `disabledVaultTokens`.
  const kindOf = new Map<string, string>(Object.entries(options.kinds ?? {}));
  for (const m of matches) if (m.value && m.category) kindOf.set(m.value, m.category);
  const urlGuard = urlSpans
    ? urlOccurrenceGuard(urlSpans, (value) => {
        const k = kindOf.get(value);
        return k === undefined || URL_EXEMPT_KINDS.has(redactionCategory(k));
      })
    : undefined;
  // Exact pass first (longest-first), then the TOLERANT residual pass: an entity the
  // vault already knows routinely comes back as a variant — "KARL_STUDIO" in a filename,
  // a slug, an upper-cased heading — and the exact pass alone shipped it in CLEAR.
  // ⚠️ The variant pass gets NO url guard on purpose: a slugified real value inside a URL
  // (`…/Compte-rendu-jean-rebour-36db…`) is the user's data wearing a URL's clothes, and
  // sparing it would be a leak. Only the EXACT spelling is spared, which is what the
  // structural parts of a link (host, id, query flag) actually are.
  const text = applyVaultVariants(applyVault(input, vault, exclude, urlGuard), vault, exclude);

  // POSTCONDITION — "reported ⇒ vaulted ⇒ substituted". `matches` is what the UI
  // shows as redacted, what `redactedSpans` persists and what the privacy report
  // counts; it is built while gathering, BEFORE we know what actually got applied.
  // The two could silently disagree, and a match that claims a redaction which
  // never happened is worse than no match at all: the user is told a value is
  // protected while it sits on the wire. Reconcile here, at the single exit.
  //
  // Two different situations, deliberately handled differently:
  //  - the token is in `exclude` ⇒ the user turned that category off (or kept the
  //    value in clear). Not substituting is CORRECT, so this is not an error —
  //    but it is not a redaction either: drop the claim.
  //  - the token is missing from the vault ⇒ the value is UNREVERSIBLE (nothing to
  //    restore the reply with) and was never substituted. That is a real defect,
  //    so it fails CLOSED via `modelError`, which the send path turns into a
  //    refusal rather than a downgrade.
  // "To verify": re-attach the surviving candidates' `uncertain` flag to the matches
  // by entity key (the allocators don't thread it — the value is the join). Done on the
  // POST-filter list, so a span the filter dropped can't flag anything, and a span
  // corroborated in `gather` was already cleared. Word-level ALIASES of a name don't
  // inherit the flag — the audit styles the whole-value span the user actually sees.
  const uncertainKeys = new Set(
    deNested.filter((c) => c.uncertain).map((c) => entityKey(c.value)),
  );

  const applied: RedactionMatch[] = [];
  let unreversible = false;
  for (const m of matches) {
    if (vault[m.placeholder] !== m.value) {
      unreversible = true;
      continue;
    }
    if (exclude.has(m.placeholder)) continue;
    applied.push(uncertainKeys.has(entityKey(m.value)) ? { ...m, uncertain: true } : m);
  }
  return {
    text,
    matches: applied,
    modelError:
      modelError ??
      (unreversible ? "redaction postcondition failed: a reported match was not vaulted" : undefined),
  };
}
