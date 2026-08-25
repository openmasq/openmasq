/*
 * Env + harnais de la suite RÉELLE (`../../workflows-real.e2e.ts`) : les VRAIS
 * connecteurs du compte dev, pas les fixtures. Comment c'est possible sans OAuth
 * interactif : les tokens MCP vivent par COMPTE dans le profil de l'app
 * (`accounts/mcp-<uid>.json`, valeurs chiffrées `safeStorage` → Keychain macOS,
 * déchiffrables par le même binaire Electron). On COPIE ce fichier du profil dev
 * vers le profil de test (même pattern que `e2e:login` copie les cookies), on
 * seed une session dont `user.id` est l'uid RÉEL, et `mcp:set-user` →
 * `mcpReconnectStored` reconnecte silencieusement tous les connecteurs stockés.
 * Il faut donc bien LANCER l'app (headless) : hors Electron les tokens sont
 * indéchiffrables et le write gate n'existe pas — et c'est le gate qu'on teste.
 *
 * Le harnais est un DOSSIER (rule 1) : `config` (ce qu'on vise), `launch` (profil
 * adopté + session seedée), `turn` (attendre/diagnostiquer un tour), `gate` (le
 * pont MCP + l'approbateur de la fenêtre non-spoofable).
 */
import { homedir } from "node:os";
import { resolve } from "node:path";
import { BRAND } from "@openmasq/branding";

export const REAL = process.env.E2E_REAL === "1";
/** Modèle PAYANT demandé pour cette suite (les échecs du dossier tofix ont été
 *  observés dessus) — quelques centimes par run, jamais en CI. */
export const REAL_MODEL = process.env.E2E_REAL_MODEL || "poolside/laguna-xs-2.1";
/** Le compte dev visé : celui dont le store MCP du profil porte les connecteurs.
 *
 *  ⚠️ **Aucun défaut en dur, et c'est délibéré.** Ce dépôt est public : un uid Supabase et
 *  une adresse écrits ici désignent un compte RÉEL en production, que quiconque clone
 *  hériterait comme cible. Les deux viennent de l'environnement, et leur absence ARRÊTE la
 *  suite (voir plus bas) plutôt que de la laisser viser le compte de quelqu'un d'autre. */
export const REAL_UID = process.env.E2E_REAL_UID ?? "";
/** L'adresse de ce même compte — sert de sentinelle PII et amorce la session seedée. */
export const REAL_EMAIL = process.env.E2E_REAL_EMAIL ?? "";
/** Le profil qui DÉTIENT les connexions (l'app dev sur cette machine). */
export const REAL_PROFILE =
  process.env.E2E_REAL_PROFILE || resolve(homedir(), `Library/Application Support/${BRAND.name} (Dev)`);
/** Sentinelles PII : des valeurs RÉELLES connues du compte/tenant dev qui ne
 *  doivent JAMAIS apparaître sur le wire (résultats d'outils re-redacted).
 *  Extensible par env (liste séparée par des virgules). */
export const REAL_PII = [
  ...(REAL_EMAIL ? [REAL_EMAIL] : []),
  ...(process.env.E2E_REAL_PII ?? "").split(",").map((s) => s.trim()).filter(Boolean),
];

// Fail closed, et TÔT : sans cible explicite la suite ne doit pas démarrer. Un run muet
// qui vise un uid par défaut copierait le store MCP d'un compte qui n'est pas le vôtre.
if (REAL && (!REAL_UID || !REAL_EMAIL)) {
  throw new Error(
    "E2E_REAL=1 exige E2E_REAL_UID (l'uid Supabase du compte dev) et E2E_REAL_EMAIL " +
      "(son adresse) — aucune valeur par défaut n'est écrite dans ce dépôt.",
  );
}

export const realStoreSource = (): string =>
  resolve(REAL_PROFILE, "accounts", `mcp-${REAL_UID}.json`);
