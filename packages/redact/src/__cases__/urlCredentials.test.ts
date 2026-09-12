import { describe, expect, it } from "vitest";
import { redact, pseudonymize, type Vault } from "../index";

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
    [
      "e-mail dans une query string",
      "Fiche : https://crm.acme.fr/c?email=jean.rebour@acme.fr",
      "jean.rebour@acme.fr",
    ],
    [
      "e-mail dans un mailto",
      "Écris via https://acme.fr/x?to=jean.rebour@acme.fr",
      "jean.rebour@acme.fr",
    ],
    [
      "téléphone dans une query string",
      "Appel : https://crm.acme.fr/contact?tel=0612345678",
      "0612345678",
    ],
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
  /* The « email fragment » guard tests an OVERLAP. A connection string
     itself manufactures an email span with its `password@host`, so much so that it
     overlapped that span and got dropped: it was the shorter fragment that
     left faked — and the database's USER, HOST and PORT stayed in clear
     in the text sent to the model. A fragment has no at-sign; a value that
     CONTAINS an address is a superset. Found by a bench scan comparing
     `redact()` (marker) and `pseudonymize()`: 3 values out of 2,336 were detected then
     sent in clear. */
  const DSN = "postgres://acme_ro:S3cr3t-Prod-2026@db-prod.internal:5432/app";

  it("redacted la chaîne entière, utilisateur et hôte compris", async () => {
    const vault: Record<string, string> = {};
    const { text } = await pseudonymize(`const DSN = "${DSN}";`, { vault });
    expect(text).not.toContain(DSN);
    expect(text).not.toContain("S3cr3t-Prod-2026");
    // ONE vault entry for ONE datum: the full string, reversible as-is.
    expect(Object.values(vault)).toEqual([DSN]);
  });

  it("…y compris échappée dans une charge JSON (le retour d'outil réel)", async () => {
    const payload = `{"extra":{"lines":"const DSN = \\"${DSN}\\";"}}`;
    const { text } = await pseudonymize(payload, { vault: {} });
    expect(text).not.toContain("S3cr3t-Prod-2026");
  });

  it("la garde garde son objet : un fragment SANS arrobase confiné à une adresse est écarté", async () => {
    // « gmail » alone, tagged ORG by a NER, must not be redacted: it would only replace
    // the domain and leave the local part — hence the identity — in clear.
    const complete = async () => JSON.stringify([{ value: "gmail", category: "ORG" }]);
    const { text } = await pseudonymize("écris à laura.bardell@gmail.com", { vault: {}, complete });
    expect(text).not.toContain("laura.bardell@gmail.com"); // the WHOLE address is faked
    expect(text).not.toMatch(/laura\.bardell@[a-z]/); // …and never only its domain
  });

  it("le sur-ensemble est STRICT : l'adresse re-détectée sous une autre étiquette reste couverte par « E-mail désactivé »", async () => {
    // A « Contact : » field causes the SAME address to be detected a second time, under a
    // category the user hasn't disabled. Equal to the span, it remains a
    // fragment — letting it through would resurface the address despite the setting.
    // The vault is mutated IN PLACE (the result doesn't return a copy of it) — keep your
    // own reference, or the assertion inspects `undefined` and tests nothing.
    const vault: Vault = {};
    const { text } = await pseudonymize("Contact : jean@exemple.fr", {
      vault,
      disabledKinds: ["email"],
    });
    expect(text).toContain("jean@exemple.fr");
    expect(Object.values(vault)).not.toContain("jean@exemple.fr");
  });
});

// A documentation PLACEHOLDER is not a credential: a coding agent walking a repo reads
// `postgres://user:pass@host` in a README and a compaction summary constantly, and faking it
// into a name (`… -> Clotilde`) corrupts the very text the agent reasons on. The discriminant
// is the host: a real connection points at an FQDN or an IP, so a dot-less host beside a
// placeholder password is an example. A real DSN stays masked. `rules.connection.ts`.
describe("the connection-string rule skips a placeholder and masks a real DSN", () => {
  const placeholders = [
    "postgres://user:pass@host",
    "mongodb://user:pass@host",
    "mongodb+srv://user:pass@cluster",
    "redis://admin:changeme@cache",
    "postgres://user:secret@host",
    "mysql://root:root@localhost",
  ];
  for (const p of placeholders)
    it(`keeps ${p}`, async () => {
      const { text, matches } = await pseudonymize("connect with " + p, { vault: {} });
      expect(matches.some((m) => m.type === "connection_string")).toBe(false);
      expect(text).toContain(p);
    });

  // A real DSN — real host, real password — is masked. The category label is not the point
  // (an aggressive secret rule may claim it before connection_string); the value leaving is.
  const real = [
    "postgres://acme_ro:S3cr3t-Prod-2026@db-prod.internal:5432/app",
    "mongodb+srv://svc:Xk9pQ2mn@cluster0.ab12.mongodb.net/prod",
    "redis://default:AJ8kd0Lm2@10.0.4.7:6379",
  ];
  for (const dsn of real)
    it(`masks ${dsn.slice(0, 24)}`, async () => {
      const { text } = await pseudonymize("DSN " + dsn, { vault: {} });
      expect(text).not.toContain(dsn);
    });
});

// An SRI / npm-lockfile integrity hash is a PUBLIC content checksum, never a secret — the
// algorithm name is its prefix. The token rule renamed it and corrupted the lockfile the agent
// reads (`codeTerms.ts` `isIntegrityHash`). A real key of the same base64 shape still masks.
describe("an integrity hash is not a secret", () => {
  const hashes = [
    "sha512-9f8e7d6c5b4a3f2e1d0c9b8a7f6e5d4c3b2a1908f7e6d5c4b3a2910ffeeddcc",
    "sha384-oqVuAfXRKap7fdgcXWz3iyb2K7uMxO1a9pQ",
    "sha256-abcDEF123456ghijklMNOP789",
  ];
  for (const h of hashes)
    it(`keeps ${h.slice(0, 12)}`, () => {
      expect(redact(`"integrity":"${h}"`).text).toContain(h);
    });
  it("still masks a bare base64 token with no algorithm prefix", () => {
    const clean = "AbcDEfGh123456789jklMNOpqRStuVWxyz0";
    expect(redact(`token ${clean}`).text).not.toContain(clean);
  });
});
