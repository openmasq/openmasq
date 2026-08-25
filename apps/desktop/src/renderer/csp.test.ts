import { readFileSync, readdirSync, statSync } from "node:fs";
import { BRAND, brandUrl } from "@openmasq/branding";

import { supabaseCspEntries } from "../../scripts/brandIndexHtml";
import { ENVIRONMENTS } from "../environments";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * La CSP du renderer est une ALLOW-list d'egress (règle 7), et rien à la compilation ne la
 * relie aux origines que le code appelle vraiment. Les deux dérivent donc en silence, dans
 * les deux sens, et aucun des deux sens ne se voit avant l'exécution :
 *   • retirer une origine encore appelée → un `fetch` bloqué, visible seulement à l'usage ;
 *   • garder une origine que plus personne n'appelle → l'allow-list s'élargit toute seule.
 * Ce fichier attache l'une à l'autre. Il a été écrit en migrant l'origine du backend de
 * l'ancien domaine (`tchin.co`) vers le domaine actuel : la CSP autorisait les deux, et rien
 * n'aurait signalé qu'on avait oublié d'en retirer une — ni qu'on avait retiré la mauvaise.
 */
const ICI = new URL(".", import.meta.url).pathname;
// La MÊME substitution que le plugin `brandIndexHtml` d'electron.vite.config.ts : on
// vérifie la CSP telle que le bundle la sert, jetons de marque résolus. Le jeton
// Supabase est résolu depuis la MÊME table que le code appelle (`ENVIRONMENTS`, qui lit
// l'env de build) — vide ⇒ aucun hôte Supabase autorisé, et rien à appeler non plus.
const HTML = readFileSync(join(ICI, "index.html"), "utf8")
  .replaceAll("%BRAND_NAME%", BRAND.name)
  .replaceAll("%BRAND_DOMAIN%", BRAND.domain)
  .replaceAll("%SUPABASE_CSP%", supabaseCspEntries(ENVIRONMENTS.production.supabaseUrl));

const connectSrc = (() => {
  const csp = /content="([^"]*Content-Security|[^"]*default-src[^"]*)"/.exec(HTML)?.[1] ?? HTML;
  const bloc = /connect-src ([^;]+);/.exec(csp);
  if (!bloc) throw new Error("connect-src introuvable dans la CSP de index.html");
  return bloc[1].trim().split(/\s+/);
})();

/** `https://*.<domaine>` couvre `https://app.<domaine>` — un joker ne vaut qu'un label. */
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

/** Les origines que le renderer appelle : celles encore écrites EN DUR dans les sources,
 *  PLUS celles que le code DÉRIVE de la marque à l'exécution (`src/environments` +
 *  le relais analytics d'`appEnv.ts`) — depuis la règle 9, ce sont elles la vraie liste. */
const derivees = [
  ...Object.values(ENVIRONMENTS).flatMap((e) => [e.backend, e.admin, e.supabaseUrl, e.redactFn]),
  brandUrl("analytics"),
]
  // `supabaseUrl` peut être VIDE (projet non fourni au build) : rien à dériver, et la
  // CSP n'a alors pas non plus l'entrée — les deux côtés restent attachés.
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
  // `.invalid` est un TLD RÉSERVÉ (RFC 2606) : par définition injoignable, jamais une
  // origine à autoriser — c'est la sentinelle d'`auth.ts` quand aucun projet Supabase
  // n'est fourni au build (l'app tourne alors sans comptes, le client n'est pas appelé).
].filter((o) => !o.endsWith(".invalid"));

describe("CSP du renderer", () => {
  it("autorise chaque origine que le code appelle en dur", () => {
    expect(origines.length).toBeGreaterThan(0); // sinon le test passerait à vide
    expect(origines.filter((o) => !autorisee(o))).toEqual([]);
  });

  it("ne garde aucune origine héritée : l'app est entièrement sur le domaine de la marque", () => {
    // L'ancien domaine est DÉTACHÉ (plus aucun hôte `tchin.co` ne sert). Rien ne doit
    // donc le viser ni l'autoriser : une allow-list qui garde une entrée morte s'élargit
    // pour rien, et le jour où la ligne revient, c'est ici qu'elle se voit.
    expect(connectSrc.filter((m) => m.includes("tchin.co"))).toEqual([]);
    expect(origines.filter((o) => o.includes("tchin.co"))).toEqual([]);
  });
});
