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
  // Une charge utile d'API ou une ligne de log est une chose ordinaire à coller dans un
  // chat (« pourquoi cette requête échoue ? ») et elle est DENSE en données personnelles.
  // La passe inline exige le libellé collé à son deux-points ; une clé JSON porte un
  // guillemet fermant entre les deux, donc l'enregistrement entier partait EN CLAIR.
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
    // Sinon le faux remplace la ponctuation du document et la ligne n'est plus du YAML.
    const values = detectLabeledFields('owner:\n  name: "Thibault Chandrel"').map((d) => d.value);
    expect(values).toContain("Thibault Chandrel");
    expect(values.some((v) => v.includes('"'))).toBe(false);
  });

  it("une métadonnée d'outil MCP reste un identifiant, pas une personne", () => {
    // `CODE_IDENT` s'applique à cette passe comme aux autres : sans cela chaque fragment
    // du nom d'outil recevrait un alias qui redact « data »/« query » partout.
    expect(detectLabeledFields('{"name": "read-data-schema"}')).toEqual([]);
  });
});

describe("une ligne-LIBELLÉ n'est jamais la valeur de la précédente", () => {
  it("« Nom / Prénom » empilés ne coffrent pas le mot « Prénom »", () => {
    // Le filtre générique ne couvre pas les mots de FORMULAIRE (ce sont les noms
    // institutionnels qu'il liste), donc « Prénom » était coffré comme une personne —
    // et toute occurrence ultérieure du mot était redacted dans la conversation.
    const values = detectLabeledFields("Nom\nPrénom\n\nRebour\nMarie").map((d) => d.value);
    expect(values).not.toContain("Prénom");
  });
});

describe("la forme VERTICALE exige un libellé SEUL sur sa ligne (le récépissé RCS)", () => {
  it("un libellé qui porte déjà sa valeur INLINE ne capture jamais la ligne suivante", () => {
    // Le bug d'échappement : dans le template literal, `\S` non doublé se dégradait en
    // « S » littéral — la classe « espaces horizontaux » devenait « tout sauf un S
    // majuscule », avalait « : 2022B44821 » après le libellé, et le PREMIER MOT de la
    // ligne suivante devenait la « valeur » : « Forme » (de « Forme Juridique ») coffré
    // comme pièce d'identité sur chaque récépissé de dépôt des comptes.
    const doc =
      "Dénomination : Karl Studio                    Numéro RCS : 863 471 587\n" +
      "                                              Numéro Gestion : 2022B44821\n" +
      "Forme Juridique : Société par actions simplifiée";
    const values = detectLabeledFields(doc).map((d) => d.value);
    expect(values).toContain("2022B44821"); // la vraie valeur, elle, reste couverte
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
    // La raison d'être de la règle (cellules de formulaire empilées par l'extraction
    // PDF) — le fix ne doit pas la débrancher, qualificatifs stopword compris.
    const dets = detectLabeledFields("Nom de l'étudiant\nBAGAYO");
    expect(dets.map((d) => d.value)).toContain("BAGAYO");
  });
});

describe("libellés — scolarité, permis, et le groupe SECRET", () => {
  const v = (t: string) => detectLabeledFields(t).map((d) => `${d.category}:${d.value}`);

  /** ⚠️ RÉGRESSION mesurée par `bench/auditFull.ts` : 4 des 11 manques de la catégorie ID
   *  étaient un numéro d'étudiant. Aucun n'a de somme de contrôle — la barre de précision
   *  interdit donc à une règle de tirer sur la suite de chiffres nue, et le LIBELLÉ est le
   *  seul ancrage possible. Il était présent dans le texte, dans quatre langues. */
  it("le numéro d'étudiant est ancré par son libellé, FR/EN/ES/DE", () => {
    expect(v("Numéro étudiant : 22104877 — Né le 2 février 2003")).toContain("ID:22104877");
    expect(v("Student number: 5518420 — Date of birth: 6 June 1999")).toContain("ID:5518420");
    expect(v("Número de matrícula: 78443019")).toContain("ID:78443019");
    expect(v("Matrikelnummer: 4471902")).toContain("ID:4471902");
  });

  it("le permis de conduire aussi", () => {
    expect(v("Permis de conduire : 851135")).toContain("ID:851135");
  });

  /** Le groupe SECRET manquait ENTIÈREMENT, et c'est le manque le plus grave de l'audit :
   *  un mot de passe n'a aucune forme (« maison2026! » est indiscernable d'un mot
   *  ordinaire), donc rien d'autre que le libellé ne peut l'attraper. */
  it("mot de passe et clé de licence sont redacted par leur libellé", () => {
    expect(v("Mdp wifi : maison2026!")).toContain("SECRET:maison2026!");
    expect(v("Mot de passe : Tr0ub4dor&3")).toContain("SECRET:Tr0ub4dor&3");
    expect(v("Password: hunter2xyz")).toContain("SECRET:hunter2xyz");
    expect(v("Clé de licence : A1B2C-D3E4F-G5H6I-J7K8L"))
      .toContain("SECRET:A1B2C-D3E4F-G5H6I-J7K8L");
  });

  /** La PROSE n'est pas un libellé : sans deux-points, il n'y a pas de champ, et une
   *  phrase qui MENTIONNE un mot de passe ne contient pas de mot de passe. */
  it("une mention en prose ne déclenche rien", () => {
    expect(v("Le permis de conduire est un document officiel.")).toEqual([]);
    expect(v("Mot de passe oublié ? Cliquez sur le lien.")).toEqual([]);
  });

  /** Le tiret cadratin entouré d'espaces est un SÉPARATEUR DE CHAMP : sans cette coupe,
   *  la capture gloutonne emportait le champ suivant et le faux réécrivait la date de
   *  naissance en même temps que l'identifiant. Le trait d'union SIMPLE reste intact —
   *  il vit à l'intérieur des noms et des adresses. */
  it("la valeur s'arrête au tiret cadratin, jamais au trait d'union", () => {
    expect(v("Numéro étudiant : 22104877 — Né le 2 février 2003")).toEqual(["ID:22104877"]);
    expect(v("Nom : Marie-Claire Saint-Chamas")).toContain("NAME:Marie-Claire Saint-Chamas");
  });
});

describe("libellé TÉLÉPHONE sans deux-points — la forme DE/IT", () => {
  const v = (t: string) => detectLabeledFields(t).map((d) => `${d.category}:${d.value}`);

  /** ⚠️ Exposé en corrigeant la capture gloutonne : ces numéros n'étaient « détectés »
   *  que parce qu'ils CHEVAUCHAIENT dans la valeur d'adresse voisine — le faux effaçait
   *  donc le libellé et le numéro avec l'adresse. Une fois le span corrigé, ils
   *  partaient en clair. L'allemand et l'italien écrivent « Telefon 0721 … » sans
   *  séparateur, et la branche internationale exige un `+` ou `00`. */
  it("attrape le numéro national collé à son libellé", () => {
    expect(v("Karlsruhe — Telefon 0734 82 57 190 Erziehungsberechtigte: Frau B"))
      .toContain("PHONE:0734 82 57 190");
    expect(v("Telefono 340 118 27 64 Medico curante: Dott. Emanuele"))
      .toContain("PHONE:340 118 27 64");
  });

  /** LA garde, et elle porte sur la VALEUR, pas sur le libellé : un run de chiffres et
   *  de séparateurs, ≥7 caractères, AUCUNE lettre. Sans elle « Mobile 12 mois inclus »
   *  serait un numéro de téléphone. */
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

  /** ⚠️ RÉGRESSION mesurée sur `corpora/toolResults.json` : POSTAL plafonnait à 67 % sur
   *  les retours d'outils. La cause n'était PAS le vocabulaire — « postal code » y était —
   *  mais la SYNTAXE : le vocabulaire s'écrit en mots séparés par des espaces, une clé
   *  sérialisée s'écrit `postal_code`, `postalCode`, `postal-code` ou collée. Remplacer
   *  chaque espace par `[\s_-]*` couvre les quatre conventions d'un coup. */
  it("matche snake_case, camelCase, kebab-case et collé", () => {
    expect(v('{"postal_code":"59800"}')).toContain("POSTAL_CODE:59800");
    expect(v('{"postalCode":"59800"}')).toContain("POSTAL_CODE:59800");
    expect(v('{"postal-code":"59800"}')).toContain("POSTAL_CODE:59800");
    expect(v('{"date_de_naissance":"04/02/1961"}')).toContain("DOB:04/02/1961");
  });

  /** Les clés `serialisedOnly` sont l'arbitrage rendu au CADRE et non au mot : « CP » en
   *  prose est ambigu — il reste refusé — mais `"cp":"27200"` dans une charge ne l'est pas.
   *  La paire quotée borne la capture, c'est elle qui est la preuve. */
  it("admet une clé courte DANS la forme sérialisée, et la refuse en prose", () => {
    expect(v('{"cp":"27200","ville":"Vernon"}')).toContain("POSTAL_CODE:27200");
    expect(v('{"zipcode":"69300"}')).toContain("POSTAL_CODE:69300");
    expect(v('{"admin_area_2":"ROYAT"}')).toContain("CITY:ROYAT");
    // …et la prose, où « CP » peut désigner tout autre chose, ne déclenche rien.
    expect(v("Le CP : 27200 figure sur le courrier")).toEqual([]);
    expect(v("zip : voir plus bas")).toEqual([]);
  });

  /** Une requête SQL est un ENVOI, pas un retour — et elle porte la donnée dans son
   *  filtre. La même paire clé/valeur y apparaît avec `=` et des apostrophes. */
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
    // Mesuré sur un accord de principe RÉEL : « Identifiant du Projet Crédit : 02799195 »
    // passait en clair, alors que « Identifiant : … » accrochait. Un document d'entreprise
    // qualifie toujours ses identifiants.
    expect(vals("Identifiant du Projet Crédit : 02799195")).toContain("02799195");
    expect(vals("Identifiant : 02799195")).toContain("02799195");
    expect(vals("N° de gestion : 2022B44821")).toContain("2022B44821");
  });

  it("⚠️ le qualificatif est BORNÉ — il ne traverse pas une clause", () => {
    // Au plus 3 mots de ≤12 lettres : au-delà, ce n'est plus un libellé mais une phrase.
    expect(vals("Identifiant du projet de refonte complète du site : 02799195")).not.toContain("02799195");
  });

  it("…et une valeur d'un seul caractère n'est jamais un identifiant", () => {
    expect(vals("Identifiant de la page : 3")).not.toContain("3");
  });
});

describe("FUITE — un champ NOM avalait le champ VOISIN, qui partait en clair (16/08/2026)", () => {
  const vals = (t: string) => detectLabeledFields(t).map((d) => d.value);

  /** Le coffre disait tout : la clé était `"Aurèle Aubertin (06 12 34 56 78)"` — le VRAI
   *  téléphone À L'INTÉRIEUR du faux. La ligne entière était UNE valeur NOM, le candidat
   *  téléphone imbriqué tombait au de-nest, et le faiseur de faux d'un NOM ne réécrit que
   *  les mots de nom. */
  it("la valeur s'arrête à la PARENTHÈSE — téléphone, date de naissance, e-mail", () => {
    expect(vals("Contact : Julien Sabourdin (06 12 34 56 78)")).toEqual(["Julien Sabourdin"]);
    expect(vals("Gérant : Julien Sabourdin (né le 12/03/1984)")).toEqual(["Julien Sabourdin"]);
    expect(vals("Contact : Julien Sabourdin (julien@exemple.fr)")).toEqual(["Julien Sabourdin"]);
  });

  it("…au TIRET ESPACÉ, jamais au tiret d'un nom composé", () => {
    // Le tiret SIMPLE vit dans les noms ; c'est l'ESPACÉ qui sépare deux champs.
    expect(vals("Contact : Julien Sabourdin - julien@exemple.fr")).toEqual(["Julien Sabourdin"]);
    expect(vals("Nom : Jean-Pierre Saint-Chamas")).toEqual(["Jean-Pierre Saint-Chamas"]);
  });

  it("…et à un jeton qui porte un « @ » ou 2+ chiffres — impossible dans un nom", () => {
    expect(vals("Contact : Julien Sabourdin julien@exemple.fr")).toEqual(["Julien Sabourdin"]);
    expect(vals("Nom : REBOUR Jean 0612345678")).toEqual(["REBOUR Jean"]);
  });

  it("ce qui est coupé n'est pas perdu : il retombe sous SON détecteur", () => {
    // C'est le point : imbriqué, le voisin était invisible ; coupé, il est vu.
    // `Nom : REBOUR (né MORVAN)` laissait MORVAN en clair — il est maintenant un nom à
    // part entière.
    expect(vals("Nom : REBOUR (né MORVAN)")).toEqual(["REBOUR"]);
  });
});

describe("CONSTAT PARCOURS 15/08 — un libellé de PERSONNE CONTRAINT le type (16/08/2026)", () => {
  const vals = (t: string) => detectLabeledFields(t).map((d) => `${d.category}:${d.value}`);

  /** Le vocabulaire de la paie et de la signature manquait : sur « Salarié: … » le
   *  détecteur ne voyait RIEN, donc le NER tranchait seul — et sur des noms bretons dont
   *  le second terme est aussi une commune, il tranchait « Gwendal Kervoal » en VILLE et
   *  « Soizic Quéméner » en ORGANISATION (capture 054). */
  it("« Salarié », « Employé », « Signataire » sont des libellés de NOM", () => {
    expect(vals("Salarié: Gwendal Kervoal")).toContain("NAME:Gwendal Kervoal");
    expect(vals("Employé : Awen Kervalec")).toContain("NAME:Awen Kervalec");
    expect(vals("Signataire : Erwan Le Goarnec")).toContain("NAME:Erwan Le Goarnec");
    expect(vals("Collaboratrice : Maëlys Tanvez")).toContain("NAME:Maëlys Tanvez");
  });

  it("⚠️ et ils ne débordent pas sur les libellés GÉO", () => {
    // La contrainte de type ne s'applique qu'aux libellés de PERSONNE : une colonne
    // « Ville » garde son type, sans quoi on corrigerait un défaut en en créant un autre.
    expect(vals("Ville : Kervoal")).toContain("CITY:Kervoal");
    expect(vals("Adresse : 12 rue des Lilas")).toContain("ADDRESS:12 rue des Lilas");
  });
});

describe("l'idiome des JOURNAUX — `user_id=…` (persona support, 16/08/2026)", () => {
  const vals = (t: string) => detectLabeledFields(t).map((d) => `${d.category}:${d.value}`);

  it("accroche l'identifiant d'un client dans une trace", () => {
    // La branche en ligne comprenait déjà le `=` non quoté ; c'est le MOT qui manquait.
    expect(vals("Trace : user_id=8842019")).toContain("ID:8842019");
    expect(vals("customer_id: 4471")).toContain("ID:4471");
    expect(vals("userId=8842019")).toContain("ID:8842019"); // la casse est déjà ignorée
  });

  it("⚠️ et la valeur s'arrête à la VIRGULE — sinon elle avale la ligne", () => {
    // Mesuré : « user_id=8842019, ip 192.0.2.44 » devenait UNE valeur d'identifiant, et le
    // faiseur de chiffres réécrivait l'IP à l'intérieur en « 944.9.8.74 » — une adresse qui
    // n'existe pas. Un identifiant ne porte jamais de virgule.
    expect(vals("Trace : user_id=8842019, ip 192.0.2.44")).toContain("ID:8842019");
  });

  it("…et le mot SEUL, sans valeur, ne déclenche rien", () => {
    expect(vals("le user_id est expliqué dans la doc")).toEqual([]);
  });
});
