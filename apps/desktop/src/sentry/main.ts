import { app } from "electron";
import * as Sentry from "@sentry/electron/main";
import { resolveEnvironment, sentryBeforeSend, SENTRY_DSN } from "./policy";

/**
 * Sentry pour le processus MAIN — et, du même geste, pour les DEUX helpers, puisqu'ils
 * ré-entrent par `main/index.ts` (navigateur agent, @playwright/mcp). L'étiquette
 * `process` dit lequel a planté ; sans elle, trois processus se ressemblent dans le
 * tableau de bord.
 *
 * ⚠️ `defaultIntegrations: false` — c'est la décision structurante de ce fichier.
 * Les intégrations par défaut du SDK sont, ici, un déversoir de données réelles :
 *   · `SentryMinidump` téléverse un vidage NATIF, c'est-à-dire la MÉMOIRE du processus —
 *     le coffre, les clés, les prompts en clair. Le plus dangereux du lot, et il est
 *     activé en premier par défaut ;
 *   · `LocalVariables` attache la VALEUR des variables locales aux frames ;
 *   · `ContextLines` joint le code source autour de la ligne ;
 *   · `Screenshots` capture la fenêtre — donc la conversation à l'écran ;
 *   · `Console` / `ElectronBreadcrumbs` / `ElectronNet` transforment les logs et les URL
 *     visitées en fil d'Ariane — or une URL du navigateur agent porte la VRAIE valeur
 *     (règle 11), et c'est précisément ce que le produit protège partout ailleurs.
 * On énumère donc ce qui est PERMIS (règle 7). Une future version du SDK qui ajouterait
 * un défaut bavard n'a rien à re-neutraliser : il n'entre pas.
 */
export function initSentryMain(mode: "app" | "agent-browser" | "playwright-mcp", packaged: boolean): void {
  // ⚠️ Une app NON EMPAQUETÉE ne rapporte pas. Un `electron-vite dev` est un poste de
  // développement : ses pannes se lisent dans la console qu'on a déjà sous les yeux, et
  // elles arrivaient jusqu'ici dans le MÊME projet que celles des utilisateurs — 983 des
  // 1710 événements, soit 57 % du tableau, produits par nous. Un canal de plantage ne vaut
  // que par ce qu'on peut y lire. `OPENMASQ_SENTRY_DEV=1` rouvre la vanne pour vérifier le
  // tuyau lui-même (sinon plus personne ne peut tester ce fichier).
  if (!packaged && process.env.OPENMASQ_SENTRY_DEV !== "1") return;
  // Pas de DSN fourni au build ⇒ pas de télémétrie du tout — jamais un projet par défaut.
  if (!SENTRY_DSN) return;
  const channel = process.env.VITE_UPDATES_CHANNEL || "";
  Sentry.init({
    dsn: SENTRY_DSN,
    environment: resolveEnvironment(channel),
    // ⚠️ `app.getVersion()`, PAS `process.env.VITE_APP_VERSION` : ce define-là n'existe
    // que dans le bundle RENDERER (`electron.vite.config.ts`), donc ici il vaut `undefined`
    // — et un rapport sans version ne se rattache à aucune release.
    release: app.getVersion(),
    defaultIntegrations: false,
    integrations: [
      // Les DEUX entonnoirs qui comptent : ce qui remonte non rattrapé.
      Sentry.onUncaughtExceptionIntegration(),
      Sentry.onUnhandledRejectionIntegration(),
      // Les plantages d'ENFANTS — le poste le plus probable de cette app : le navigateur
      // agent (CDP, pages non fiables), le bac à sable Python, les workers NER/fs.
      // ⚠️ `events` EXPLICITE : le défaut du SDK ne promeut en événement que
      // `abnormal-exit`/`launch-failed`/`integrity-failure` — `crashed` et `oom` (un
      // segfault onnxruntime du worker NER, l'embed tué sous ses 120 Mo) ne devenaient que
      // des breadcrumbs, que ce fichier annihile deux fois (audit 13/08). `killed` et
      // `clean-exit` restent EXCLUS : l'éviction d'inactivité des workers tue proprement
      // toutes les 10 min — les promouvoir serait du bruit par construction. Le NOM du
      // worker fautif vient des rapports par client (`localNer`/`embed`/`fs`/`broker`),
      // pas d'ici : le SDK ne met `serviceName` que dans les breadcrumbs.
      Sentry.childProcessIntegration({
        events: ["abnormal-exit", "launch-failed", "integrity-failure", "crashed", "oom"],
      }),
      // `cause`/`AggregateError` : une erreur enveloppée garde sa vraie racine.
      Sentry.linkedErrorsIntegration(),
      // Rend les chemins RELATIFS à l'app avant que `scrubEvent` ne passe — les deux se
      // complètent : celle-ci normalise, celui-là garantit.
      Sentry.normalizePathsIntegration(),
    ],
    // Ceinture ET bretelles : `scrubEvent` ne recopie de toute façon pas les fils
    // d'Ariane, mais ne pas les CONSTRUIRE évite de les tenir en mémoire au passage.
    beforeBreadcrumb: () => null,
    // La reconstruction en liste d'autorisation. Tout part d'ici, ou ne part pas.
    beforeSend: (event) => sentryBeforeSend(event as never) as never,
    // Pas d'IP, pas de cookies, pas d'en-têtes : le défaut, réaffirmé parce qu'un jour
    // quelqu'un lira cette ligne en se demandant si on l'avait décidé.
    sendDefaultPii: false,
    // Aucune trace de performance : elles nomment des routes et des requêtes.
    tracesSampleRate: 0,
    initialScope: { tags: { process: mode, channel: channel || "dev", packaged: String(packaged) } },
  });
}
