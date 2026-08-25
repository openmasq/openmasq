import { describe, expect, it } from "vitest";
import { redact, pseudonymize, type Vault } from "./index";

// Audit H-3: the `url`-off gate used to drop EVERY match inside a URL span,
// including secrets/api keys — so a credential embedded in a query string
// (`?token=sk_live_…`, a presigned `?X-Amz-Signature=…`) leaked in clear to the
// model/provider. Credentials must stay redacted regardless of the url gate.
describe("credentials embedded in a URL are still redacted (url gate off)", () => {
  const url = "download https://api.example.com/v1/data?token=sk_live_4eC39HqLyjWDarjtT1zdp7dc&x=1";

  it("redact() redacted the key even though it sits inside a URL", () => {
    const { text } = redact(url); // url category OFF by default
    expect(text).not.toContain("sk_live_4eC39HqLyjWDarjtT1zdp7dc");
  });

  it("pseudonymize() fakes the key even though it sits inside a URL", async () => {
    const vault: Vault = {};
    const { text } = await pseudonymize(url, { vault });
    expect(text).not.toContain("sk_live_4eC39HqLyjWDarjtT1zdp7dc");
  });
});

// Audit F2: the same gate ALSO dropped an e-mail / a phone number confined to a URL — the
// `?email=`, `?tel=` and `mailto:` a browsed page, a CRM deep link or a tool result carries
// constantly. Nothing in the URL noise the gate exists to suppress (asset filenames,
// cache-busters, CDN ids) has the shape of an address or of a validated dialable number,
// so exempting them costs no precision and closes a real leak.
describe("contact identity embedded in a URL is still redacted (url gate off)", () => {
  const cases: Array<[string, string, string]> = [
    ["e-mail dans une query string", "Fiche : https://crm.acme.fr/c?email=jean.rebour@acme.fr", "jean.rebour@acme.fr"],
    ["e-mail dans un mailto", "Écris via https://acme.fr/x?to=jean.rebour@acme.fr", "jean.rebour@acme.fr"],
    ["téléphone dans une query string", "Appel : https://crm.acme.fr/contact?tel=0612345678", "0612345678"],
  ];

  for (const [label, input, secret] of cases) {
    it(`redact() — ${label}`, () => {
      expect(redact(input).text).not.toContain(secret);
    });

    it(`pseudonymize() — ${label}`, async () => {
      const vault: Vault = {};
      // The app's real default: `url` OFF, so the suppression gate is ACTIVE.
      const { text } = await pseudonymize(input, { vault, disabledKinds: ["url"] });
      expect(text).not.toContain(secret);
    });
  }

  it("still suppresses genuine URL STRUCTURE — the gate keeps its job", async () => {
    // An asset filename is what the gate exists for: it must stay in clear, or a browsed
    // page turns into a wall of redaction.
    const input = "vu sur https://cdn.example.com/1783921-gettyimages-photo-large.jpeg";
    const { text } = await pseudonymize(input, { vault: {}, disabledKinds: ["url"] });
    expect(text).toContain("1783921-gettyimages-photo-large.jpeg");
  });
});

describe("chaîne de connexion : le span ENTIER, jamais son fragment e-mail", () => {
  /* La garde « fragment d'e-mail » teste un CHEVAUCHEMENT. Une chaîne de connexion
     fabrique elle-même un span e-mail avec son `motdepasse@hôte`, si bien qu'elle
     chevauchait ce span et se faisait écarter : c'est le fragment, plus court, qui
     repartait faussé — et l'UTILISATEUR, l'HÔTE et le PORT de la base restaient en clair
     dans le texte envoyé au modèle. Un fragment n'a pas d'arrobase ; une valeur qui
     CONTIENT une adresse est un sur-ensemble. Trouvé par un balayage du banc comparant
     `redact()` (marqueur) et `pseudonymize()` : 3 valeurs sur 2 336 étaient détectées puis
     envoyées en clair. */
  const DSN = "postgres://acme_ro:S3cr3t-Prod-2026@db-prod.internal:5432/app";

  it("redacted la chaîne entière, utilisateur et hôte compris", async () => {
    const vault: Record<string, string> = {};
    const { text } = await pseudonymize(`const DSN = "${DSN}";`, { vault });
    expect(text).not.toContain(DSN);
    expect(text).not.toContain("S3cr3t-Prod-2026");
    // UNE entrée de coffre pour UNE donnée : la chaîne complète, réversible telle quelle.
    expect(Object.values(vault)).toEqual([DSN]);
  });

  it("…y compris échappée dans une charge JSON (le retour d'outil réel)", async () => {
    const payload = `{"extra":{"lines":"const DSN = \\"${DSN}\\";"}}`;
    const { text } = await pseudonymize(payload, { vault: {} });
    expect(text).not.toContain("S3cr3t-Prod-2026");
  });

  it("la garde garde son objet : un fragment SANS arrobase confiné à une adresse est écarté", async () => {
    // « gmail » seul, tagué ORG par un NER, ne doit pas être redacted : il ne remplacerait
    // que le domaine et laisserait la partie locale — donc l'identité — en clair.
    const complete = async () => JSON.stringify([{ value: "gmail", category: "ORG" }]);
    const { text } = await pseudonymize("écris à laura.bardell@gmail.com", { vault: {}, complete });
    expect(text).not.toContain("laura.bardell@gmail.com"); // l'adresse ENTIÈRE est faussée
    expect(text).not.toMatch(/laura\.bardell@[a-z]/); // …et jamais seulement son domaine
  });

  it("le sur-ensemble est STRICT : l'adresse re-détectée sous une autre étiquette reste couverte par « E-mail désactivé »", async () => {
    // Un champ « Contact : » fait détecter la MÊME adresse une seconde fois, sous une
    // catégorie que l'utilisateur n'a pas désactivée. Égale au span, elle reste un
    // fragment — la laisser passer referait surface à l'adresse malgré le réglage.
    // Le vault est muté EN PLACE (le résultat n'en retourne pas de copie) — garder sa
    // propre référence, sinon l'assertion inspecte `undefined` et ne teste rien.
    const vault: Vault = {};
    const { text } = await pseudonymize("Contact : jean@exemple.fr", {
      vault,
      disabledKinds: ["email"],
    });
    expect(text).toContain("jean@exemple.fr");
    expect(Object.values(vault)).not.toContain("jean@exemple.fr");
  });
});
