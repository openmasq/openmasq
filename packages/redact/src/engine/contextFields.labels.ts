import { isStopword, isGenericTerm } from "../model/genericTerms";
// The label VOCABULARY of the `label : value` detector — data only, split from
// contextFields.ts (LOC cap): the matching/cleaning logic stays there; coverage
// grows HERE, by adding label terms per language. Genuinely-identifying field
// labels only (never generic "Objet"/"Note"/"Ref").

export interface LabelGroup {
  category: string;
  terms: string[];
  /**
   * Clés admises UNIQUEMENT dans la forme SÉRIALISÉE (`"postal_code": "59800"`), jamais
   * en prose.
   *
   * ⚠️ C'est le même arbitrage que le reste du fichier, mais rendu au CADRE plutôt qu'au
   * mot : « CP » dans une phrase est ambigu — d'où son refus délibéré parmi les `terms` —
   * alors que `"cp":"27200"` dans une charge JSON ne l'est pas. La paire clé/valeur
   * QUOTÉE est elle-même la preuve : elle borne la capture exactement, donc aucune course
   * gloutonne n'emporte le reste de l'enregistrement. Mesuré sur `corpora/toolResults.json` :
   * POSTAL plafonnait à 67 % parce que le code postal d'un retour d'outil est TOUJOURS un
   * champ isolé, jamais une prose.
   */
  serialisedOnly?: string[];
}

// Genuinely-identifying field labels only (never generic "Objet"/"Note"/"Ref").
// Grouped by the engine category their value maps to.
export const LABEL_GROUPS: LabelGroup[] = [
  {
    category: "ORG",
    terms: [
      "dénomination", "denomination", "raison sociale", "société", "societe", "entreprise",
      "company", "company name", "organisation", "organization", "employer", "employeur",
      "empresa", "razón social", "razon social", "azienda", "ragione sociale", "firma",
      "unternehmen", "bedrijf",
      // CJK: company / organisation
      "会社", "会社名", "社名", "公司", "公司名称", "企业", "名称", "회사", "회사명", "기업", "상호",
    ],
  },
  {
    // Pseudo / handle / login (category "username", OFF by default). Specific labels
    // only — NOT bare "identifiant"/"user"/"id" (they belong to the ID group / would
    // over-match). A handle written with an `@` is caught by rules.username.ts instead.
    category: "USERNAME",
    terms: [
      "pseudo", "pseudonyme", "nom d'utilisateur", "nom d utilisateur",
      "identifiant utilisateur", "username", "user name", "login", "handle", "nickname",
      // Same label, other languages (the specific-word discipline above holds:
      // never a bare "usuario"-alone-means-id word that isn't the LOGIN label).
      "benutzername", "anmeldename", "nombre de usuario", "nome utente",
      "nome de utilizador", "utilizador", "gebruikersnaam", "nazwa użytkownika",
    ],
  },
  {
    category: "NAME",
    // Slack `real_name`/`display_name`, Stripe `customer_name`, Graph `displayName`,
    // Sentry `username`, Airtable `Nom`.
    serialisedOnly: ["real name", "display name", "customer name", "payer name",
      "recipient name", "speaker name", "author name", "assignee", "reporter"],
    terms: [
      "nom", "prénom", "prenom", "nom et prénom", "nom complet", "nom de famille",
      // CNI / passeport vocabulary ("Nom d'usage : MORVAN", "Nom de naissance : …").
      "nom de naissance", "nom d'usage", "nom d usage",
      "titulaire", "gérant",
      "gerant", "représentant", "representant", "name", "full name", "fullname",
      "first name", "firstname", "given name",
      "last name", "lastname", "family name", "surname", "contact", "nombre",
      "apellido", "nome", "cognome",
      "vorname", "nachname", "naam",
      // Le vocabulaire de la PAIE et de la signature — la colonne d'un classeur RH, et
      // le pied d'un acte. Mesuré le 16/08/2026 avec le NER dans la boucle : sur
      // « Salarié: … », le détecteur étiqueté ne voyait RIEN (le libellé était absent
      // d'ici), donc le NER tranchait seul le type — et sur des noms bretons il tranchait
      // « Gwendal Kervoal » en VILLE et « Soizic Quéméner » en ORGANISATION. Constat
      // parcours du 15/08, capture 054.
      "salarié", "salarie", "employé", "employe", "collaborateur", "collaboratrice",
      "signataire", "employee", "staff member",
      // CJK: name
      "名前", "氏名", "お名前", "姓名", "名字", "이름", "성명",
    ],
  },
  {
    category: "ADDRESS",
    // Stripe/Square `address_line_1`, PayPal `address_line_1`, Graph `street`.
    serialisedOnly: ["address line 1", "address line 2", "line 1", "street", "strasse",
      "via", "calle", "rua", "adresse ligne 1"],
    terms: [
      "adresse", "adresse postale", "siège", "siege", "siège social", "domicile",
      "address", "postal address", "dirección", "direccion", "domicilio", "indirizzo",
      "anschrift", "adresse:", "adres", "endereço", "endereco", "morada",
      // CJK: address
      "住所", "ご住所", "地址", "住址", "주소",
    ],
  },
  {
    category: "CITY",
    // Stripe/PayPal `locality`, `admin_area_2` ; Graph `city` ; Intercom `location.city`.
    serialisedOnly: ["locality", "admin area 2", "town", "commune"],
    terms: [
      "ville", "commune", "city", "ciudad", "città", "citta", "stadt", "cidade",
      "都市", "城市", "도시",
      // CNI / état-civil ("Lieu de naissance : LYON") — a place, faked as a city.
      "lieu de naissance", "place of birth", "birthplace", "geburtsort",
      "lugar de nacimiento", "luogo di nascita",
      // Bank branch ("Agence de : NARBONNE") — locates the customer; the "de" is part
      // of the term on purpose (a bare "agence :" label is too generic to gate on).
      "agence de",
    ],
  },
  {
    category: "EMAIL",
    // Square `email_address`, Intercom `email`, Graph `emailAddress`, Sentry `user.email`.
    serialisedOnly: ["email address", "mail address", "correo electronico",
      "work email", "personal email", "email adresse"],
    terms: [
      "email", "e-mail", "courriel", "mail", "adresse email", "correo", "correo electrónico",
      // CJK: email
      "メール", "メールアドレス", "邮箱", "电子邮件", "邮件", "이메일", "메일",
    ],
  },
  {
    category: "PHONE",
    // Square/PayPal `phone_number`, Stripe `phone`, PayPal `national_number`.
    serialisedOnly: ["phone number", "national number", "mobile number", "cell",
      "telefono cellulare", "handynummer"],
    terms: [
      "téléphone", "telephone", "tél", "tel", "mobile", "portable", "gsm", "fax",
      "numéro de téléphone", "numero de telephone", "num tel", "num_tel",
      "phone", "phone number", "teléfono", "telefono", "telefon", "telefoon",
      "telefone", "telemóvel", "telemovel",
      // CJK: phone
      "電話", "電話番号", "携帯", "电话", "手机", "联系电话", "电话号码", "전화", "전화번호", "휴대폰", "연락처",
    ],
  },
  {
    category: "DOB",
    // `nascita`, `data di nascita`, `nacimiento`, `nascimento` : les clés que les API
    // italiennes, espagnoles et portugaises émettent.
    serialisedOnly: ["nascita", "data di nascita", "nacimiento", "nascimento",
      "birth", "born", "date naissance"],
    terms: [
      "date de naissance", "naissance", "né le", "ne le", "née le", "nee le",
      // The form idiom "Né(e) le :" — the paren sits mid-term, so the generic
      // (s)-suffix tolerance cannot reach it. Literal entries (escaped verbatim).
      "né(e) le", "ne(e) le",
      "birth date", "birthdate", "birthday", "dob",
      "date of birth", "geburtsdatum", "fecha de nacimiento", "data di nascita",
      // CJK: date of birth
      "生年月日", "出生日期", "生日", "생년월일",
    ],
  },
  {
    category: "ID",
    terms: [
      "numéro de sécurité sociale", "n° sécurité sociale", "sécurité sociale",
      "securite sociale", "sécu", "secu", "numsecu", "nir", "matricule",
      "identifiant", "numéro d'identification", "numero d'identification",
      "ssn", "social security number", "national id", "id number", "tin",
      "numéro fiscal", "tax id", "passport", "passeport", "numéro de compte", "account number",
      // Permis de séjour / documents bilingues ("Document No.: FR-89047511600123").
      "document no", "document number", "numéro de document", "numero de document",
      // "N° de personne" — the member-id label on royalties/répartition statements.
      "numéro de personne", "n° de personne",
      // Bank-file references ("Référence du financement : KX8214", the caution-act
      // header/footers) — SPECIFIC compounds only, never a generic bare "référence".
      "référence du financement", "reference du financement",
      "référence financement", "reference financement",
      "référence du dossier", "reference du dossier",
      "référence dossier", "reference dossier",
      "numéro de dossier", "numero de dossier", "n° de dossier",
      // Membership / insurance / court-file ids (mutuelle, assurance, tribunal,
      // recommandé) — SPECIFIC compounds only, never a bare "membre"/"contrat".
      "numéro d'adhérent", "numero d'adherent", "n° adhérent", "n° d'adhérent", "numéro adhérent",
      "numéro d'assuré", "numero d'assure", "n° assuré", "n° d'assuré", "numéro assuré",
      "numéro de membre", "n° de membre", "numéro membre",
      "numéro de contrat", "numero de contrat", "n° de contrat", "n° contrat", "numéro contrat",
      "numéro de recommandé", "n° de recommandé", "n° recommandé",
      "numéro rg", "n° rg",
      "numéro gestion", "numéro de gestion", "n° gestion", "n° de gestion", "numéro rcs", "n° rcs",
      "siren", "siret", "numéro siren", "numéro siret",
      // L'idiome des JOURNAUX et des traces — `user_id=8842019`, `customer_id: 4471`. La
      // branche en ligne comprend déjà le `=` non quoté ; ce qui manquait, c'est le mot.
      // Mesuré le 16/08/2026 (persona support) : l'identifiant d'un client partait EN
      // CLAIR au milieu d'une trace. Les graphies sont écrites À PLAT parce que la branche
      // en ligne échappe le terme littéralement — la casse, elle, est déjà ignorée, donc
      // « userId » tombe sous « userid ».
      "user_id", "userid", "customer_id", "customerid", "account_id", "accountid",
      "member_id", "memberid", "patient_id", "patientid",
      // SCOLARITÉ — mesuré par `bench/auditFull.ts` : 4 des 11 manques de la catégorie
      // ID sont un numéro d'étudiant dont le LIBELLÉ est présent dans le texte, en
      // français, anglais, espagnol et portugais. Aucun n'a de somme de contrôle, donc
      // le libellé est le seul ancrage possible (barre de précision, `CLAUDE.md`).
      "numéro étudiant", "numero etudiant", "numéro d'étudiant", "numero d'etudiant",
      "n° étudiant", "n° d'étudiant", "student number", "student id", "student no",
      "matriculation number", "número de matrícula", "numero de matricula",
      "matrícula", "matricula", "numero di matricola", "matricola",
      "matrikelnummer", "immatrikulationsnummer",
      // PERMIS DE CONDUIRE — même cas : « Permis de conduire : 851135 ».
      "permis de conduire", "numéro de permis", "numero de permis", "n° de permis",
      "driving licence", "driving license", "driver's license", "driver license",
      "licence number", "führerscheinnummer", "fuhrerscheinnummer",
      "número de permiso", "numero de permiso", "patente di guida", "carta de condução",
      "carta de conducao",
      "dni", "nif", "nie", "codice fiscale", "pesel", "aadhaar",
      // CJK: national id / postal code
      "マイナンバー", "個人番号", "身份证", "身份证号", "证件号", "주민등록번호",
      "邮编", "邮政编码", "우편번호", "郵便番号",
    ],
  },
  {
    // MOTS DE PASSE, CODES ET CLÉS. Le groupe manquait entièrement, et c'est le manque
    // le plus grave de l'audit : un mot de passe n'a AUCUNE forme — « maison2026! » est
    // indiscernable d'un mot ordinaire, « 4581 » de n'importe quel nombre. L'ancrage sur
    // le libellé est donc le SEUL mécanisme possible pour cette catégorie.
    //
    // ⚠️ Les composés sont explicites parce que le matcher EN LIGNE, contrairement à
    // `labelOf`, ne tolère aucun qualificatif entre le terme et le deux-points :
    // « Mdp wifi : … » n'est atteignable que si « mdp wifi » est listé tel quel.
    category: "SECRET",
    terms: [
      "mot de passe", "mots de passe", "mdp", "mdp wifi", "mot de passe wifi",
      // Composés OBSERVÉS (le matcher en ligne ne tolère aucun qualificatif libre).
      "mot de passe applicatif", "mot de passe admin", "mot de passe administrateur",
      "code wifi", "clé wifi", "cle wifi", "clé wpa", "cle wpa", "clé de sécurité",
      "cle de securite", "code secret", "code confidentiel", "code d'accès",
      "code d'acces", "code pin", "code du coffre", "code coffre",
      "clé de licence", "cle de licence", "clé licence", "cle licence",
      "clé d'activation", "cle d'activation", "clé produit", "cle produit",
      "password", "passwd", "passphrase", "pass phrase", "licence key", "license key",
      "product key", "activation key", "api key", "secret key", "access token",
      "passwort", "kennwort", "lizenzschlüssel", "lizenzschlussel",
      "contraseña", "contrasena", "clave de licencia", "clave de acceso",
      "chiave di licenza", "parola d'ordine",
      "palavra-passe", "senha", "chave de licença", "chave de licenca",
    ],
  },
  {
    category: "IBAN",
    terms: ["iban", "rib", "numéro iban", "n° iban"],
  },
  {
    category: "CARD",
    terms: [
      "numéro de carte", "numero de carte", "numéro de carte bancaire", "carte bancaire",
      "n° carte", "card number", "credit card", "card no",
    ],
  },
  {
    category: "POSTAL_CODE",
    // Stripe `address.postal_code`, PayPal `postal_code`, Square `postal_code`,
    // Airtable/Notion `CP`, Graph `postalCode` : le code postal d'une charge sérialisée
    // n'a jamais de forme en prose.
    serialisedOnly: ["cp", "zip", "zipcode", "postal", "cap", "plz", "codpostal"],
    terms: [
      "code postal", "codigo postal", "código postal", "postal code", "postcode",
      "zip code", "plz",
      // CJK: postal code
      "邮编", "邮政编码", "郵便番号", "우편번호",
    ],
  },
];

/** Is this single word one of the label vocabulary's own terms? */
function isLabelWord(w: string): boolean {
  return LABEL_GROUPS.some((g) => g.terms.includes(w));
}

/** The label a line consists of ENTIRELY, or null. Qualifier words are tolerated only
 *  when they carry no meaning of their own ("Nom de l'étudiant"), which is the same
 *  test the vertical pass applies. */
export function labelOf(line: string): { category: string } | null {
  const bare = line
    .trim()
    .replace(/[:：]\s*$/u, "")
    .trim();
  if (!bare || bare.length > 40) return null;
  const lower = bare.toLowerCase();
  for (const group of LABEL_GROUPS) {
    for (const term of group.terms) {
      if (lower === term) return { category: group.category };
      if (!lower.startsWith(term)) continue;
      const rest = lower.slice(term.length);
      // A plural `s`, then only meaningless qualifiers — else it is a different label.
      const tail = rest.replace(/^s\b/u, "").trim();
      if (!tail) return { category: group.category };
      const words = tail.split(/[\s'’/]+/u).filter(Boolean);
      // A qualifier is tolerated when it carries no meaning of its own ("Nom de
      // l'étudiant") OR when it is ITSELF a label: a form cell routinely fuses two
      // ("Code postal / Ville", "Nom - Prénom"). Refusing the fused cell broke the label
      // RUN in two, and an unequal count then refused the whole block — one composite
      // cell cost every field of the form. The FIRST label's category wins; a "CP Ville"
      // value is promoted to PLACE downstream whichever of the two matched.
      const ok = (w: string): boolean => isStopword(w) || isGenericTerm(w) || isLabelWord(w);
      if (words.length <= 3 && words.every(ok)) return { category: group.category };
    }
  }
  return null;
}

