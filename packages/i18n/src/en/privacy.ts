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
    desc: "Protects less than the default level. For web search and connected tools.",
    short: () => "The minimum: emails, phone numbers, card numbers, IBANs, ID numbers and keys.",
    tradeoff: "Names, usernames, dates, addresses, places and companies stay readable by the model.",
  },
  renforce: {
    label: "Enhanced",
    desc: "The default level. For writing, emails and everyday work.",
    short: () => "Adds names of people and companies, usernames, dates of birth, addresses and places you mention.",
    tradeoff: "An age or a distance calculated from a masked value may be off. The message box warns you.",
  },
  strict: {
    label: "Strict",
    desc: "For analyzing documents.",
    short: (brand) => `Everything ${brand} can detect, without exception.`,
    tradeoff:
      "The model works with substitutes, so calculations and real-world answers may be wrong.",
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
  id: "ID number",
  card: "Card number",
  iban: "IBAN",
  ip: "IP address",
  path: "File path",
  dob: "Date of birth",
  secret: "Secret / key",
} satisfies Messages["redactTypes"];

export const webNav = {
  ariaLabel: "Web browsing: protection level for this search",
  eyebrow: "Web browsing",
  thisMessageOnly: "This message only.",
  keepMasking: "Keep masking",
  title: (level) => `Search the web with ${level} protection?`,
  rest: "Everything else stays masked for the model. Your search query is sent with real values either way.",
} satisfies Messages["webNav"];
