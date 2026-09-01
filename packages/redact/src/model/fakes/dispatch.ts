import { fakeDepartment, fakeRegion } from "../../engine/frGeo";
import { fakeGeo, type GeoAnchors } from "../../engine/geo/index";
import { fakeAddressComplement } from "../../engine/addressComplement";
import { fakeBitcoinLegacyAddress } from "../../engine/validators/base58check";
import { FAKE_LAST, firstNamePool } from "./pools";
import { hashString, pick, rehash, fakeToken, fakeDigits, fakeHandle } from "./primitives";
import { isMrzShaped } from "../../kinds";
import { fakeMrz } from "./mrz";
import { fakeCity, fakeOrg, fakePostal, fakeDate, fakeIp, fakeEmail, fakePhone, fakeCard, fakeIban} from "./entities";
import { fakeValidId } from "./checksummed/index";
import { fakePath } from "./paths";
import { fakeUrl } from "./urls";

/**
 * Build a believable fake of the same kind as `value`. `attempt` varies it for uniqueness
 * (collision retry). `salt` (default 0 = the legacy deterministic mapping) is
 * a per-conversation SHIFT of the value→fake mapping: the same real value maps to a
 * different fake in another conversation, which defeats a PRECOMPUTED public table.
 * ⚠️ It is NOT a keyed PRF and must not be described as one: `hashString` is public and
 * the shift is additive over a 31-bit space, so ONE known (value, fake) pair recovers it
 * by exhaustive search, after which other values fall to a dictionary. What the fake does
 * NOT do is leak the real value to someone holding only the fake — that property lives in
 * the generators (`digitsNotInvertible.test.ts`), not here.
 * A fake « Simon Cros » therefore no longer reverses to « Augustin Vaudel » by precomputing
 * the pool over a name list. Stability WITHIN a conversation
 * comes from the vault, not from this — so the same salt is passed for every send of one
 * conversation. Added into every seed so an entity and its fragments/casings shift together.
 */
export function fakeFor(
  category: string,
  value: string,
  attempt: number,
  country?: string,
  salt = 0,
  // City anchoring (engine/geo/cityAnchor): state of ONE pseudonymize call, never
  // of the module — two conversations share nothing. Absent (unit tests of a single
  // fake) ⇒ previous behaviour.
  geoAnchors?: GeoAnchors,
): string {
  const h = hashString(value) + salt + attempt * 101;
  // For the kinds whose helper RE-HASHES `value` internally off its second arg (it is that
  // helper's own salt), fold the conversation salt into the attempt so those shift too —
  // salting `h` above does not reach them.
  const a = attempt + salt;
  switch (category) {
    case "URL":
      // Without this case, a URL would get a NAME-shaped fake — « allez sur Marc Charvet ».
      return fakeUrl(value, a);
    case "IP":
      // In-range octets (0-255) / hex hextets — a VALID fake IP, not `fakeDigits`'s
      // char-for-char swap that could emit octet 313.
      return fakeIp(value, a);
    case "TOKEN":
    case "APIKEY":
    case "KEY":
    case "API_KEY":
    case "SECRET":
    case "AWS_KEY":
    case "GOOGLE_KEY":
    case "GITHUB_TOKEN":
    case "SLACK_TOKEN":
    case "BEARER_TOKEN":
    case "PRIVATE_KEY":
    case "JWT":
    case "BIC":
    case "MAC":
      // Fully scramble — never leak a key's letters (the default only swaps
      // digits); keeps separators (:/-/.) so the shape (MAC/BIC/wallet) stays.
      return fakeToken(value, h);
    case "CRYPTO":
      // A LEGACY Bitcoin address gets a fake that passes the SAME base58check: since
      // DETECTION requires it, a scramble wouldn't even be re-recognised as an
      // address by our own engine — and a fake that fails its checksum invites the model
      // to « correct » it, a correction that no longer reverses. Other chains (bech32,
      // Monero, Ethereum…) keep the scramble: their proof isn't a checksum.
      return fakeBitcoinLegacyAddress(value, h) ?? fakeToken(value, h);
    // NAME/EMAIL deliberately ABANDON length-matching (the documented trade: a usable
    // identity beats the size hint) — `fitLen` padded «Julien» into «Garciaopihar»,
    // a gibberish surname the model second-guesses.
    case "NAME":
    case "PERSON":
    case "FULLNAME": {
      // Same-gender first name (from the real name's first token) so the model's
      // honorific/pronoun/agreement stays correct — and the same WORD COUNT as the
      // real (a two-word fake for a one-word value breaks the recase machinery's
      // separator replication, splitting one identity into «nathan vernay» /
      // «nathanvernay»).
      const words = value.trim().split(/\s+/);
      const first = pick(firstNamePool(words[0] || value), h);
      return words.length <= 1 ? first : `${first} ${pick(FAKE_LAST, rehash(h))}`;
    }
    case "FIRSTNAME":
      return pick(firstNamePool(value), h);
    case "LASTNAME":
    case "SURNAME":
      return pick(FAKE_LAST, h);
    case "EMAIL":
      // The RAW attempt, not `a`: the third arg is CONCATENATED into the local-part as a
      // disambiguating suffix, and folding the salt in printed the conversation salt's
      // leading digits inside the fake («…savary9876@…» under salt 987654321) — a
      // partial leak of the salt into the wire. It must only ever reach the output
      // THROUGH the hash — it already shifts the name pick via `h`.
      return fakeEmail(value, h, attempt);
    case "USERNAME":
      // A pseudo / handle → per-character CLASS-preserving scramble (lower/upper/digit
      // each stay their class, `@`/`_`/`.`/`-` kept) — the full scramble's ransom-note
      // casing («@rOpGRSj») read fake at a glance. Never used for secrets.
      return fakeHandle(value, h);
    // A filesystem path: keep the root, scramble the username + folders.
    case "PATH":
    case "FILEPATH":
    case "FILE_PATH":
    case "FILE":
    case "FILENAME":
    case "FILE_NAME":
    case "DIRECTORY":
    case "DIR":
    case "FOLDER":
      // Per-segment + deterministic (see fakePath): pass the raw attempt, NOT the
      // whole-path hash `h`, so a shared segment maps identically across paths.
      return fakePath(value, a);
    case "ORG":
    case "COMPANY":
    case "EMPLOYER":
    case "CUSTOMER":
      // The RAW attempt (not `a`): it widens the length tolerance, and folding the
      // salt in would blow the tolerance open on the first try of every salted
      // conversation. The salt already shifts the pick through `h`.
      return fakeOrg(value.length, h, attempt);
    // Geographic spans -> a coherent REAL place of the SAME country, in that
    // country's own address FORMAT (FR also stays in the same region). The logic +
    // per-country data live in ../engine/geo (fakeGeo); `country` comes from the
    // address detector (Detection.country). An UNCOVERED country falls back to the FR
    // default (still fully hidden) -- or, for an odd postal shape, a same-shape
    // scramble -- so a fake is NEVER a place from the wrong country. This also keeps a
    // "CP Ville" code + city consistent (they used to be faked apart) and stops a city
    // like "MALAKOFF" being mistyped as a name.
    case "PLACE":
    case "ADDRESS":
    case "LOCATION":
    case "CITY":
    case "TOWN":
    case "POSTAL_CODE":
    case "POSTCODE":
    case "ZIP":
    case "ZIPCODE": {
      // ⚠️ An address COMPLEMENT carries the ADDRESS category, and the ADDRESS branch
      // always fabricates a STREET: « appartement A02 » used to get « 27 CHEMIN des
      // Tilleuls », a second invented place where the document named only one.
      // A complement's fake keeps its keyword and changes only the code.
      const comp = fakeAddressComplement(value, h);
      if (comp != null) return comp;
      const g = fakeGeo(category, value, h, country, geoAnchors, attempt) ??
        fakeGeo(category, value, h, undefined, geoAnchors, attempt);
      if (g != null) return g;
      return /POSTAL|POSTCODE|ZIP/.test(category)
        ? fakePostal(value, h, a)
        : fakeCity(value, h);
    }
    // A French department / region -> ANOTHER real one (never a city / a name).
    case "DEPARTMENT":
    case "DEPARTEMENT":
      return fakeDepartment(value, h);
    case "REGION":
      return fakeRegion(value, h);
    // Dates → a VALID, realistic different date in the same format.
    case "DOB":
    case "DATE":
    case "BIRTHDATE":
      return fakeDate(value, category, h);
    case "PHONE":
      // Country code + national class preserved, subscriber digits swapped — a fake
      // that stops LOOKING like a phone invites the model to "correct" it.
      return fakePhone(value, a);
    case "ID":
    case "NATIONAL_ID":
    case "COMPANY_ID":
    case "BANK_ROUTE":
      // An MRZ first: its LETTERS carry the name — `fakeDigits`'s digits-only
      // scramble would keep them (a leak). Predicate shared with the rule (kinds.ts).
      if (isMrzShaped(value)) return fakeMrz(value, a);
      // A CHECKSUMMED id (NIR, SIREN/SIRET, TVA, RIB, CPF, ABN…) gets a fake
      // that passes the SAME checksum (fakes/checksummed) — the fakeCard/
      // fakeIban rationale generalised: a fake failing its own validator is
      // visible to any validating tool and invites the model to "correct" it.
      // No scheme recognised → the plain same-shape swap, as before.
      return fakeValidId(category, value, a) ?? fakeDigits(value, a);
    case "CARD":
      // Same shape AND a passing Luhn — a fake that fails its own checksum is visible
      // to any validating tool and invites the model to "correct" it.
      return fakeCard(value, a);
    case "IBAN":
      // Country code kept, digits swapped, mod-97 key recomputed — same rationale.
      return fakeIban(value, a);
    default: {
      // An LLM/NER tag that MEANS an id family ("SSN", "SIRET", "PASSPORT"…)
      // still deserves a checksum-valid fake; fakeValidId gates on the mapped
      // category itself, so a quantity/date/health number never enters it.
      if (/\d/.test(value)) return fakeValidId(category, value, a) ?? fakeDigits(value, a);
      // Word count mirrors the real value (see the NAME case: separator replication).
      const words = value.trim().split(/\s+/);
      const first = pick(firstNamePool(words[0] || value), h);
      return words.length <= 1 ? first : `${first} ${pick(FAKE_LAST, rehash(h))}`;
    }
  }
}
