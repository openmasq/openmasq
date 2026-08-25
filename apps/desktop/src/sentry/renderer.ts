import * as Sentry from "@sentry/electron/renderer";
import { resolveEnvironment, sentryBeforeSend } from "./policy";

/**
 * Sentry pour le RENDERER — l'interface, donc l'endroit où une erreur est la plus visible
 * par l'utilisateur.
 *
 * ⚠️ **Pas de DSN ici, et ce n'est pas un oubli.** Le CSP du renderer
 * (`renderer/index.html`) énumère les hôtes joignables et Sentry n'y est PAS : un envoi
 * direct serait bloqué net. Le SDK renderer passe donc par IPC vers le main, qui possède
 * le DSN — c'est le mode nominal d'`@sentry/electron`, et il a le bon effet de bord ici :
 * un seul point d'egress, celui qu'on a déjà audité. Le pont est ouvert par
 * `@sentry/electron/preload`, importé dans `preload/index.ts` (obligatoire sous
 * `contextIsolation`).
 *
 * ⚠️ `defaultIntegrations: false` pour la même raison que côté main, avec un défaut
 * propre au navigateur qui serait ici particulièrement mauvais : `Breadcrumbs` enregistre
 * les clics DOM **avec le texte de l'élément** — donc le titre d'une conversation, le nom
 * d'un contact, un extrait de message. Et `contextLines` joint le code source.
 */
export function initSentryRenderer(): void {
  // Le pendant côté renderer du garde `app.isPackaged` du main : `import.meta.env.DEV` est
  // vrai sous `electron-vite dev` et faux dans tout bundle CONSTRUIT — c'est la même
  // frontière, exprimée avec ce que ce processus peut voir. Même échappatoire, en `VITE_`
  // puisque `process.env` n'existe pas ici.
  if (import.meta.env.DEV && import.meta.env.VITE_SENTRY_DEV !== "1") return;
  const channel = import.meta.env.VITE_UPDATES_CHANNEL || "";
  Sentry.init({
    environment: resolveEnvironment(channel),
    release: import.meta.env.VITE_APP_VERSION || undefined,
    defaultIntegrations: false,
    integrations: [
      // ⚠️ Les gestionnaires `error`/`unhandledrejection` sont une intégration PAR DÉFAUT
      // (`globalHandlers`) — donc RETIRÉE par `defaultIntegrations: false`. Une version
      // antérieure de ce fichier affirmait que « le SDK les pose de lui-même » : c'était
      // faux, et le renderer — le processus que l'utilisateur regarde — n'a envoyé AUCUNE
      // stack à Sentry tant que cette ligne a manqué (audit observabilité 13/08).
      Sentry.globalHandlersIntegration(),
      // Même événement re-signalé deux fois (React error boundary + window.onerror) → un seul.
      Sentry.dedupeIntegration(),
      // Les erreurs déjà enveloppées gardent leur racine.
      Sentry.linkedErrorsIntegration(),
    ],
    beforeBreadcrumb: () => null,
    beforeSend: (event) => sentryBeforeSend(event as never) as never,
    sendDefaultPii: false,
    tracesSampleRate: 0,
    // Pas d'`initialScope` : le SDK Electron le SUPPRIME côté renderer (code mort vérifié) ;
    // l'attribution du processus vient du tag `event.process` posé au relais et allow-listé
    // par `policy.ts`.
  });
}
