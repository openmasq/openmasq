// The label vocabulary's SECOND volume — the identifiers of banking, payment and customer
// relationships across the languages the public benchmarks write in (EN/DE/ES/IT/NL/SV/PT),
// plus the FINANCIAL groups moved here from `contextFields.labels.ts` (300-LOC cap).
//
// Why it exists: measured on 2026-09-07 against Gretel's finance corpus and Nemotron-PII
// (`bench/spans/`), the product found 8 % of the account PINs, 6 % of the card security
// codes, 11 % of the routing numbers and about a quarter of the customer/employee ids —
// against 90-100 % for a detector that reads the LABEL. None of these values has a shape a
// rule could trust on its own (a PIN is four digits, a customer id is anything); the label
// is the only anchor the precision bar allows, and it was simply missing in those languages.
//
// Same discipline as the first volume: genuinely-identifying labels only, never a bare
// generic word (« number », « code », « id »), and a NUMERIC group refuses a value with no digit.
import type { LabelGroup } from "./terms";

/** Customer / employee / member / policy / case ids, and the identity documents of the
 *  languages the first volume covers only in French. Merged INTO the `ID` group. */
export const ID_TERMS_WORLD: string[] = [
  "customer id", "customer number", "customer no", "customer ref", "client id", "client number",
  "client no", "employee id", "employee number", "employee no", "staff id", "staff number",
  "member id", "member number", "membership number", "membership no", "membership id",
  "policy number", "policy no", "policy id", "claim number", "claim no", "claim id",
  "case number", "case no", "case id", "file number", "file no", "application number",
  "application no", "docket number", "docket no", "national insurance number", "nino",
  "social insurance number", "social security no", "bsn", "burgerservicenummer",
  "personnummer", "personalnummer", "kundennummer", "kundennr", "kunden-nr",
  "mitarbeiternummer", "mitarbeiter-nr", "versicherungsnummer", "versichertennummer",
  "sozialversicherungsnummer", "policennummer", "vertragsnummer", "aktenzeichen",
  "reisepassnummer", "passnummer", "ausweisnummer", "personalausweisnummer",
  "número de cliente", "numero de cliente", "número de empleado", "numero de empleado",
  "número de póliza", "numero de poliza", "número de seguridad social",
  "numero de seguridad social", "número de pasaporte", "numero de pasaporte", "pasaporte",
  "licencia de conducir", "número de licencia de conducir", "número de licencia",
  "führerschein", "fuehrerschein", "rijbewijs", "körkort", "teacher id", "teacher number",
  "numero de licencia", "número de expediente", "numero de expediente",
  "codice cliente", "numero cliente", "numero dipendente", "matricola dipendente",
  "numero di polizza", "numero polizza", "passaporto", "numero di passaporto",
  "numero pratica", "numero di pratica",
  "klantnummer", "personeelsnummer", "polisnummer", "paspoortnummer", "rijbewijsnummer",
  "dossiernummer", "kundnummer", "anställningsnummer", "försäkringsnummer",
  "körkortsnummer", "ärendenummer",
  "número de passaporte", "numero de passaporte", "número de apólice", "numero de apolice",
  // The identifiers of HEALTH, LICENSING and DEVICES — measured 2026-09-07 on Nemotron-PII
  // (`bench/spans/`): health-plan beneficiary numbers at 18 %, certificate/licence numbers
  // at 4 %, device identifiers at 23 %, biometric identifiers at 42 %, medical record
  // numbers at 58 % — every one written under its own label. A plate and a VIN identify
  // the vehicle's owner the way a customer number does.
  "health plan beneficiary number", "health plan beneficiary", "beneficiary number",
  "beneficiary id", "medical record number", "medical record no", "mrn", "patient number",
  "certificate license number", "certificate licence number", "certificate number",
  "certificate no", "license number", "license no", "licence no",
  "biometric identifier", "biometric id", "device identifier", "device id",
  // (« VIN » alone is not listed: « Vin : Bordeaux » is a French menu.)
  "vehicle identification number", "license plate", "licence plate", "plate number",
  "unique identifier", "unique id",
  "número de seguro social", "numero de seguro social", "seguro social",
];

/** Merged INTO the `PHONE` group: the compound phone labels of DE/NL/SV/IT/ES/PT. */
export const PHONE_TERMS_WORLD: string[] = [
  "telefoonnummer", "telefonnummer", "telefonnr", "mobilnummer", "handynummer",
  "numero di telefono", "número de teléfono", "numero de telefono", "número de telefone",
  "numero de telefone", "telefonnummer:",
  // « Fax Number », « Contact Number », « Cell Phone » — the compound sits before the colon,
  // and the inline matcher reads the label whole: « Fax Number: 502-411-7227 » shipped in clear
  // while « Fax: » did not (Nemotron-PII, 2026-09-07, fax numbers at 19 %).
  "fax number", "fax no", "telephone number", "phone no", "tel no", "contact number",
  "contact phone", "contact phone number", "cell phone", "cellphone", "cell number",
  "mobile phone", "mobile phone number", "work phone", "home phone", "office phone",
];

/** Merged INTO the `USERNAME` group. */
export const USERNAME_TERMS_WORLD: string[] = [
  "user id", "usuario", "nome utente", "gebruikersnaam", "användarnamn", "benutzer",
  "utilisateur",
];

/** Merged INTO the `DOB` group. */
export const DOB_TERMS_WORLD: string[] = ["data de nascimento", "geboortedatum", "födelsedatum"];

export const WORLD_GROUPS: LabelGroup[] = [
  {
    // The HOUSE / BUILDING number as its own field — a form and every address API split it
    // out (« Gebäudenummer: 834 », `"BuildingNumber": "441"`, `<building>964</building>`).
    // Alone it is a same-shape number (category ID), and it is what finds the door once the
    // street is known: measured 2026-09-07 on ai4privacy, the product found 18 % of them.
    category: "ID",
    numeric: true,
    serialisedOnly: ["building", "gebäude", "gebaeude", "housenumber", "buildingnumber", "house no"],
    terms: [
      "gebäudenummer", "gebaeudenummer", "hausnummer", "haus-nr", "house number", "building number",
      "building no", "numéro de bâtiment", "numero de batiment", "n° de bâtiment", "numéro de voie",
      "número de edificio", "numero de edificio", "número de casa", "numero civico", "huisnummer",
      "husnummer", "número da casa", "numero da casa",
    ],
  },
  {
    // The SECONDARY address line — an apartment, a unit, a « Nebenadresse ». ADDRESS, so
    // its fake keeps the shape of a complement and the street stays coherent beside it.
    category: "ADDRESS",
    terms: [
      "nebenadresse", "adresszusatz", "secondary address", "address line 2", "unit number",
      "apartment number", "apartment no", "complément d'adresse", "complement d'adresse",
      "dirección secundaria", "direccion secundaria", "indirizzo secondario", "adresregel 2",
      "endereço secundário", "endereco secundario",
    ],
  },
  {
    // PASSWORDS, CODES AND KEYS. The group was ENTIRELY missing, and it's the
    // most serious miss in the audit: a password has NO shape at all — « maison2026! » is
    // indistinguishable from an ordinary word, « 4581 » from any number. Anchoring on
    // the label is therefore the ONLY possible mechanism for this category.
    //
    // ⚠️ The compounds are explicit because the INLINE matcher, unlike
    // `labelOf`, tolerates no qualifier between the term and the colon:
    // « Mdp wifi : … » is only reachable if « mdp wifi » is listed as-is.
    category: "SECRET",
    terms: [
      "mot de passe", "mots de passe", "mdp", "mdp wifi", "mot de passe wifi",
      // OBSERVED compounds (the inline matcher tolerates no free qualifier).
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
      "wachtwoord", "lösenord", "one-time password", "one time password",
      "mot de passe à usage unique",
    ],
  },
  {
    // The NUMERIC secrets: a PIN, a card security code, a verification code. Their own
    // group because a value with no digit under « PIN : » is prose (« PIN: see card »),
    // and the SECRET group above must keep accepting letters (a password is letters).
    category: "SECRET",
    numeric: true,
    terms: [
      "pin", "pin code", "pin-code", "pincode", "pin number", "account pin", "card pin",
      "cvv", "cvv2", "cvc", "cvc2", "cid", "security code", "card security code",
      "credit card security code", "card verification code", "card verification value",
      "card verification", "verification code", "otp", "otp code",
      "code de vérification", "code de verification", "cryptogramme", "cryptogramme visuel",
      "código pin", "codigo pin", "código de seguridad", "codigo de seguridad",
      "código de verificación", "codigo de verificacion",
      "codice pin", "codice di sicurezza", "codice di sicurezza della carta",
      "codice di verifica", "sicherheitscode", "kartenprüfnummer", "kartenpruefnummer",
      "prüfnummer", "bestätigungscode", "bestaetigungscode",
      "beveiligingscode", "verificatiecode", "pinkod", "säkerhetskod", "verifieringskod",
      "código de segurança", "codigo de seguranca",
    ],
  },
  {
    // Bank COORDINATES beyond the IBAN: the routing numbers of the world (ABA, sort
    // code, BSB, transit), the BBAN, the SWIFT/BIC — none carries a checksum a rule can
    // rely on in a synthetic corpus, and all ride the `iban` toggle (same nature).
    category: "IBAN",
    terms: [
      "iban", "rib", "numéro iban", "n° iban", "bban",
      "routing number", "routing no", "bank routing number", "aba routing number",
      "aba number", "aba", "rtn", "sort code", "bsb", "transit number", "transit no",
      "numéro de routage", "numero de routage", "número de ruta", "numero de ruta",
      "bankleitzahl", "blz", "kontonummer", "bankkonto", "número de cuenta", "numero de cuenta",
      "cuenta bancaria", "numero di conto", "conto corrente", "rekeningnummer",
      "bankrekening", "kontonr", "número de conta", "numero de conta",
    ],
  },
  {
    // The SWIFT/BIC is its own group because it is LETTERS (« BNPAFRPP »): under the
    // IBAN group, whose values must carry a digit, every digit-less BIC was dropped.
    category: "BIC",
    terms: [
      "swift", "bic", "swift code", "bic code", "swift/bic", "swift bic", "swift bic code",
      "código swift", "codigo swift", "codice swift", "swift-code", "bic/swift",
    ],
  },
  {
    category: "CARD",
    terms: [
      "numéro de carte", "numero de carte", "numéro de carte bancaire", "carte bancaire",
      "n° carte", "card number", "credit card", "card no", "credit card number",
      "debit card", "debit card number", "credit debit card", "credit/debit card",
      "payment card", "cc number", "card", "kreditkarte", "kreditkartennummer",
      "kartennummer", "tarjeta de crédito", "tarjeta de credito", "número de tarjeta",
      "numero de tarjeta", "tarjeta", "carta di credito", "numero di carta",
      "numero carta", "numero di carta di credito", "creditcard", "creditcardnummer",
      "kaartnummer", "kortnummer", "kreditkort", "cartão de crédito", "cartao de credito",
      "número do cartão", "numero do cartao",
    ],
  },
  {
    category: "POSTAL_CODE",
    // Stripe `address.postal_code`, PayPal `postal_code`, Square `postal_code`,
    // Airtable/Notion `CP`, Graph `postalCode`: a serialised payload's postal code
    // never has a prose form.
    serialisedOnly: ["cp", "zip", "zipcode", "postal", "cap", "plz", "codpostal"],
    terms: [
      "code postal", "codigo postal", "código postal", "postal code", "postcode",
      "zip code", "plz", "postleitzahl", "postnummer",
      // CJK: postal code
      "邮编", "邮政编码", "郵便番号", "우편번호",
    ],
  },
];
