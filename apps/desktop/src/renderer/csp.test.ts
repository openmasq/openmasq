import { readFileSync, readdirSync, statSync } from "node:fs";
import { BRAND, brandUrl } from "@openmasq/branding";

import { supabaseCspEntries } from "../../scripts/brandIndexHtml";
import { ENVIRONMENTS } from "../environments";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The renderer's CSP is an egress ALLOW-list (rule 7), and nothing at compile time
 * links it to the origins the code actually calls. So the two drift apart silently, in
 * both directions, and neither direction shows up before runtime:
 *   • removing an origin still called → a blocked `fetch`, visible only in use;
 *   • keeping an origin nobody calls anymore → the allow-list widens on its own.
 * This file ties the two together. It was written while migrating the backend's origin from
 * one domain to its successor: the CSP allowed both, and nothing
 * would have flagged that one had been left off — nor that the wrong one had been removed.
 */
const ICI = new URL(".", import.meta.url).pathname;
// The SAME substitution as electron.vite.config.ts's `brandIndexHtml` plugin: we
// verify the CSP as the bundle serves it, brand tokens resolved. The Supabase
// token is resolved from the SAME table the code calls (`ENVIRONMENTS`, which reads
// the build env) — empty ⇒ no Supabase host allowed, and nothing to call either.
const HTML = readFileSync(join(ICI, "index.html"), "utf8")
  .replaceAll("%BRAND_NAME%", BRAND.name)
  .replaceAll("%BRAND_DOMAIN%", BRAND.domain)
  .replaceAll("%SUPABASE_CSP%", supabaseCspEntries(ENVIRONMENTS.production.supabaseUrl));

const CSP = /content="([^"]*Content-Security|[^"]*default-src[^"]*)"/.exec(HTML)?.[1] ?? HTML;

/** One directive of the CSP, as its list of sources. Throws when it is ABSENT — a
 *  directive that quietly disappeared is exactly the regression these tests exist for. */
function directive(nom: string): string[] {
  const bloc = new RegExp(`(?:^|;)\\s*${nom} ([^;"]+)`).exec(CSP);
  if (!bloc) throw new Error(`${nom} introuvable dans la CSP de index.html`);
  return bloc[1].trim().split(/\s+/);
}

const connectSrc = directive("connect-src");

/** `https://*.<domain>` covers `https://app.<domain>` — a wildcard is only worth one label. */
function autorisee(origine: string): boolean {
  return connectSrc.some((motif) => {
    if (motif === origine) return true;
    if (!motif.includes("*")) return false;
    const re = new RegExp("^" + motif.replace(/[.]/g, "\\.").replace(/\*/g, "[^./]+") + "$");
    return re.test(origine);
  });
}

function fichiersSources(dir: string): string[] {
  return readdirSync(dir).flatMap((nom) => {
    const chemin = join(dir, nom);
    if (statSync(chemin).isDirectory()) return fichiersSources(chemin);
    return /\.(ts|tsx)$/.test(nom) && !/\.test\.tsx?$/.test(nom) ? [chemin] : [];
  });
}

/** The origins the renderer calls: the ones still HARDCODED in the sources,
 *  PLUS the ones the code DERIVES from the brand at runtime (`src/environments` +
 *  the analytics relay from `appEnv.ts`) — since rule 9, these are the real list. */
const derivees = [
  ...Object.values(ENVIRONMENTS).flatMap((e) => [e.backend, e.admin, e.supabaseUrl, e.redactFn]),
  brandUrl("analytics"),
]
  // `supabaseUrl` can be EMPTY (project not supplied at build time): nothing to derive, and the
  // CSP then has no entry either — the two sides stay tied together.
  .filter(Boolean)
  .map((u) => new URL(u).origin);
const origines = [
  ...new Set([
    ...fichiersSources(join(ICI, "src")).flatMap((f) =>
      [...readFileSync(f, "utf8").matchAll(/https:\/\/[a-zA-Z0-9*.-]+\.[a-z]{2,}/g)].map(
        (m) => m[0],
      ),
    ),
    ...derivees,
  ]),
  // `.invalid` is a RESERVED TLD (RFC 2606): unreachable by definition, never an
  // origin to allow — it's `auth.ts`'s sentinel when no Supabase project
  // is supplied at build time (the app then runs without accounts, the client isn't called).
].filter((o) => !o.endsWith(".invalid"));

describe("CSP du renderer", () => {
  it("autorise chaque origine que le code appelle en dur", () => {
    expect(origines.length).toBeGreaterThan(0); // otherwise the test would pass vacuously
    expect(origines.filter((o) => !autorisee(o))).toEqual([]);
  });

  // A <form> submit is a NAVIGATION: neither connect-src nor default-src governs it, so
  // an injected form is an exfiltration channel that leaves every other directive
  // satisfied. The renderer submits no form anywhere — everything goes through fetch —
  // so the only correct value is 'none', and nothing else in the build would notice it
  // being dropped.
  it("interdit toute soumission de formulaire (form-action 'none')", () => {
    expect(directive("form-action")).toEqual(["'none'"]);
  });

  // img-src is the widest directive here, and a host added to it is a host that can be
  // pinged with a URL an injected reply chooses. This is a SNAPSHOT, not a rule: it does
  // not claim the list is minimal (narrowing it is a separate piece of work, pending a
  // check of which hosts are actually used) — it claims the list cannot GROW without
  // someone editing this line, i.e. without a review.
  it("épingle la liste EXACTE des hôtes d'images — elle ne peut pas s'élargir sans revue", () => {
    expect(directive("img-src")).toEqual([
      "'self'",
      "data:",
      "https://images.openai.com",
      "https://*.oaiusercontent.com",
      "https://*.oaistatic.com",
      "https://claude.ai",
      "https://*.anthropic.com",
      "https://*.googleusercontent.com",
      "https://*.gstatic.com",
      "https://*.google.com",
      "https://*.mistral.ai",
      "https://*.deepseek.com",
    ]);
    // Ni `blob:` ni joker d'hôte : `components/CLAUDE.md` en fait une invariante — toute
    // image construite à partir d'octets utilisateur/modèle est une `data:` URL.
    expect(directive("img-src")).not.toContain("blob:");
    expect(directive("img-src").some((s) => s === "https:" || s === "*")).toBe(false);
  });
});
