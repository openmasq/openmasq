import type { Vault } from "@openmasq/redact";

// The FAKE-DERIVED-DOMAIN guard (redaction × navigation).
//
// The model only ever holds fakes (root rule 11), so when it is asked to "visit X's
// website" it can only GUESS a URL from the fake: company "Karl Studio" redacted as
// "Norvik Group" becomes `https://norvikgroup.fr` — a REAL domain that has nothing to do
// with the user's company. `unredactArgs` cannot help: it restores a fake's exact and
// URL-encoded forms, not a lowercased/de-spaced MUTATION embedded in a hostname. The
// request would go out to an unrelated real server and the model would then reason over
// the wrong site with full confidence.
//
// So the loop refuses such a navigation and STEERS the model to a web search instead —
// the search query carries the exact fake, which the wire un-redaction DOES restore, so
// searching is the reliable path to the real site. Sibling of `browserPolicy.ts` (the
// nav-gate family, rule 10); pure and pinned by `browserNavFake.test.ts`.

/** Lowercase, strip diacritics, keep [a-z0-9] — the shape a name takes in a hostname. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

/** Below this, a normalized fake is too short to claim a hostname match ("Le Mans" →
 *  "lemans" is 6; a 4-char token would flag half the web). */
const MIN_FAKE_LEN = 6;

/**
 * Does this URL's HOSTNAME look built from a vault FAKE? Returns the offending fake, or
 * null. Scan the WIRE url (exact fakes already un-redacted — what survives is the
 * mutated form). Only the hostname: a mutated fake in a path 404s harmlessly, a mutated
 * fake as the HOST ships the request to an unrelated real server.
 *
 * A hostname matching the REAL value is never flagged (that IS the right site), and a
 * hostname matching both forms (fake ⊂ real or vice-versa) is ambiguous → not flagged;
 * the nav-exfil scan still runs after this.
 */
export function fakeDerivedNavHost(url: string, vault: Vault): { fake: string; host: string } | null {
  if (!url) return null;
  let host: string;
  try {
    const u = new URL(url);
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    host = u.hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
  const nh = normalize(host);
  if (!nh) return null;
  for (const [fake, real] of Object.entries(vault)) {
    const nf = normalize(fake);
    if (nf.length < MIN_FAKE_LEN) continue;
    if (!nh.includes(nf)) continue;
    const nr = normalize(String(real ?? ""));
    if (nr && nh.includes(nr)) continue; // also matches the REAL name → ambiguous, allow
    return { fake, host };
  }
  return null;
}
