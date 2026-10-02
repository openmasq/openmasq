/**
 * The EN catalogue's « redactionCatalog » slice — translated from the source (`../fr/redactionCatalog.ts`).
 * ⚠️ `detail` and `impact` say what is masked and what it costs the reply (rule 8):
 * translated word for word. `satisfies` per entry.
 */
import type { Messages } from "../messages";

export const redactionCatalog = {
  categories: {
    name: {
      label: "Names",
      detail:
        "First names, last names and full names found by on-device detection, including in ALL CAPS, run together or in a labeled field (Name:, First name(s):). Public figures are not masked by default.",
    },
    dob: {
      label: "Date of birth",
      detail:
        "Dates of birth (born on…, date of birth, FR/EN/DE formats), including labeled fields. Other dates fall under “Dates”, off by default.",
      impact:
        "When masked, an age or time period the model calculates may be off: the substitute date also hides the real birth year, which can identify someone. The date shown to you is always the real one.",
    },
    date: {
      label: "Dates",
      detail:
        "All other dates, in digits (12/05/2024, 2024-05-12, 20240512) or in words (12 May 2024, May 12, 2024, May 2024), and clock times (14:30, 8:15 AM, 07h30), in the app's languages. Off by default; the Strict level turns it on. Years alone and durations are never masked.",
      impact:
        "When masked, durations, deadlines and timelines the model calculates use substitute dates. They are shifted by a few years but stay consistent with each other. The real dates are always restored.",
    },
    username: {
      label: "Username / handle",
      detail: "@handles and login / username / nickname fields.",
    },
    email: {
      label: "Email",
      detail:
        "Email addresses. The substitute keeps a matching first name, so a greeting like “Hello X” still maps back correctly.",
    },
    phone: {
      label: "Phone",
      detail:
        "French and international phone numbers (+33, 00…). International numbers are checked against each country's numbering rules.",
    },
    address: {
      label: "Postal address",
      detail:
        "Full addresses in many languages (FR/EN/DE/ES/IT/PT/NL + CJK), replaced by a realistic address in the same country, in a different region.",
      impact:
        "When masked, the address stays consistent (same country, same format), but any geographic reasoning (distance, proximity, area) applies to the substitute place.",
    },
    location: {
      label: "Place / city / ZIP code",
      detail:
        "Cities, ZIP and postal codes, regions, places of birth. Countries are never masked (general knowledge).",
      impact:
        "When masked, distances, routes and jurisdictions are reasoned about using substitute places. They stay consistent with each other, but not with the real map.",
    },
    company: {
      label: "Company",
      detail:
        "Company and organization names found by on-device detection. Major brands, products and well-known indices are not masked by default. Registration numbers (SIREN, VAT…) fall under “Company identifiers”.",
      impact:
        "When masked, the model knows nothing about the company (industry, size, labor agreements), because the substitute name is fictitious.",
    },
    card: {
      label: "Credit/debit card",
      detail: "13–19-digit card numbers checked with the Luhn algorithm. Spaces and dashes are allowed.",
    },
    iban: {
      label: "IBAN / bank details",
      detail:
        "IBAN (mod-97), BIC/SWIFT, and routing codes: ABA (US), sort code (UK), BSB (AU), CLABE (MX), IFSC (IN), labeled account numbers.",
    },
    national_id: {
      label: "National ID / passport / license",
      detail:
        "Identity documents from 40+ countries: national ID cards, passports, French NIR/social security, driver's licenses, residence permits, tax numbers, MRZ of scanned documents, SSN/ITIN, NHS, PESEL, Swiss AVS, Belgian register, Brazilian CPF, Chinese ID card, HKID, My Number… plus license plates, VIN and IMEI. Check digits are verified when the country publishes one.",
    },
    company_id: {
      label: "Company identifiers",
      detail:
        "SIREN/SIRET/RCS, intra-EU VAT (FR + EU), LEI, trade registers (German HR, Singapore UEN, Australian ABN/ACN, Brazilian CNPJ, US EIN), organization numbers.",
    },
    ip: {
      label: "IP address",
      detail: "IPv4, IPv6 (including compressed :: forms) and MAC addresses, replaced by valid addresses.",
    },
    path: {
      label: "File paths",
      detail:
        "Absolute paths (macOS/Windows/Linux) and personal file and folder names (documents, images, archives). Source code is not targeted.",
    },
    url: {
      label: "Web addresses (URL)",
      detail:
        "Masks the whole URL (domain, path and parameters), not just what it contains. When off, URLs stay readable and nothing inside them is masked by mistake (file names, page cache tokens), but keys inside them are still masked. On at the Strict level, for document review.",
    },
    secret: {
      label: "Keys & secrets",
      detail:
        "Access keys (OpenAI, AWS, Stripe, GitHub, Slack…), sign-in tokens, private keys, passwords, OTP/PIN codes, crypto wallets.",
    },
    apikey: {
      label: "Key-like strings (generic)",
      detail:
        "Broad rule: masks any string that looks like a key (a long mix of letters and digits). On at every privacy level, because a missed key would be sent unmasked. It can also catch harmless product codes.",
    },
  },
  sections: {
    Identité: "Identity",
    Contact: "Contact",
    Localisation: "Location",
    Organisation: "Organization",
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
    date: "Dates",
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
  lockedByOrg: "Set by your organization",
  modified: "changed",
  detailAria: (label) => `Detail — ${label}`,
  detailTip: "See what this category covers",
  neutralKind: "item",
  allOn: "Turn everything on",
  allOff: "Turn everything off",
  reset: "Reset to defaults",
} satisfies Messages["redactionCatalog"];
