/**
 * The EN catalogue's « privacy » slice — translated from the source (`../fr/`).
 *
 * `satisfies` per entry: the compiler demands EXACTLY the contract's keys
 * (`../messages/privacy.ts`), no more and no less, slice by slice — so a forgotten
 * key names ITS slice rather than the whole catalogue.
 */
import type { Messages } from "../messages";

export const privacyLevels = {
  // The id stays `standard` (persisted in the settings); only the LABEL says what the
  // level is — the one below the default.
  standard: {
    label: "Light",
    desc: "For web search and connected tools — protects less than the default.",
    short: () => "The bare minimum: emails, phone numbers, bank cards, IBANs, identifiers and keys.",
    tradeoff: "Names, dates, addresses, places and companies stay readable by the model.",
  },
  renforce: {
    label: "Reinforced",
    desc: "For writing, emails and everyday exchanges — the default level.",
    short: () => "Adds the people's and company names, dates of birth, addresses and places you mention.",
    tradeoff: "An age or a distance computed on a masked value may be off — the composer flags it.",
  },
  strict: {
    label: "Strict",
    desc: "For documents to analyse.",
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
  title: (level) => `Search the web at the ${level} level?`,
  rest: "Everything else stays masked, and your query leaves with the real value either way.",
} satisfies Messages["webNav"];
