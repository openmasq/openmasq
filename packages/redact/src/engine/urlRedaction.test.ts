import { describe, it, expect } from "vitest";
import { redact, pseudonymize, unredact } from "../index";

/**
 * La catégorie « Adresses web (URL) » a DEUX comportements, et c'est voulu : c'est une
 * seule question posée à l'utilisateur (« une URL est-elle une donnée sensible ? »), donc
 * une seule bascule.
 *
 *  • ÉTEINTE (défaut) — l'adresse reste lisible, ET la porte de suppression empêche qu'une
 *    sous-partie soit masquée par erreur (nom de fichier d'image, jeton de cache d'une page
 *    consultée : le bruit qu'un audit avait signalé comme « néfaste »).
 *  • ACTIVE (à partir de Renforcé) — l'adresse entière est masquée.
 *
 * ⚠️ Avant, la bascule n'avait que le premier comportement : le libellé promettait
 * « Adresses web complètes » et AUCUNE règle du moteur ne redact une URL. L'activer ne
 * faisait que lever la protection — donc empirait le résultat, ce que le testeur avait
 * observé sans pouvoir l'expliquer (« et en plus "intranet" se fait redact »).
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
    expect(out).toContain("app.kelm.io"); // l'adresse, elle, reste
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
    expect(unredact(out.text, vault)).toBe(src); // le coffre rend l'adresse réelle
  });

  it("ne rend PAS un faux de forme NOM — « allez sur Marc Charvet » serait illisible", async () => {
    const vault: Record<string, string> = {};
    const out = await pseudonymize("Va sur www.notre-intranet-kelm.fr", { vault, ...ON });
    expect(out.text).toMatch(/\.\w+$/); // ça reste une adresse
  });
});
