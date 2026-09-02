/**
 * The EN catalogue's « privacy » slice — translated from the source (`../fr/`).
 *
 * `satisfies` per entry: the compiler demands EXACTLY the contract's keys
 * (`../messages/privacy.ts`), no more and no less, slice by slice — so a forgotten
 * key names ITS slice rather than the whole catalogue.
 */
import type { Messages } from "../messages";

export const privacyLevels = {
  standard: {
    label: "Standard",
    desc: "Ideal for agentic use of the web.",
    short: () =>
      "The bare minimum on your personal data: emails, phone numbers, bank cards, IBANs, identifiers and keys.",
    tradeoff: "Names, dates, addresses, places and companies stay readable by the model.",
  },
  renforce: {
    label: "Reinforced",
    desc: "Ideal for agentic use away from the web.",
    short: () => "Goes further: adds the people's and company names, dates of birth, addresses and places you mention.",
    tradeoff: "An age or a distance computed on a masked value may be off — the composer flags it.",
  },
  strict: {
    label: "Strict",
    desc: "Ideal for analysing documents.",
    short: (brand) => `Everything ${brand} can detect, without exception.`,
    tradeoff:
      "The model reasons on fictitious values: calculations and answers about the real world may be wrong.",
  },
} satisfies Messages["privacyLevels"];

export const redactTypes = {
  name: "Name",
  username: "Username",
  email: "Email",
  phone: "Phone",
  company: "Company",
  address: "Address",
  city: "City",
  id: "Identifier",
  card: "Bank card",
  iban: "IBAN",
  ip: "IP address",
  path: "File path",
  dob: "Date of birth",
  secret: "Secret / key",
} satisfies Messages["redactTypes"];

export const webNav = {
  ariaLabel: "Web browsing — protection level for this search",
  eyebrow: "Web browsing",
  thisMessageOnly: "This message only.",
  keepMasking: "Keep the masking",
  switchTo: (level) => `Switch to ${level}`,
  title: (level) => `Search the web at ${level} protection?`,
  rest: "Everything else stays masked, and your query leaves with the real value either way.",
} satisfies Messages["webNav"];
