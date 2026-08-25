import { BRAND } from "@openmasq/branding";
import type { ConnectorScopes } from "@openmasq/connectors";

/**
 * Le mode d'identifiants « intégré » d'un connecteur (les clés OAuth de la plateforme,
 * par opposition à `"byo"` — les clés de l'utilisateur).
 *
 * ⚠️ Sa VALEUR est PERSISTÉE (`accounts/mcp-<uid>.json` du parc installé) et vaut le slug
 * de la marque : elle vient donc de `@openmasq/branding` (règle 9) et ne se renomme pas —
 * la changer orphelinerait les connecteurs déjà configurés. Le type reste `string` : un
 * littéral de type ne peut pas dériver d'un JSON, et la seule comparaison qui décide est
 * `=== "byo"` (tout le reste est le mode intégré).
 */
export const BUILTIN_CRED_MODE: string = BRAND.slug;

/** `BUILTIN_CRED_MODE` ou `"byo"` — voir ci-dessus pour le type large. */
export type CredMode = string;

/** Les scopes du mode demandé. Le champ `managed` de `ConnectorScopes` est NEUTRE :
 *  seul le mode PERSISTÉ (`BUILTIN_CRED_MODE`) porte le slug de la marque. */
export const scopesForMode = (scopes: ConnectorScopes, mode?: string): string[] =>
  mode === "byo" ? scopes.byo : scopes.managed;
