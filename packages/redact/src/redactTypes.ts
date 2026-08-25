/**
 * The curated data types offered by every MANUAL-redaction surface (the
 * composer's "Redact" menu, the Coffre's type picker — desktop, mobile AND
 * the extension popup). Each maps to the canonical pseudonymize category TOKEN
 * (uppercase, what the model/regex layers emit) so `fakeFor` produces a
 * same-kind fake and the send redacted it as that type. Lives HERE (rule 9:
 * one source) because the tokens are THIS engine's vocabulary; `@openmasq/ui`
 * re-exports it unchanged.
 */
export interface RedactType {
  /** Stable key (also the family key for the highlight hue). */
  key: string;
  /** FR label shown in the picker. */
  label: string;
  /** Canonical pseudonymize category token passed to the engine. */
  token: string;
}

export const REDACT_TYPES: RedactType[] = [
  { key: "name", label: "Nom", token: "NAME" },
  { key: "username", label: "Pseudo", token: "USERNAME" },
  { key: "email", label: "E-mail", token: "EMAIL" },
  { key: "phone", label: "Téléphone", token: "PHONE" },
  { key: "company", label: "Entreprise", token: "ORG" },
  { key: "address", label: "Adresse", token: "ADDRESS" },
  { key: "city", label: "Ville", token: "CITY" },
  { key: "id", label: "Identifiant", token: "ID" },
  { key: "card", label: "Carte bancaire", token: "CARD" },
  { key: "iban", label: "IBAN", token: "IBAN" },
  { key: "ip", label: "Adresse IP", token: "IP" },
  { key: "path", label: "Chemin de fichier", token: "PATH" },
  { key: "dob", label: "Date de naissance", token: "DOB" },
  { key: "secret", label: "Secret / clé", token: "SECRET" },
];
