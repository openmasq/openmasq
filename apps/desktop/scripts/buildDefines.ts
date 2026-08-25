import { readFileSync } from "fs";
import { resolve } from "path";

// La marque, lue comme dans electron.vite.config.ts : par le JSON, pas le paquet —
// ce module s'évalue au chargement de la config, avant tout build de `dist/`.
const BRAND = JSON.parse(
  readFileSync(resolve(__dirname, "../../../packages/branding/branding.json"), "utf8"),
) as { name: string; domain: string };

/**
 * Les `define` des bundles main et renderer — sortis d'`electron.vite.config.ts`
 * (cap 300 LOC, règle 1) : c'est du VOCABULAIRE d'identifiants, pas de la config de
 * build. ⚠️ AUCUN défaut committé pour un identifiant lié à un compte fournisseur
 * (projet Supabase, DSN Sentry, clients OAuth GitHub/Slack/Google/Microsoft) : un
 * dépôt public qui les embarque fait transiter le trafic de chaque fork par CE
 * compte-là. Non fourni au build ⇒ "" ⇒ la capacité se désactive proprement
 * (pas de comptes, pas de télémétrie, connecteur « non configuré » — « Mes clés »
 * reste disponible). La liste des variables : `apps/desktop/.env.development`.
 */
export function mainDefines(): Record<string, string> {
  return {
    "process.env.VITE_UPDATES_URL": JSON.stringify(process.env.VITE_UPDATES_URL ?? ""),
    "process.env.VITE_UPDATES_CHANNEL": JSON.stringify(process.env.VITE_UPDATES_CHANNEL ?? ""),
    // Desktop-direct MCP connector OAuth client ids (read in main `mcp/connectors`).
    // ⚠️ AUCUN défaut committé : chaque id/secret appartient à un compte fournisseur
    // (GitHub app, Slack app, projet Google Cloud, app Azure) — un dépôt public qui les
    // embarque fait transiter le trafic de chaque fork par CE compte-là. Non fourni au
    // build ⇒ "" ⇒ le connecteur affiche « non configuré » et le mode « Mes clés »
    // reste disponible (le chemin existait déjà pour Microsoft).
    "process.env.OPENMASQ_GITHUB_CLIENT_ID": JSON.stringify(
      process.env.OPENMASQ_GITHUB_CLIENT_ID ?? "",
    ),
    "process.env.OPENMASQ_SLACK_CLIENT_ID": JSON.stringify(
      process.env.OPENMASQ_SLACK_CLIENT_ID ?? "",
    ),
    // The single, environment-independent auth-only relay (apps/auth) serving
    // /slack/*. This is a PUBLIC endpoint (the Slack secret lives server-side in
    // the function, never in the client), so — like the GitHub client id — bake
    // the deployed URL as a committed default so Slack works out of the box; an
    // env override still wins.
    // Default = the PROD auth relay on the brand custom domain. Provision it
    // (Terraform, côté infra) before shipping a build that relies on
    // this default; the legacy raw *.scw.cloud host stays live for shipped builds.
    "process.env.OPENMASQ_AUTH_URL": JSON.stringify(
      process.env.OPENMASQ_AUTH_URL ?? `https://auth.${BRAND.domain}`,
    ),
    // Google "Desktop app" OAuth client — loopback 127.0.0.1 + PKCE. For an INSTALLED
    // app Google's own model treats the client_secret as NON-confidential (PKCE is the
    // real protection; `oauthGoogle.ts` says as much) — mais il reste l'identifiant
    // d'un projet Cloud précis : env uniquement, jamais committé.
    // ⚠️ ONLY safe because it is a "Desktop app" client type — a "Web application"
    // secret WOULD be confidential.
    "process.env.OPENMASQ_GOOGLE_CLIENT_ID": JSON.stringify(
      process.env.OPENMASQ_GOOGLE_CLIENT_ID ?? "",
    ),
    "process.env.OPENMASQ_GOOGLE_CLIENT_SECRET": JSON.stringify(
      process.env.OPENMASQ_GOOGLE_CLIENT_SECRET ?? "",
    ),
    // Microsoft identity platform PUBLIC "Desktop app" client id (loopback + PKCE,
    // NO secret). MULTI-TENANT (`/common`): SharePoint and Teams need a tenant ADMIN
    // to approve THIS app once for their organisation. The refusal a member hits
    // before that approval is turned into the link to forward
    // (`main/mcp/connectors/microsoftConsent.ts`); "Mes clés" stays available.
    "process.env.OPENMASQ_MICROSOFT_CLIENT_ID": JSON.stringify(
      process.env.OPENMASQ_MICROSOFT_CLIENT_ID ?? "",
    ),
    // Le projet Supabase + sa clé PUBLIABLE et le DSN Sentry — lus par
    // `src/environments/index.ts` et `src/sentry/policy.ts`, partagés main/renderer
    // (le même define existe côté renderer). Vides ⇒ pas de comptes / pas de Sentry.
    "process.env.OPENMASQ_SUPABASE_URL": JSON.stringify(
      process.env.OPENMASQ_SUPABASE_URL ?? "",
    ),
    "process.env.OPENMASQ_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
      process.env.OPENMASQ_SUPABASE_PUBLISHABLE_KEY ?? "",
    ),
    "process.env.OPENMASQ_SENTRY_DSN": JSON.stringify(
      process.env.OPENMASQ_SENTRY_DSN ?? "",
    ),
  };
}

/** Le pendant renderer — mêmes identifiants pour les modules PARTAGÉS que le renderer
 *  bundle aussi (`src/environments`, `src/sentry/policy`) : sans ces doublons le
 *  littéral `process.env.…` resterait tel quel et jetterait (pas de `process` dans un
 *  renderer sandboxé). */
export function rendererDefines(pkgVersion: string): Record<string, string> {
  return {
    "import.meta.env.VITE_APP_VERSION": JSON.stringify(process.env.VITE_APP_VERSION ?? pkgVersion),
    // Le MÊME canal que le bundle main, pour que Sentry étiquette les deux processus
    // du même environnement. Sans ce doublon, le renderer serait « development » sur
    // une build de production — et on chercherait les bugs dans le mauvais bac.
    "import.meta.env.VITE_UPDATES_CHANNEL": JSON.stringify(process.env.VITE_UPDATES_CHANNEL ?? ""),
    // Doublons des define du main pour les modules PARTAGÉS que le renderer bundle
    // aussi (`src/environments/index.ts` via appEnv, `src/sentry/policy.ts` via
    // sentry/renderer) : sans eux, le littéral `process.env.…` resterait tel quel et
    // jetterait (`process` n'existe pas dans un renderer sandboxé).
    "process.env.OPENMASQ_SUPABASE_URL": JSON.stringify(
      process.env.OPENMASQ_SUPABASE_URL ?? "",
    ),
    "process.env.OPENMASQ_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
      process.env.OPENMASQ_SUPABASE_PUBLISHABLE_KEY ?? "",
    ),
    "process.env.OPENMASQ_SENTRY_DSN": JSON.stringify(
      process.env.OPENMASQ_SENTRY_DSN ?? "",
    ),
  };
}
