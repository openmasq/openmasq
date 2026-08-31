import { describe, it, expect } from "vitest";
import { redact, pseudonymize, unredact } from "../index";

/**
 * The « Web addresses (URL) » category has TWO behaviours, and that's deliberate: it's a
 * single question asked of the user (« is a URL sensitive data? »), hence
 * a single toggle.
 *
 *  • OFF (default) — the address stays readable, AND the suppression gate prevents a
 *    sub-part from being masked by mistake (an image filename, a cache token of a page
 *    visited: the noise an audit had flagged as « harmful »).
 *  • ON (from Enhanced up) — the whole address is masked.
 *
 * ⚠️ Before, the toggle only had the first behaviour: the label promised
 * « Full web addresses » and NO engine rule redacted a URL. Turning it on only
 * lifted protection — so it made the result worse, which the tester had
 * observed without being able to explain it (« and on top of that "intranet" gets redacted »).
 */
const OFF = { disabledKinds: ["url"] };
const ON = { disabledKinds: [] as string[] };

describe("url ÉTEINTE — le défaut, pensé pour la navigation", () => {
  it.each([
    "Va sur www.notre-intranet-kelm.fr",
    "Doc sur https://fr.wikipedia.org/wiki/Judo",
  ])("laisse l'adresse lisible : %s", (t) => {
    expect(redact(t, OFF).text).toBe(t);
  });

  it("masque quand même une CLÉ portée par l'URL (exemption crédential, audit H-3)", () => {
    const out = redact("Lien : https://app.kelm.io?token=abc123secret", OFF).text;
    expect(out).not.toContain("abc123secret");
    expect(out).toContain("app.kelm.io"); // the address itself remains
  });
});

describe("url ACTIVE — à partir du niveau Renforcé", () => {
  it.each([
    "Va sur www.notre-intranet-kelm.fr",
    "Serveur : https://srv-prod-01.kelm.local/admin",
    "Lien : https://app.kelm.io?token=abc123secret",
  ])("masque l'adresse entière : %s", (t) => {
    const r = redact(t, ON);
    expect(r.matches.some((m) => m.type === "url")).toBe(true);
    expect(r.text).toContain("[REDACTED_URL_");
  });

  it("emporte le jeton AVEC l'adresse — une seule entrée de coffre, pas deux", () => {
    const r = redact("Lien : https://app.kelm.io?token=abc123secret", ON);
    expect(r.text).not.toContain("abc123secret");
    expect(r.matches.filter((m) => m.value.includes("abc123secret"))).toHaveLength(1);
  });
});

describe("le faux d'URL — même nature, et réversible", () => {
  it("garde la FORME (schéma, profondeur, clés de requête) et rend l'original", async () => {
    const vault: Record<string, string> = {};
    const src = "Lien : https://app.kelm.io?token=abc123secret";
    const out = await pseudonymize(src, { vault, ...ON });
    expect(out.text).toMatch(/^Lien : https:\/\/\w+\.\w+\.\w+\?token=\w+$/);
    expect(out.text).not.toContain("kelm");
    expect(unredact(out.text, vault)).toBe(src); // the vault restores the real address
  });

  it("ne rend PAS un faux de forme NOM — « allez sur Marc Charvet » serait illisible", async () => {
    const vault: Record<string, string> = {};
    const out = await pseudonymize("Va sur www.notre-intranet-kelm.fr", { vault, ...ON });
    expect(out.text).toMatch(/\.\w+$/); // it stays an address
  });
});
