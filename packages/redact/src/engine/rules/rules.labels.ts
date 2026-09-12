// The placeholder vocabulary: what a redacted value is REPLACED BY, per rule type.
//
// It lives beside `rules.ts` rather than inside it because it is a different kind of fact —
// `RULES` says what to FIND, this says what the reader SEES — and because the file it came
// from is over the size cap (hard rule 1), so every label added to a growing regex file
// deepened a debt the ratchet exists to drain.
//
// ⚠️ EVERY `RedactionType` MUST appear here. The map is `Record<RedactionType, string>`, so a
// missing entry is a TYPE error — which is the point: a rule type added without a label
// reached `pseudonymize` as `undefined` and took `redactionCategory(undefined)` with it.
import type { RedactionType } from "../../types";

/** Placeholder label per rule type, e.g. `email` → `[REDACTED_EMAIL_1]`. */
export const LABELS: Record<RedactionType, string> = {
  path: "PATH",
  url: "URL",
  secret: "SECRET",
  private_key: "PRIVATE_KEY",
  connection_string: "CONNECTION_STRING",
  jwt: "JWT",
  api_key: "API_KEY",
  google_key: "GOOGLE_KEY",
  aws_key: "AWS_KEY",
  github_token: "GITHUB_TOKEN",
  slack_token: "SLACK_TOKEN",
  bearer: "BEARER_TOKEN",
  cookie: "COOKIE",
  ip: "IP",
  api_token: "TOKEN",
  card: "CARD",
  iban: "IBAN",
  bic: "BIC",
  national_id: "NATIONAL_ID",
  company_id: "COMPANY_ID",
  bank_route: "BANK_ROUTE",
  health: "HEALTH",
  username: "USERNAME",
  dob: "DOB",
  date: "DATE",
  crypto: "CRYPTO",
  mac: "MAC",
  geo: "GEO",
  zipcode: "ZIP",
  phone: "PHONE",
  email: "EMAIL",
};
