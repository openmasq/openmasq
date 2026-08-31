import { describe, expect, it } from "vitest";
import { detectLabeledFields, detectAccountNumbers, detectFiscalNumbers } from "./contextFields";

/** Helper: map of category → the values detected for it. */
function byCategory(text: string): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const d of detectLabeledFields(text)) (out[d.category] ??= []).push(d.value);
  return out;
}

describe("detectLabeledFields — tabular header-annotated rows", () => {
  it("splits a ` | `-joined row into one clean value per field", () => {
    const row = "nom: Rebour | num_secu: 172051873204152 | ville: Lyon";
    const g = byCategory(row);
    expect(g.NAME).toEqual(["Rebour"]);
    expect(g.CITY).toEqual(["Lyon"]);
    // "secu" root matches "num_secu" (the "_" isn't a letter boundary), typed ID,
    // and the value is cut at ` | ` — not the rest of the line.
    expect(g.ID).toEqual(["172051873204152"]);
  });

  it("types the new CSV-style headers to their category (value kept verbatim)", () => {
    const g = byCategory(
      [
        "iban: FR7630006000011234567890189",
        "carte bancaire: 4970100000000055",
        "code postal: 69003",
        "date de naissance: 12/04/1985",
        "matricule: 900123",
        "e-mail: jean@example.fr",
      ].join("\n"),
    );
    expect(g.IBAN).toContain("FR7630006000011234567890189");
    expect(g.CARD).toContain("4970100000000055");
    expect(g.POSTAL_CODE).toContain("69003");
    expect(g.DOB).toContain("12/04/1985");
    expect(g.ID).toContain("900123");
    expect(g.EMAIL).toContain("jean@example.fr");
  });

  it("still handles the classic single-field form (unchanged behaviour)", () => {
    const g = byCategory("Nom : John Welby\nAdresse : 12 rue de la Paix");
    expect(g.NAME).toEqual(["John Welby"]);
    expect(g.ADDRESS).toEqual(["12 rue de la Paix"]);
  });

  it("types a pseudo / login / username field as USERNAME (not NAME/ID)", () => {
    const g = byCategory(
      ["Pseudo : drovaksinatra", "username: carbonizedbeats", "login: zarv_ko"].join("\n"),
    );
    expect(g.USERNAME).toEqual(["drovaksinatra", "carbonizedbeats", "zarv_ko"]);
    expect(g.NAME).toBeUndefined();
  });

  it("types the DE/ES/IT/PT/NL/PL username labels too (a login form is multilingual)", () => {
    const g = byCategory(
      [
        "Benutzername: falk.riemann9",
        "nombre de usuario: brasa_moray",
        "nome utente: girasole_ombra",
        "nome de utilizador: xerath_lusco",
        "gebruikersnaam: ravelijn.moss",
        "nazwa użytkownika: jaskolka_bem",
      ].join("\n"),
    );
    expect(g.USERNAME).toEqual([
      "falk.riemann9", "brasa_moray", "girasole_ombra",
      "xerath_lusco", "ravelijn.moss", "jaskolka_bem",
    ]);
  });

  it("« mot de passe applicatif/admin » — the observed compounds reach SECRET", () => {
    const g = byCategory(
      ["mot de passe applicatif : corbeau-madras-812", "mot de passe admin : Zt7!rebond"].join("\n"),
    );
    expect(g.SECRET).toEqual(["corbeau-madras-812", "Zt7!rebond"]);
  });

  it("« = » is a label delimiter (config idiom); `==` a comparison never is", () => {
    const g = byCategory("pseudo = kaelith92\ncode postal = 44000");
    expect(g.USERNAME).toEqual(["kaelith92"]);
    expect(g.POSTAL_CODE).toEqual(["44000"]);
    const cmp = byCategory("if (pseudo == autreValeur) return;");
    expect(cmp.USERNAME).toBeUndefined();
  });
});

describe("detectLabeledFields — precision (no prose over-detection)", () => {
  it("does not fire on generic words used in prose (no field colon)", () => {
    expect(detectLabeledFields("On a mangé à la carte hier soir.")).toEqual([]);
    expect(detectLabeledFields("La sécurité de l'application est importante.")).toEqual([]);
  });

  it("does not match a term embedded inside a longer word before a colon", () => {
    // "génie:" must NOT match the ID term "nie" (preceded by a letter → boundary).
    expect(detectLabeledFields("génie: créatif")).toEqual([]);
  });

  it("drops placeholder-ish values", () => {
    expect(detectLabeledFields("nom: N/A | email: -")).toEqual([]);
  });
});

describe("detectAccountNumbers — labeled account numbers (digit-anchored)", () => {
  const val = (text: string) => detectAccountNumbers(text).map((d) => d.value);

  it("catches account numbers with varied labels and separators (no colon needed)", () => {
    expect(val("Numéro de compte : 12345678901")).toEqual(["12345678901"]);
    expect(val("N° de compte : 12345678901")).toEqual(["12345678901"]);
    expect(val("Compte : 12345678901")).toEqual(["12345678901"]);
    expect(val("Compte n° 12345678901")).toEqual(["12345678901"]);
    expect(val("Compte courant 12345678901")).toEqual(["12345678901"]);
    expect(val("Mon compte 12345678901")).toEqual(["12345678901"]);
    expect(val("account number: 12345678901")).toEqual(["12345678901"]);
    expect(val("Compte 12 345 678 901")).toEqual(["12 345 678 901"]); // spaces kept verbatim
  });

  it("is category ID (→ national_id, same-shape digit fake)", () => {
    expect(detectAccountNumbers("Compte : 12345678901")).toEqual([
      { value: "12345678901", category: "ID" },
    ]);
  });

  it("does NOT over-detect prose, report titles, amounts or bare quantities", () => {
    expect(val("je me rends compte que c'est 12345678")).toEqual([]);
    expect(val("compte tenu de 12345678 clients")).toEqual([]);
    expect(val("compte-rendu de la réunion 2024")).toEqual([]);
    expect(val("Solde du compte : 1234.56 €")).toEqual([]); // money amount
    expect(val("Il y a 12345678 habitants")).toEqual([]); // no account label
  });
});

describe("detectFiscalNumbers — labeled tax numbers (digit-anchored)", () => {
  const val = (text: string) => detectFiscalNumbers(text).map((d) => d.value);

  it("catches tax-number label variants the colon-only detector missed", () => {
    expect(val("Numéro fiscal : 1234567890123")).toEqual(["1234567890123"]);
    expect(val("N° fiscal : 1234567890123")).toEqual(["1234567890123"]);
    expect(val("Numéro fiscal de référence : 1234567890123")).toEqual(["1234567890123"]);
    expect(val("Identifiant fiscal : 1234567890123")).toEqual(["1234567890123"]);
    expect(val("Numéro SPI : 1234567890123")).toEqual(["1234567890123"]);
    expect(val("Référence fiscale 1234567890123")).toEqual(["1234567890123"]); // no colon
    expect(val("tax id: 1234567890123")).toEqual(["1234567890123"]);
    expect(val("Numéro fiscal 12 34 567 890 123")).toEqual(["12 34 567 890 123"]);
  });

  it("is category ID (→ national_id)", () => {
    expect(detectFiscalNumbers("Numéro fiscal : 1234567890123")).toEqual([
      { value: "1234567890123", category: "ID" },
    ]);
  });

  it("does NOT match 'fiscal' without an id starter (année/politique/exercice)", () => {
    expect(val("année fiscale 2024")).toEqual([]);
    expect(val("politique fiscale 2023")).toEqual([]);
    expect(val("exercice fiscal 2023-2024")).toEqual([]);
    expect(val("la réforme fiscale de 2025")).toEqual([]);
  });
});

describe("detectLabeledFields — a Commune 'CP Ville' is a PLACE, not a bare CITY", () => {
  it("emits PLACE for a 'code postal + ville' commune value (postal kept coherent)", () => {
    const g = byCategory("Commune : 92110 CLICHY");
    expect(g.PLACE).toEqual(["92110 CLICHY"]); // faked as CP+city together, not a bare city
    expect(g.CITY).toBeUndefined();
  });
  it("keeps a bare city value as CITY (no postal → not a PLACE)", () => {
    const g = byCategory("Ville : Lyon");
    expect(g.CITY).toEqual(["Lyon"]);
    expect(g.PLACE).toBeUndefined();
  });
});

describe("detectLabeledFields — identity-document labels (plural, parenthetical, OCR noise)", () => {
  it("matches the CNI/passport wording « Prénom(s) : » and its plural", () => {
    expect(byCategory("Prénom(s) : JULIEN LOUIS").NAME).toEqual(["JULIEN LOUIS"]);
    expect(byCategory("Prénoms : Julien Louis").NAME).toEqual(["Julien Louis"]);
    expect(byCategory("Nom(s) : MORVAN").NAME).toEqual(["MORVAN"]);
  });

  it("REGRESSION: OCR that drops the opening paren still matches (« Prénomis): »)", () => {
    // The exact reported leak: bad OCR of « Prénom(s) : » left the value in clear.
    expect(byCategory("Prénomis): JULIEN LOUIS").NAME).toEqual(["JULIEN LOUIS"]);
  });

  it("covers the état-civil labels (nom d'usage, nom de naissance, lieu de naissance)", () => {
    expect(byCategory("Nom d'usage : MORVAN").NAME).toEqual(["MORVAN"]);
    expect(byCategory("Nom de naissance : SAVARY").NAME).toEqual(["SAVARY"]);
    expect(byCategory("Lieu de naissance : LYON").CITY).toEqual(["LYON"]);
  });

  it("a term INSIDE parens is an annotation, not a label (Mémoire injection format)", () => {
    // "X (organisation) : Y" annotates X — the orphan-`)` branch requires ≥1 letter
    // glued to the term, so a bare `term)` can never read as a label.
    expect(byCategory("Karl Studio (organisation) : devis Q3 accepté").ORG).toBeUndefined();
    expect(byCategory("Jean (contact) : parti déjeuner").NAME).toBeUndefined();
  });

  it("does NOT over-match a longer word sharing a label prefix (paren suffix needs ')')", () => {
    // The suffix group requires a closing ")" — a bare letters-run must never turn a
    // longer word into a `nom`/`tel` label. ("nombre" itself IS a term — Spanish for
    // name — so it's not usable as the negative here; "nommage"/"tellement" are.)
    expect(byCategory("Nombre de pages : 12").NAME).toBeUndefined();
    expect(byCategory("nommage : interne").NAME ?? []).not.toContain("interne");
    expect(byCategory("tellement : vrai").PHONE).toBeUndefined();
  });

  it("REGRESSION: a detached word+`)` after the term is NOT a label (« tel quel) : »)", () => {
    // The Mémoire header ends « …sans le réciter tel quel) :\n- … » — with the
    // orphan-`)` branch allowed a leading space, "tel quel)" read as a PHONE label
    // and the WHOLE NEXT LINE was vaulted as its "value" (the memory-injection leak).
    const block =
      "Mémoire de l'utilisateur (contexte durable, à utiliser sans le réciter tel quel) :\n" +
      "- Zorvia (organisation) : Zorvia est une organisation a but non lucratif";
    expect(detectLabeledFields(block)).toEqual([]);
  });

  it("a colon at end-of-line never captures the NEXT line as its value", () => {
    expect(byCategory("Téléphone :\nJean viendra demain").PHONE).toBeUndefined();
    // Same-line value still detected as before.
    expect(byCategory("Téléphone : 06 12 34 56 78").PHONE).toEqual(["06 12 34 56 78"]);
  });

  it("a numeric-kind field with a digitless value is prose, not the value", () => {
    expect(byCategory("téléphone : indisponible pour le moment").PHONE).toBeUndefined();
    expect(byCategory("iban : sera communiqué plus tard").IBAN).toBeUndefined();
    // Text kinds are unaffected — a NAME value has no digit requirement.
    expect(byCategory("Nom : Rebour").NAME).toEqual(["Rebour"]);
  });
});

describe("detectLabeledFields — MCP tool metadata is code, not a person (overredaction)", () => {
  it("skips a NAME value that is a CODE IDENTIFIER (kebab 3+, underscore, camelCase)", () => {
    // The reported PostHog case: tool descriptions are YAML, and `name: read-data-schema`
    // read as a multi-word NAME handed each fragment its own alias ("data"→"lucas"),
    // redacting every occurrence conversation-wide.
    const yaml = [
      "name: read-data-schema",
      "name: query-session-recordings-list",
      "name: fetch-user-invoices", // non-generic words — pins CODE_IDENT alone
      "name: create_issue", // underscore
      "name: getUserById", // camelCase starting lowercase
    ].join("\n");
    expect(byCategory(yaml).NAME).toBeUndefined();
  });

  it("still detects a real person in a name field (Mc casing, lowercase 2-segment kebab)", () => {
    expect(byCategory("name: John Welby").NAME).toEqual(["John Welby"]);
    // Starts UPPERCASE — the camel gate must not eat Mc/Di surnames.
    expect(byCategory("name: McDonald").NAME).toEqual(["McDonald"]);
    // The conservative boundary: a lowercase 2-segment kebab stays a name.
    expect(byCategory("Nom : jean-rebour").NAME).toEqual(["jean-rebour"]);
  });

  it("a value whose EVERY word is generic is dropped whatever the label", () => {
    expect(byCategory("Nom : Read data schema").NAME).toBeUndefined();
    expect(byCategory("company: query trends").ORG).toBeUndefined();
  });
});

describe("detectLabeledFields — dotted leaders and double-label lines", () => {
  it("a ≥4-dot form leader works like a colon; a 3-dot prose ellipsis never does", () => {
    const v = detectLabeledFields("Code postal ......... 44000\nVille ................ NANTES").map((d) => d.value);
    expect(v).toEqual(expect.arrayContaining(["44000", "NANTES"]));
    expect(detectLabeledFields("Contact... voir plus bas")).toEqual([]);
  });
  it("a second 'N° xxx :' label on the SAME line cuts the first value", () => {
    const v = detectLabeledFields("Nom et prénom : REBOUR Jean N° sécu : 165031874259690");
    expect(v.map((d) => d.value)).toContain("REBOUR Jean");
    // the composite must NOT ride through (it never re-applies + aliases "sécu")
    expect(v.every((d) => !d.value.includes("sécu"))).toBe(true);
  });
});

describe("la forme SÉRIALISÉE — JSON / YAML / TOML", () => {
  // An API payload or a log line is an ordinary thing to paste into a
  // chat (« why is this request failing? ») and it is DENSE with personal data.
  // The inline pass requires the label glued to its colon; a JSON key carries a
  // closing quote between the two, so the whole record was going out IN CLEAR.
  it("redacted un enregistrement JSON champ par champ", () => {
    const byCat = Object.fromEntries(
      detectLabeledFields('{"nom":"Vernaux","prenom":"Élodie","ville":"Blagnac"}').map((d) => [
        d.value,
        d.category,
      ]),
    );
    expect(byCat["Vernaux"]).toBe("NAME");
    expect(byCat["Élodie"]).toBe("NAME");
    expect(byCat["Blagnac"]).toBe("CITY");
  });

  it("les guillemets de la valeur ne sont JAMAIS coffrés avec elle", () => {
    // Otherwise the fake replaces the document's punctuation and the line is no longer valid YAML.
    const values = detectLabeledFields('owner:\n  name: "Thibault Chandrel"').map((d) => d.value);
    expect(values).toContain("Thibault Chandrel");
    expect(values.some((v) => v.includes('"'))).toBe(false);
  });

  it("une métadonnée d'outil MCP reste un identifiant, pas une personne", () => {
    // `CODE_IDENT` applies to this pass like to the others: without it each fragment
    // of the tool name would get an alias that would redact « data »/« query » everywhere.
    expect(detectLabeledFields('{"name": "read-data-schema"}')).toEqual([]);
  });
});

describe("une ligne-LIBELLÉ n'est jamais la valeur de la précédente", () => {
  it("« Nom / Prénom » empilés ne coffrent pas le mot « Prénom »", () => {
    // The generic filter doesn't cover FORM words (these are the institutional
    // names it lists), so « Prénom » was vaulted as a person —
    // and every later occurrence of the word was redacted in the conversation.
    const values = detectLabeledFields("Nom\nPrénom\n\nRebour\nMarie").map((d) => d.value);
    expect(values).not.toContain("Prénom");
  });
});

describe("la forme VERTICALE exige un libellé SEUL sur sa ligne (le récépissé RCS)", () => {
  it("un libellé qui porte déjà sa valeur INLINE ne capture jamais la ligne suivante", () => {
    // The escaping bug: in the template literal, an unescaped `\S` degraded into
    // a literal « S » — the « horizontal whitespace » class became « anything but an
    // uppercase S », swallowed « : 2022B44821 » after the label, and the FIRST WORD of the
    // next line became the « value »: « Forme » (from « Forme Juridique ») vaulted
    // as an identity document on every account-filing receipt.
    const doc =
      "Dénomination : Karl Studio                    Numéro RCS : 863 471 587\n" +
      "                                              Numéro Gestion : 2022B44821\n" +
      "Forme Juridique : Société par actions simplifiée";
    const values = detectLabeledFields(doc).map((d) => d.value);
    expect(values).toContain("2022B44821"); // the real value, itself, stays covered
    expect(values).not.toContain("Forme");
    expect(values).not.toContain("Forme Juridique");
  });

  it("un mot quelconque sous un libellé-avec-valeur n'est jamais tagué", () => {
    const values = detectLabeledFields("Numéro Gestion : 2022B44821\nPamplemousse").map(
      (d) => d.value,
    );
    expect(values).toEqual(["2022B44821"]);
  });

  it("le formulaire VERTICAL légitime continue : libellé seul, valeur dessous", () => {
    // The rule's reason for being (form cells stacked by PDF
    // extraction) — the fix must not disconnect it, stopword qualifiers included.
    const dets = detectLabeledFields("Nom de l'étudiant\nBAGAYO");
    expect(dets.map((d) => d.value)).toContain("BAGAYO");
  });
});

describe("libellés — scolarité, permis, et le groupe SECRET", () => {
  const v = (t: string) => detectLabeledFields(t).map((d) => `${d.category}:${d.value}`);

  /** ⚠️ REGRESSION measured by `bench/auditFull.ts`: 4 of the 11 misses in the ID category
   *  were a student number. None has a checksum — the precision bar
   *  therefore forbids a rule from firing on the bare digit run, and the LABEL is the
   *  only possible anchor. It was present in the text, in four languages. */
  it("le numéro d'étudiant est ancré par son libellé, FR/EN/ES/DE", () => {
    expect(v("Numéro étudiant : 22104877 — Né le 2 février 2003")).toContain("ID:22104877");
    expect(v("Student number: 5518420 — Date of birth: 6 June 1999")).toContain("ID:5518420");
    expect(v("Número de matrícula: 78443019")).toContain("ID:78443019");
    expect(v("Matrikelnummer: 4471902")).toContain("ID:4471902");
  });

  it("le permis de conduire aussi", () => {
    expect(v("Permis de conduire : 851135")).toContain("ID:851135");
  });

  /** The SECRET group was ENTIRELY missing, and it's the most serious miss in the audit:
   *  a password has no shape at all (« maison2026! » is indistinguishable from an
   *  ordinary word), so nothing but the label can catch it. */
  it("mot de passe et clé de licence sont redacted par leur libellé", () => {
    expect(v("Mdp wifi : maison2026!")).toContain("SECRET:maison2026!");
    expect(v("Mot de passe : Tr0ub4dor&3")).toContain("SECRET:Tr0ub4dor&3");
    expect(v("Password: hunter2xyz")).toContain("SECRET:hunter2xyz");
    expect(v("Clé de licence : A1B2C-D3E4F-G5H6I-J7K8L"))
      .toContain("SECRET:A1B2C-D3E4F-G5H6I-J7K8L");
  });

  /** PROSE is not a label: without a colon there is no field, and a
   *  sentence that MENTIONS a password does not contain a password. */
  it("une mention en prose ne déclenche rien", () => {
    expect(v("Le permis de conduire est un document officiel.")).toEqual([]);
    expect(v("Mot de passe oublié ? Cliquez sur le lien.")).toEqual([]);
  });

  /** An em-dash surrounded by spaces is a FIELD SEPARATOR: without this cut,
   *  the greedy capture carried away the next field and the fake rewrote the birth
   *  date at the same time as the identifier. The SIMPLE hyphen stays intact —
   *  it lives inside names and addresses. */
  it("la valeur s'arrête au tiret cadratin, jamais au trait d'union", () => {
    expect(v("Numéro étudiant : 22104877 — Né le 2 février 2003")).toEqual(["ID:22104877"]);
    expect(v("Nom : Marie-Claire Saint-Chamas")).toContain("NAME:Marie-Claire Saint-Chamas");
  });
});

describe("libellé TÉLÉPHONE sans deux-points — la forme DE/IT", () => {
  const v = (t: string) => detectLabeledFields(t).map((d) => `${d.category}:${d.value}`);

  /** ⚠️ Exposed by fixing the greedy capture: these numbers were only « detected »
   *  because they OVERLAPPED into the neighbouring address value — the fake was
   *  therefore erasing the label and the number along with the address. Once the span
   *  was fixed, they went out in clear. German and Italian write « Telefon 0721 … » with
   *  no separator, and the international branch requires a `+` or `00`. */
  it("attrape le numéro national collé à son libellé", () => {
    expect(v("Karlsruhe — Telefon 0734 82 57 190 Erziehungsberechtigte: Frau B"))
      .toContain("PHONE:0734 82 57 190");
    expect(v("Telefono 340 118 27 64 Medico curante: Dott. Emanuele"))
      .toContain("PHONE:340 118 27 64");
  });

  /** THE guard, and it applies to the VALUE, not the label: a run of digits and
   *  separators, ≥7 characters, NO letters. Without it « Mobile 12 mois inclus »
   *  would be a phone number. */
  it("refuse tout ce qui contient une lettre ou est trop court", () => {
    for (const t of [
      "Mobile 12 mois inclus dans le forfait",
      "Tel du service après-vente",
      "Fax 2 pages reçues",
      "Téléphone portable neuf",
    ]) expect(v(t), t).toEqual([]);
  });
});

describe("forme SÉRIALISÉE — la clé d'une charge JSON n'a pas la syntaxe de la prose", () => {
  const v = (t: string) => detectLabeledFields(t).map((d) => `${d.category}:${d.value}`);

  /** ⚠️ REGRESSION measured on `corpora/toolResults.json`: POSTAL capped at 67% on
   *  tool results. The cause was NOT the vocabulary — « postal code » was there —
   *  but the SYNTAX: the vocabulary is written as words separated by spaces, a
   *  serialised key is written `postal_code`, `postalCode`, `postal-code` or glued together.
   *  Replacing each space with `[\s_-]*` covers all four conventions at once. */
  it("matche snake_case, camelCase, kebab-case et collé", () => {
    expect(v('{"postal_code":"59800"}')).toContain("POSTAL_CODE:59800");
    expect(v('{"postalCode":"59800"}')).toContain("POSTAL_CODE:59800");
    expect(v('{"postal-code":"59800"}')).toContain("POSTAL_CODE:59800");
    expect(v('{"date_de_naissance":"04/02/1961"}')).toContain("DOB:04/02/1961");
  });

  /** The `serialisedOnly` keys are the arbitration rendered to the FRAME rather than the word: « CP » in
   *  prose is ambiguous — it stays rejected — but `"cp":"27200"` in a payload is not.
   *  The quoted pair bounds the capture, it is the proof. */
  it("admet une clé courte DANS la forme sérialisée, et la refuse en prose", () => {
    expect(v('{"cp":"27200","ville":"Vernon"}')).toContain("POSTAL_CODE:27200");
    expect(v('{"zipcode":"69300"}')).toContain("POSTAL_CODE:69300");
    expect(v('{"admin_area_2":"ROYAT"}')).toContain("CITY:ROYAT");
    // …and prose, where « CP » can mean anything else, triggers nothing.
    expect(v("Le CP : 27200 figure sur le courrier")).toEqual([]);
    expect(v("zip : voir plus bas")).toEqual([]);
  });

  /** A SQL query is an OUTBOUND send, not a return — and it carries the data in its
   *  filter. The same key/value pair appears there with `=` and apostrophes. */
  it("attrape la donnée dans le WHERE d'une requête", () => {
    expect(v("SELECT * FROM users WHERE email = 'o.vernel@laposte.net'"))
      .toContain("EMAIL:o.vernel@laposte.net");
    expect(v("UPDATE p SET telephone = '06 45 67 89 01' WHERE nom = 'ABDELKADER'"))
      .toEqual(expect.arrayContaining(["PHONE:06 45 67 89 01", "NAME:ABDELKADER"]));
  });
});

describe("identifiant QUALIFIÉ — le libellé ne finit pas toujours au deux-points (15/08/2026)", () => {
  const vals = (t: string) => detectLabeledFields(t).map((d) => d.value);

  it("accroche un identifiant dont le libellé porte un qualificatif", () => {
    // Measured on a REAL agreement in principle: « Identifiant du Projet Crédit : 02799195 »
    // was going out in clear, while « Identifiant : … » caught. A corporate document
    // always qualifies its identifiers.
    expect(vals("Identifiant du Projet Crédit : 02799195")).toContain("02799195");
    expect(vals("Identifiant : 02799195")).toContain("02799195");
    expect(vals("N° de gestion : 2022B44821")).toContain("2022B44821");
  });

  it("⚠️ le qualificatif est BORNÉ — il ne traverse pas une clause", () => {
    // At most 3 words of ≤12 letters: beyond that, it's no longer a label but a sentence.
    expect(vals("Identifiant du projet de refonte complète du site : 02799195")).not.toContain("02799195");
  });

  it("…et une valeur d'un seul caractère n'est jamais un identifiant", () => {
    expect(vals("Identifiant de la page : 3")).not.toContain("3");
  });
});

describe("FUITE — un champ NOM avalait le champ VOISIN, qui partait en clair (16/08/2026)", () => {
  const vals = (t: string) => detectLabeledFields(t).map((d) => d.value);

  /** The vault said it all: the key was `"Aurèle Aubertin (06 12 34 56 78)"` — the REAL
   *  phone number INSIDE the fake. The whole line was ONE NAME value, the nested
   *  phone candidate fell at the de-nest, and a NAME's fake-maker only rewrites
   *  name words. */
  it("la valeur s'arrête à la PARENTHÈSE — téléphone, date de naissance, e-mail", () => {
    expect(vals("Contact : Julien Sabourdin (06 12 34 56 78)")).toEqual(["Julien Sabourdin"]);
    expect(vals("Gérant : Julien Sabourdin (né le 12/03/1984)")).toEqual(["Julien Sabourdin"]);
    expect(vals("Contact : Julien Sabourdin (julien@exemple.fr)")).toEqual(["Julien Sabourdin"]);
  });

  it("…au TIRET ESPACÉ, jamais au tiret d'un nom composé", () => {
    // The SIMPLE hyphen lives inside names; it's the SPACED one that separates two fields.
    expect(vals("Contact : Julien Sabourdin - julien@exemple.fr")).toEqual(["Julien Sabourdin"]);
    expect(vals("Nom : Jean-Pierre Saint-Chamas")).toEqual(["Jean-Pierre Saint-Chamas"]);
  });

  it("…et à un jeton qui porte un « @ » ou 2+ chiffres — impossible dans un nom", () => {
    expect(vals("Contact : Julien Sabourdin julien@exemple.fr")).toEqual(["Julien Sabourdin"]);
    expect(vals("Nom : REBOUR Jean 0612345678")).toEqual(["REBOUR Jean"]);
  });

  it("ce qui est coupé n'est pas perdu : il retombe sous SON détecteur", () => {
    // That's the point: nested, the neighbour was invisible; cut, it is seen.
    // `Nom : REBOUR (né MORVAN)` left MORVAN in clear — it is now a name in
    // its own right.
    expect(vals("Nom : REBOUR (né MORVAN)")).toEqual(["REBOUR"]);
  });
});

describe("CONSTAT PARCOURS 15/08 — un libellé de PERSONNE CONTRAINT le type (16/08/2026)", () => {
  const vals = (t: string) => detectLabeledFields(t).map((d) => `${d.category}:${d.value}`);

  /** The payroll and signature vocabulary was missing: on « Salarié: … » the
   *  detector saw NOTHING, so the NER decided alone — and on Breton names where
   *  the second term is also a commune, it decided « Gwendal Kervoal » was a CITY and
   *  « Soizic Quéméner » an ORGANISATION (capture 054). */
  it("« Salarié », « Employé », « Signataire » sont des libellés de NOM", () => {
    expect(vals("Salarié: Gwendal Kervoal")).toContain("NAME:Gwendal Kervoal");
    expect(vals("Employé : Awen Kervalec")).toContain("NAME:Awen Kervalec");
    expect(vals("Signataire : Erwan Le Goarnec")).toContain("NAME:Erwan Le Goarnec");
    expect(vals("Collaboratrice : Maëlys Tanvez")).toContain("NAME:Maëlys Tanvez");
  });

  it("⚠️ et ils ne débordent pas sur les libellés GÉO", () => {
    // The type constraint only applies to PERSON labels: a
    // « Ville » column keeps its type, or we'd fix one bug by creating another.
    expect(vals("Ville : Kervoal")).toContain("CITY:Kervoal");
    expect(vals("Adresse : 12 rue des Lilas")).toContain("ADDRESS:12 rue des Lilas");
  });
});

describe("l'idiome des JOURNAUX — `user_id=…` (persona support, 16/08/2026)", () => {
  const vals = (t: string) => detectLabeledFields(t).map((d) => `${d.category}:${d.value}`);

  it("accroche l'identifiant d'un client dans une trace", () => {
    // The inline branch already understood the unquoted `=`; it's the WORD that was missing.
    expect(vals("Trace : user_id=8842019")).toContain("ID:8842019");
    expect(vals("customer_id: 4471")).toContain("ID:4471");
    expect(vals("userId=8842019")).toContain("ID:8842019"); // case is already ignored
  });

  it("⚠️ et la valeur s'arrête à la VIRGULE — sinon elle avale la ligne", () => {
    // Measured: « user_id=8842019, ip 192.0.2.44 » was becoming ONE identifier value, and the
    // number-faker was rewriting the IP inside it as « 944.9.8.74 » — an address that
    // doesn't exist. An identifier never carries a comma.
    expect(vals("Trace : user_id=8842019, ip 192.0.2.44")).toContain("ID:8842019");
  });

  it("…et le mot SEUL, sans valeur, ne déclenche rien", () => {
    expect(vals("le user_id est expliqué dans la doc")).toEqual([]);
  });
});
