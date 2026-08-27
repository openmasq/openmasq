/**
 * Les `define` des bundles main et renderer — sortis d'`electron.vite.config.ts`
 * (cap 300 LOC, règle 1) : c'est du VOCABULAIRE d'identifiants, pas de la config de
 * build. ⚠️ AUCUN défaut committé — ni pour un identifiant lié à un compte fournisseur
 * (projet Supabase, DSN Sentry, clients OAuth GitHub/Slack/Google/Microsoft), NI pour
 * l'adresse d'un service (backend, passerelle, relais auth, flux de mises à jour) : un
 * dépôt public qui les embarque fait transiter le trafic de chaque fork par CE
 * compte-là, et propose à ses utilisateurs un SaaS qui n'est pas le leur. Non fourni au
 * build ⇒ "" ⇒ la capacité se désactive proprement (pas de comptes, pas de facturation,
 * pas de synchro, pas de modèles inclus, pas de télémétrie, connecteur « non
 * configuré ») et l'app tourne sur la machine — clés perso, modèles locaux, CLI
 * d'abonnement, redaction on-device. La liste complète et comment déployer les siens :
 * `SELF_HOSTING.md` ; les valeurs de DEV : `apps/desktop/.env.development`.
 */
/** Les adresses des services first-party (backend + passerelle, par environnement) —
 *  UNE liste, injectée dans les deux bundles : `src/environments/index.ts` est partagé
 *  main/renderer, et un define manquant d'un côté laisserait le littéral `process.env.…`
 *  tel quel (il jette dans un renderer sandboxé). Vide = capacité absente, jamais un
 *  repli sur les serveurs de la marque. */
function SERVICE_DEFINES(): Record<string, string> {
  return Object.fromEntries(
    [
      "OPENMASQ_BACKEND_URL",
      "OPENMASQ_BACKEND_URL_STAGING",
      "OPENMASQ_GATEWAY_URL",
      "OPENMASQ_GATEWAY_URL_STAGING",
    ].map((name) => [`process.env.${name}`, JSON.stringify(process.env[name] ?? "")]),
  );
}

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
    // Le relais auth-only (apps/auth) qui sert /slack/* — l'échange code→jeton que
    // Slack interdit de faire sur l'appareil (il exige un secret client). L'endpoint est
    // PUBLIC (le secret vit dans la fonction, jamais dans le client), mais il reste le
    // déploiement de QUELQU'UN : pas de défaut committé non plus, sinon l'OAuth Slack de
    // chaque fork passerait par le relais de la marque. Vide ⇒ le connecteur Slack dit
    // « non configuré » (`main/mcp/connectors/oauthSlack.ts`) et les autres marchent.
    "process.env.OPENMASQ_AUTH_URL": JSON.stringify(process.env.OPENMASQ_AUTH_URL ?? ""),
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
    // Les ADRESSES des services, même règle que les identifiants ci-dessus : aucun
    // défaut committé. Vides ⇒ l'app n'a ni backend (comptes/facturation/synchro/avis/
    // orga) ni passerelle (redaction cloud + modèles inclus) — elle tourne sur la
    // machine. Lues par `src/environments/index.ts`, partagées main/renderer.
    // Déployer les siennes : `SELF_HOSTING.md`.
    ...SERVICE_DEFINES(),
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
    // Le renderer ne décide pas des mises à jour, mais il décide s'il en MONTRE l'écran :
    // sans flux, `host.updates` reste absent (`appEnv.ts` UPDATES_CONFIGURED). Même
    // variable que le bundle main, doublée pour la même raison que le canal.
    "import.meta.env.VITE_UPDATES_URL": JSON.stringify(process.env.VITE_UPDATES_URL ?? ""),
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
    ...SERVICE_DEFINES(),
  };
}
