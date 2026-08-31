/**
 * Tranche « redactionCatalog » du catalogue EN — traduit de la source (`../fr/redactionCatalog.ts`).
 * ⚠️ `detail` et `impact` disent ce qui est masqué et ce que ça coûte à la réponse (règle 8) :
 * traduits au mot près. `satisfies` par entrée.
 */
import type { Messages } from "../messages";

export const redactionCatalog = {
  categories: {
    name: {
      label: "Names",
      detail:
        "First names, surnames and full identities detected by the local model — including in CAPITALS, run together or in a labelled field (Name:, First name(s):). Public figures stay readable.",
    },
    dob: {
      label: "Date of birth",
      detail:
        "Dates of birth (born on…, date of birth, FR/EN/DE formats), labelled fields included. Other dates are never touched.",
      impact:
        "Masked, an age or a delay COMPUTED by the model may be off (the fake date protects the real year, itself identifying). The restored date is always the real one.",
    },
    username: {
      label: "Username / handle",
      detail: "@handles and login / username / nickname fields.",
    },
    email: {
      label: "Email",
      detail:
        "Email addresses (the fake keeps a consistent first name so that “Hello X” stays reversible).",
    },
    phone: {
      label: "Phone",
      detail:
        "French and international numbers (+33, 00…), validated with libphonenumber for international ones.",
    },
    address: {
      label: "Postal address",
      detail:
        "Complete multilingual addresses (FR/EN/DE/ES/IT/PT/NL + CJK) — replaced by a real address in the same country, different region.",
      impact:
        "Masked, the address stays consistent (same country, same shape) but any geographic computation — distance, proximity, district — is about the borrowed place.",
    },
    location: {
      label: "Place / city / postcode",
      detail:
        "Cities, postcodes, departments, regions, birthplaces. COUNTRIES are never masked (world knowledge).",
      impact:
        "Masked, distances, routes and jurisdictions are reasoned about on borrowed places — consistent with each other, but not with the real map.",
    },
    company: {
      label: "Company",
      detail:
        "Company and organisation names detected by the model. Major brands, products and known indices stay readable; your SIREN/VAT numbers belong to “Company identifiers”.",
      impact:
        "Masked, the model knows NOTHING about the company (sector, size, collective agreement): its borrowed name is unknown to the world, on purpose.",
    },
    card: {
      label: "Bank card",
      detail: "13–19-digit card numbers validated with Luhn, spaces/dashes tolerated.",
    },
    iban: {
      label: "IBAN / bank details",
      detail:
        "IBAN (mod-97), BIC/SWIFT, and routing codes: ABA (US), sort code (UK), BSB (AU), CLABE (MX), IFSC (IN), labelled account numbers.",
    },
    national_id: {
      label: "National ID / passport / licence",
      detail:
        "Identity documents from 40+ countries: national ID cards, passports, French NIR/social security (spaced, Corsica), driving licences, residence permits, tax numbers, MRZ of scanned documents, SSN/ITIN, NHS, PESEL, Swiss AVS, Belgian register, Brazilian CPF, Chinese ID card, HKID, My Number… plus licence plates, VIN and IMEI. Check digits verified where the country publishes one.",
    },
    company_id: {
      label: "Company identifiers",
      detail:
        "SIREN/SIRET/RCS, intra-EU VAT (FR + EU), LEI, trade registers (German HR, Singapore UEN, Australian ABN/ACN, Brazilian CNPJ, US EIN), organisation numbers.",
    },
    ip: {
      label: "IP address",
      detail: "IPv4, IPv6 (compressed :: forms) and MAC addresses — replaced by valid addresses.",
    },
    path: {
      label: "File paths",
      detail:
        "Absolute paths (macOS/Windows/Linux), personal file and folder names (documents, images, archives) — source code is not targeted.",
    },
    url: {
      label: "Web addresses (URL)",
      detail:
        "Masks the WHOLE address — domain, path and parameters — not just what it contains. Off, URLs stay readable AND nothing inside them is masked by mistake (file names, cache tokens of a visited page); keys inside them always are. On at the Strict level, meant for document analysis.",
    },
    secret: {
      label: "Keys & secrets",
      detail:
        "Access keys (OpenAI, AWS, Stripe, GitHub, Slack…), sign-in tokens, private keys, passwords, OTP/PIN codes, crypto wallets.",
    },
    apikey: {
      label: "Key-like strings (generic)",
      detail:
        "Broad heuristic: any string that LOOKS like a key (long mix of letters and digits). Active at every protection level — a missed key leaves in clear. In return it also catches harmless product references.",
    },
  },
  sections: {
    Identité: "Identity",
    Contact: "Contact",
    Localisation: "Location",
    Organisation: "Organisation",
    Financier: "Financial",
    Identifiants: "Identifiers",
    Réseau: "Network",
    Système: "System",
    Secrets: "Secrets",
  },
  kinds: {
    company_id: "Company identifiers",
    url: "Web addresses",
    salary: "Salaries",
    health: "Health",
    name: "Names",
    dob: "Dates of birth",
    username: "Usernames / handles",
    email: "Email addresses",
    phone: "Phone numbers",
    address: "Postal addresses",
    location: "Places",
    company: "Company names",
    card: "Bank cards",
    iban: "IBAN",
    national_id: "National identifiers",
    ip: "IP addresses",
    number: "Numbers",
    path: "File paths",
    secret: "Keys & secrets",
    apikey: "Key-like strings",
  },
  lockedByOrg: "Enforced by your organisation",
  modified: "changed",
  detailAria: (label) => `Detail — ${label}`,
  detailTip: "See what this category covers",
  neutralKind: "item",
  allOn: "Turn everything on",
  allOff: "Turn everything off",
  reset: "Reset — inherit the default settings",
} satisfies Messages["redactionCatalog"];
