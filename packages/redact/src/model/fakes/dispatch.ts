import { fakeDepartment, fakeRegion } from "../../engine/geo/frGeo";
import { fakeGeo, type GeoAnchors } from "../../engine/geo";
import { fakeAddressComplement } from "../../engine/addresses/complement";
import { fakeBitcoinLegacyAddress } from "../../engine/validators/base58check";
import { FAKE_LAST, firstNamePool } from "./pools";
import { fakeCredential } from "./credentials";
import { hashString, pick, rehash, fakeToken, fakeDigits, fakeHandle, seedFrom } from "./primitives";
import { isMrzShaped } from "../../kinds";
import { fakeMrz } from "./mrz";
import { fakeCity, fakeOrg, fakePostal, fakeDate, fakeEmail, fakePhone, fakeCard, fakeIban} from "./entities";
import { fakeIp } from "./ip";
import { fakeValidId } from "./checksummed";
import { fakePath } from "./paths";
import { fakeUrl } from "./urls";

/**
 * Build a believable fake of the same kind as `value`. `attempt` varies it for uniqueness.
 * `salt` (0 = the legacy deterministic mapping) is a per-conversation SHIFT of the
 * value→fake mapping, defeating a PRECOMPUTED public table. ⚠️ NOT a keyed PRF: one known
 * (value, fake) pair recovers it. Not leaking the real value to someone holding only the
 * fake is the generators' property (`digitsNotInvertible.test.ts`). Stability WITHIN a
 * conversation comes from the vault; the salt rides every seed so an entity and its
 * fragments shift together.
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
  // The per-conversation KEY, when the conversation has one. With it every seed below
  // becomes `HMAC(key, …)` instead of a public hash shifted by an additive salt, so one
  // known (value, fake) pair no longer yields the shift — and with it every other value.
  convKey?: Uint8Array,
): string {
  const h = seedFrom(convKey, `e:${category}:${attempt}`, value, hashString(value) + salt + attempt * 101);
  // For the kinds whose helper RE-HASHES `value` internally off its second arg (it is that
  // helper's own salt), fold the conversation salt into the attempt so those shift too —
  // salting `h` above does not reach them.
  const a = attempt + salt;
  switch (category) {
    case "URL":
      // Without this case, a URL would get a NAME-shaped fake — « allez sur Marc Charvet ».
      return fakeUrl(value, a, convKey);
    case "IP":
      // Class- and prefix-preserving (fakes/ip.ts): a LAN address stays a LAN address,
      // two hosts of one /24 stay on one fake /24 — what a model reasons on survives.
      return fakeIp(value, a, convKey);
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
    case "JWT":
    case "COOKIE":
    case "CONNECTION_STRING":
      // Format-preserving (fakes/credentials.ts): the vendor prefix, a JWT's header, a
      // cookie's names and a connection string's URI SCHEME are FORMAT and stay; every
      // other character is redrawn in its own class. What a coding agent derives from a
      // credential — its vendor, its kind, the endpoint it speaks to — survives.
      // ⚠️ CONNECTION_STRING belongs HERE: the default arm is the DIGIT swapper, which would
      // leave user, host and the alphabetic half of the password verbatim. `credentials.test.ts`.
      return fakeCredential(value, h, category);
    case "PRIVATE_KEY":
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
    // NAME/EMAIL deliberately ABANDON length-matching: a usable identity beats the size hint.
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
      // The RAW attempt, not `a`: the third arg is CONCATENATED into the local-part, and the
      // salt must only ever reach the output THROUGH the hash (it already shifts `h`).
      return fakeEmail(value, h, attempt);
    case "USERNAME":
      // A pseudo / handle → per-character CLASS-preserving scramble (a ransom-note casing
      // reads fake at a glance). Never used for secrets.
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
      return fakePath(value, a, convKey);
    case "ORG":
    case "COMPANY":
    case "EMPLOYER":
    case "CUSTOMER":
      // The RAW attempt (not `a`): it widens the length tolerance, and folding the
      // salt in would blow the tolerance open on the first try of every salted
      // conversation. The salt already shifts the pick through `h`.
      return fakeOrg(value.length, h, attempt);
    // Geographic spans → a coherent REAL place of the SAME country, in that country's own
    // address FORMAT (`../engine/geo`); `country` comes from the detector. An UNCOVERED
    // country keeps the value's shape, so a fake is NEVER a place from the wrong country.
    case "PLACE":
    case "ADDRESS":
    case "LOCATION":
    case "CITY":
    case "TOWN":
    case "POSTAL_CODE":
    case "POSTCODE":
    case "ZIP":
    case "ZIPCODE": {
      // An address COMPLEMENT carries the ADDRESS category, but must not become a STREET
      // (« appartement A02 » is not a second place): its fake keeps the keyword, changes the code.
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
      return fakePhone(value, a, convKey);
    case "ID":
    case "NATIONAL_ID":
    case "COMPANY_ID":
    case "BANK_ROUTE":
      // An MRZ first: its LETTERS carry the name — `fakeDigits`'s digits-only
      // scramble would keep them (a leak). Predicate shared with the rule (kinds.ts).
      if (isMrzShaped(value)) return fakeMrz(value, a, convKey);
      // A CHECKSUMMED id (NIR, SIREN/SIRET, TVA, RIB, CPF, ABN…) gets a fake
      // that passes the SAME checksum (fakes/checksummed) — the fakeCard/
      // fakeIban rationale generalised: a fake failing its own validator is
      // visible to any validating tool and invites the model to "correct" it.
      // No scheme recognised → the plain same-shape swap, as before.
      return fakeValidId(category, value, a, convKey) ?? fakeDigits(value, a, convKey);
    case "CARD":
      // Same shape AND a passing Luhn — a fake that fails its own checksum is visible
      // to any validating tool and invites the model to "correct" it.
      return fakeCard(value, a, convKey);
    case "IBAN":
      // Country code kept, digits swapped, mod-97 key recomputed — same rationale.
      return fakeIban(value, a, convKey);
    default: {
      // An LLM/NER tag that MEANS an id family ("SSN", "SIRET", "PASSPORT"…)
      // still deserves a checksum-valid fake; fakeValidId gates on the mapped
      // category itself, so a quantity/date/health number never enters it.
      if (/\d/.test(value)) return fakeValidId(category, value, a, convKey) ?? fakeDigits(value, a, convKey);
      // Word count mirrors the real value (see the NAME case: separator replication).
      const words = value.trim().split(/\s+/);
      const first = pick(firstNamePool(words[0] || value), h);
      return words.length <= 1 ? first : `${first} ${pick(FAKE_LAST, rehash(h))}`;
    }
  }
}
