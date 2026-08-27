import type { Detection, RedactionType, Vault } from "../../types";
import { redactionCategory } from "../../kinds";
import { buildFakeWordIndex } from "./fakeWordIndex";
import { recaseLike, entityKey } from "../../util";
import { fakeFor } from "../fakes";
import { buildFakePath } from "../paths";
import {
  buildFakeEmail,
  emailNameAliases,
  buildFakeName,
  nameAliases,
  placeAliases,
  reconstructGlued,
  reuseNameFake,
} from "../identity";

/** The mutable state the allocation loop reads + writes. Threaded explicitly so the
 *  loop (the intricate identity/fail-closed core) lives in one focused module. */
export interface AllocateCtx {
  vault: Vault;
  reverse: Map<string, string>;
  taken: Set<string>;
  entityValues: string[];
  /** Canonical fake BASE per entity (`category|normalised value`) → recased per casing. */
  entityCanon: Map<string, string>;
  record: (type: RedactionType, value: string, token: string, category: string) => void;
  input: string;
  /** Block-coherent geo fakes (Commune/Département/… of one address block). */
  geoFakes: Map<string, string>;
  geoAnchors?: import("../../engine/geo/cityAnchor").GeoAnchors;
  resolveFakeCI: (real: string) => string | undefined;
  resolveEntityFakeCI: (real: string) => string | undefined;
  collidesAvoid: (c: string) => boolean;
  /** Per-conversation secret shift for the value→fake mapping (0 = legacy deterministic). */
  salt: number;
  notorietyCommercial?: boolean; // commercial notoriety: email fakes KEEP a notorious domain
}

/**
 * Phase 3 — allocate a reversible fake for each de-nested entity, mutating the vault. Keeps
 * ONE atomic identity across casings/fragments/tool-rounds (emails, names, glued handles,
 * recased entities), stays collision- and avoid-free, and — on pool exhaustion — falls back
 * to a GUARANTEED-unique suffixed fake so a real value is NEVER left in the wire (audit M-11,
 * fail-closed). Byte-identical to the former inline loop; state comes via {@link AllocateCtx}.
 */
export function allocateEntities(deNested: Detection[], ctx: AllocateCtx): void {
  const {
    vault, reverse, taken, entityValues, entityCanon, record, input, geoFakes, geoAnchors,
    resolveFakeCI, resolveEntityFakeCI, collidesAvoid, salt,
  } = ctx;
  // No word may serve two identities (see fakeWordIndex.ts — the «Ajaccio»/«Rouen»/«hugo»
  // incident): seeded from the fakes already in the vault (a PREVIOUS pass on the same
  // conversation), maintained at every mint site below so an intra-pass batch is guarded
  // the same way.
  const fakeIndex = buildFakeWordIndex(vault);
  // Words present in the INPUT, case-insensitive — a NAME/EMAIL word-fake must never be
  // minted equal to one (the notarial-deed collision: fake surname "Laurent" while the
  // REAL "Maître GERMAIN" sits untouched in the text → un-redaction rewrites the real
  // person into the faked one). `accept`'s `!input.includes` can't see it (case-sensitive,
  // whole-candidate), and NAME/EMAIL skip `collidesAvoid` BY DESIGN (canonical reuse must
  // not be rejected) — so the check rides the MINT-time `isTaken` predicate instead, which
  // buildFakeName/buildFakeEmail only consult when picking a NEW word-fake.
  const WORD = /\p{L}[\p{L}\p{M}'’-]*/gu;
  const inputWords = new Set<string>();
  for (const w of input.match(WORD) ?? [])
    for (const seg of [w, ...w.split(/['’]/)]) // elision: "d'Amiens" also indexes "Amiens"
      if (seg.length >= 3) inputWords.add(seg.toLowerCase());
  // `fakeIndex.wordTaken` closes the casing hole: `taken.has(c.toLowerCase())` lowercases
  // the CANDIDATE but the set stores original-case keys — «hugo» sailed past «Hugo» and the
  // un-redaction of a bare «hugo» then rewrote the OTHER identity's real value.
  // ⚠️ `collidesAvoid` JUSTE ICI, nulle part ailleurs pour un NOM. L'exemption NAME/EMAIL
  // du garde `avoid` tient (rejeter le faux CANONIQUE scinderait la personne en deux), mais
  // elle laissait un trou : un mot de faux NEUF pouvait tomber sur un mot d'un tour
  // PRÉCÉDENT — `inputWords` ne voit que l'envoi courant — et le coffre global re-redacted
  // ensuite ce mot-là partout. `mintTaken` n'est consulté QUE pour choisir un mot neuf,
  // jamais pour réutiliser un canonique : la raison de l'exemption est intacte, et le repli
  // garanti-unique de la boucle couvre un pool épuisé. `guards.test.ts` épingle les deux.
  const mintTaken = (c: string): boolean =>
    taken.has(c) || taken.has(c.toLowerCase()) || inputWords.has(c.toLowerCase()) ||
    fakeIndex.wordTaken(c) || collidesAvoid(c);
  for (const { value, category, country } of deNested) {
    if (reverse.has(value)) {
      if (!entityValues.includes(value)) entityValues.push(value);
      record("secret", value, reverse.get(value)!, category);
      continue;
    }
    const cat = redactionCategory(category);
    // A NAME re-detected in a DIFFERENT casing, or reappearing whole after its parts
    // were faked (both routine when a tool RESULT echoes the person back), must reuse
    // the SAME identity — not mint a new one (the "remapping involontaire": one real
    // person behind a dozen fakes). When every word already has a canonical fake, the
    // per-word aliases already substitute it via `applyVault`, so no new vault entry
    // is needed — reuse the reconstructed placeholder for the match chip only.
    if (cat === "name") {
      // Le faux DÉJÀ attribué à cette personne — par MOTS, ou par VALEUR ENTIÈRE quand le
      // coffre la connaît sous une autre casse et une autre catégorie. Les deux chemins et
      // ce qu'ils réparent : `../identity/reuse.ts`.
      const cased = reuseNameFake(value, input, { resolveFakeCI, resolveEntityFakeCI });
      if (cased !== undefined) {
        if (!entityValues.includes(value)) entityValues.push(value);
        // L'entrée pour CETTE casse est ce qui fait que `applyVault` (sensible à la casse)
        // substitue réellement.
        if (!reverse.has(value) && !vault[cased] && cased !== value && !input.includes(cased)) {
          vault[cased] = value;
          reverse.set(value, cased);
          taken.add(cased);
          fakeIndex.add(cased, value);
        }
        record("secret", value, cased, category);
        continue;
      }
    }
    // GLUED identity: a separatorless handle ("atelierverrier") whose pieces are each
    // an existing canonical fake (person name-parts "atelier"+"verrier") must reuse
    // those fakes GLUED ("charlottesavel"), NOT mint a fresh unrelated ORG fake
    // ("Brantley Systems") — else the same real identity hides behind two disconnected
    // fakes (the reported ORG-glue "double redaction"). Applies to the identity-ish
    // kinds; reconstructGlued only fires when the whole value segments into ≥2 known
    // reals, so an unrelated company falls through to the normal allocator below.
    if (cat === "name" || cat === "company" || cat === "username") {
      const glued = reconstructGlued(value, resolveFakeCI, reverse.keys());
      if (glued && !taken.has(glued) && glued !== value && !input.includes(glued)) {
        vault[glued] = value;
        reverse.set(value, glued);
        taken.add(glued);
        fakeIndex.add(glued, value);
        entityValues.push(value);
        record("secret", value, glued, category);
        continue;
      }
    }
    // Allocate a unique fake that doesn't already occur in the text. Emails go
    // through `buildFakeEmail` and multi-word NAMES through `buildFakeName`, both
    // vault-aware so each shared token REUSES the person's existing canonical fake
    // (atomic identity across the whole conversation); every other kind uses `fakeFor`.
    const isEmail = cat === "email";
    const isName = cat === "name";
    const isPath = cat === "path";
    // Whole-value named ENTITIES that keep ONE identity across casings via a canonical
    // recased base: company + place kinds (city/region/postal/geo → "location", and
    // "address") + free-form "health" (a diagnosis/med repeated in another casing) +
    // "username". NAME/EMAIL keep their own atomic machinery above; PATH is casing-
    // consistent at the segment level (`fakePathSegment` seeds from the lowercased segment).
    const isRecase =
      cat === "company" ||
      cat === "location" ||
      cat === "address" ||
      cat === "health" ||
      cat === "username";
    // A candidate fake is usable when it's free, isn't the value itself, doesn't already
    // occur in the text, and reuses no conversation word — EXCEPT for the kinds that own
    // their OWN atomic-identity machinery, which must not be perturbed by the avoid check:
    //  • PATH keeps per-SEGMENT deterministic consistency (a shared folder must fake
    //    identically across files); a path is not a word a user retypes anyway.
    //  • NAME / EMAIL REUSE a person's canonical fake across every occurrence (buildFakeName
    //    /buildFakeEmail return it regardless of `attempt`). Subjecting that to `collidesAvoid`
    //    would reject all 60 attempts whenever the canonical happens to share a word with the
    //    conversation, fall to the suffixed fallback, and SPLIT the person into a 2nd identity.
    //    Their own predicate already prevents fake↔fake clashes; conversation-avoid is for the
    //    generic place/org kinds (the actual "france" collision target).
    const skipAvoid = isPath || isName || isEmail;
    // `fakeIndex.clashes` — never behind `skipAvoid`'s reasons but scoped the same way:
    // NAME/EMAIL word choice is already guarded inside their builders via `mintTaken`
    // (whole-candidate rejection here would also reject canonical REUSE and split the
    // person in two — the documented trap), and a PATH is never echoed as a bare word.
    const accept = (c: string): boolean =>
      !taken.has(c) && c !== value && !input.includes(c) &&
      (skipAvoid || (!collidesAvoid(c) && !fakeIndex.clashes(c, value)));
    const entityKeyStr = isRecase ? `${cat}|${entityKey(value)}` : "";
    let fake = "";
    let pathPairs: [string, string][] = [];
    // Block-coherent geo fake (Commune/Département/… of one address block share ONE real
    // place). Use it when it survives `accept` (free / not the value / no avoid clash);
    // otherwise fall through to the independent allocator below.
    const preGeo = geoFakes.get(value);
    if (preGeo && accept(preGeo)) fake = preGeo;
    for (let a = 0; !fake && a < 60; a++) {
      let candidate: string;
      if (isEmail) candidate = buildFakeEmail(value, a, resolveFakeCI, mintTaken, salt, ctx.notorietyCommercial === true);
      else if (isName) candidate = buildFakeName(value, a, resolveFakeCI, mintTaken, salt);
      else if (isPath) candidate = buildFakePath(value, a, salt).fake;
      else if (isRecase && a === 0) {
        // An entity keeps ONE identity across casings. Recase a canonical BASE (this
        // call's earlier casing, else a prior turn's fake, else a fresh one) to THIS
        // occurrence — so "Karl Studio"/"Karl studio" → "Oslen Group"/"Oslen group" and
        // "Nantes"/"NANTES"/"nantes" → "Bastia"/"BASTIA"/"bastia": distinct vault entries
        // but the SAME entity (never two identities). Key on the NORMALISED value
        // (lowercase + separators stripped) so EVERY spelling variant shares ONE base;
        // `recaseLike` re-shapes it to each occurrence's casing AND separator layout.
        let base = entityCanon.get(entityKeyStr);
        if (base === undefined) {
          // Establish the canonical base ONCE, and only cache a COLLISION-SAFE one —
          // else a base that clashes with `avoid`/`taken` would be cached, every later
          // occurrence would recase from it, clash again, fall to a fresh fake, and the
          // entity would SPLIT into several identities (`recaseLike` only changes casing/
          // separators, which `collidesAvoid`/word checks ignore, so a safe base stays
          // safe in every casing). Prefer a prior turn's fake, else the first free fake.
          const seed = resolveEntityFakeCI(value);
          if (seed !== undefined && accept(recaseLike(seed, value))) base = seed;
          for (let b = 0; base === undefined && b < 60; b++) {
            const cand = fakeFor(category, value, b, country, salt, geoAnchors);
            if (accept(recaseLike(cand, value))) base = cand;
          }
          if (base !== undefined) entityCanon.set(entityKeyStr, base);
        }
        candidate = base !== undefined ? recaseLike(base, value) : fakeFor(category, value, a, country, salt, geoAnchors);
      } else candidate = fakeFor(category, value, a, country, salt, geoAnchors);
      if (accept(candidate)) {
        fake = candidate;
        if (isPath) pathPairs = buildFakePath(value, a, salt).pairs;
        break;
      }
    }
    if (!fake) {
      // Fake pool exhausted (60 straight collisions — the main loop also enforces
      // `collidesAvoid`, which this fallback deliberately relaxes: best-effort avoid,
      // never a leak). NEVER leave the real value in the wire — but never mint a
      // case-twin or word-twin of ANOTHER identity's fake either. The old fallback
      // suffixed ONE base checked against `taken` CASE-SENSITIVELY and skipped the
      // word index entirely — so two unrelated companies ended up as «BRANTLEY
      // Systems» / «Brantley Systems», and a model normalising the casing of its echo
      // made `unredact` restore the WRONG company (the exact cross-identity corruption
      // `fakeWordIndex` exists to prevent). So: try successive BASES through the word
      // index first (`clashes` folds case by construction).
      // ⚠️ A base must not CONTAIN the value: some fakers are identity pass-throughs
      // on an off-shape input (fakeDigits on a digitless "phone"), and emitting THAT
      // ships the real value verbatim inside its own "fake".
      for (let k = 0; !fake && k < 40; k++) {
        const raw = fakeFor(category, value, k, country, salt, geoAnchors);
        if (!raw || raw.toLowerCase().includes(value.toLowerCase())) continue;
        if (!taken.has(raw) && raw !== value && !input.includes(raw) && !fakeIndex.clashes(raw, value)) {
          fake = raw;
        }
      }
      if (!fake) {
        // TOTAL exhaustion — the guaranteed-terminating neutral series (audit M-11):
        // opaque and not length-matched, but a size hint beats a plaintext PII leak,
        // and the span is vaulted + recorded below so it stays reversible. The neutral
        // base is constant-case and carries no other identity's root, so the twins
        // guarded above cannot reappear; `clashes` is deliberately NOT consulted here
        // (each earlier «redacted-N» would flag the shared word forever — no free
        // candidate would exist and the loop would never terminate).
        const base = "redacted"; // then suffixed until free
        let n = 2;
        fake = base;
        while (taken.has(fake) || fake === value || input.includes(fake)) fake = `${base}-${n++}`;
      }
    }
    vault[fake] = value;
    reverse.set(value, fake);
    taken.add(fake);
    fakeIndex.add(fake, value);
    entityValues.push(value);
    record("secret", value, fake, category);

    // Register reversible per-word aliases when we just faked an EMAIL or a NAME.
    //  - EMAIL: a model writing to `nathan.brivet@…` greets "Bonjour Nathan" — a bare
    //    token that is NOT a vault key, so `unredact` would leave the WRONG name.
    //  - NAME: a later STANDALONE token or a different CASING of the person (the
    //    surname alone, Title-Cased, in a search result) must substitute to and
    //    reverse from the SAME fake instead of a fresh identity.
    // `Nathan → Julien` (etc.) makes both reverse to the real value. Because the fake
    // was built REUSING existing canonicals, an already-present alias is hit by the
    // collision guard (no clobber) — the mapping stays atomic across the conversation.
    //  - PLACE: the geo detector emits « ST OUEN (93400) » as ONE value so the fake code
    //    stays coherent with the fake town, but a model writes the town ALONE — and a bare
    //    fragment is not a vault key, so the reply told its reader the property was in the
    //    INVENTED town. See `../identity/place.ts`.
    const placePairs = cat === "location" ? placeAliases(value, fake) : [];
    if (isEmail || isName || placePairs.length) {
      const aliases = placePairs.length
        ? placePairs
        : isEmail
          ? emailNameAliases(value, fake)
          : nameAliases(value, fake);
      for (const [alias, real] of aliases) {
        if (taken.has(alias) || vault[alias] !== undefined) continue;
        vault[alias] = real;
        if (!reverse.has(real)) reverse.set(real, alias);
        taken.add(alias);
        fakeIndex.add(alias, real);
      }
    }
    // Per-segment PATH aliases: each DISTINCTIVE segment (username / custom folder /
    // filename) gets its OWN vault entry, so a recomposed or standalone segment
    // reverses too AND the same real segment reuses the same fake conversation-wide
    // (an agent navigating the tree keeps a coherent map). Generic folders
    // (Desktop/Documents/…) are deliberately excluded — vaulting them would
    // forward-apply to the same common word in ordinary prose (over-redaction).
    if (isPath) {
      for (const [alias, real] of pathPairs) {
        if (alias === real || input.includes(alias)) continue;
        if (taken.has(alias) || vault[alias] !== undefined) continue;
        vault[alias] = real;
        if (!reverse.has(real)) reverse.set(real, alias);
        taken.add(alias);
      }
    }
  }
}
