/**
 * LE seul lecteur d'`import.meta.env` du renderer de bureau — même rôle que
 * `apps/web/lib/env.ts` côté console.
 *
 * Avant, seize lectures dans six modules, et les défauts recopiés avec :
 * l'URL de production était écrite TROIS fois (`avis.ts`, `billing.ts`,
 * `sync/client.ts`), l'URL du relais deux fois, `VITE_REDACT_FN_URL` deux fois. Un
 * défaut recopié n'est pas une redondance inoffensive : le jour où l'on pointe
 * l'app ailleurs, il en reste toujours un (règle 9).
 *
 * ⚠️ **La bascule d'environnement à l'exécution passe ICI, et nulle part ailleurs.**
 * Main résout l'environnement (pointeur écrit, sinon production) et le remet en
 * synchrone (`env.resolved()`) ; ce module le préfère aux valeurs bakées. La CI ne
 * bake d'ailleurs PLUS aucune URL (release.yml) — seules les variables `VITE_*` du
 * dev local l'emportent encore. Les consommateurs ne voient rien de tout ça.
 *
 * ⚠️ Un défaut est une VALEUR DE PRODUCTION, jamais un repli silencieux vers du local :
 * une app installée qui ne trouve pas sa variable doit parler au vrai service, pas à
 * rien. La seule exception est `UPDATES_CHANNEL`, voir plus bas.
 *
 * ⚠️ **Le nom n'est pas `env.ts`, et ce n'est pas une préférence.** `env.d.ts` existe
 * déjà dans ce dossier : il porte `/// <reference types="vite/client" />` et la globale
 * `window.openmasq`. Un `env.ts` à côté fait que TypeScript prend `env.d.ts` pour SES
 * déclarations au lieu d'un fichier de globales — et `window.openmasq` comme les types
 * Vite disparaissent de TOUT le renderer, sur des dizaines d'erreurs qui ne pointent pas
 * la cause. Ne pas le renommer `env.ts`.
 */

import { DEFAULT_ENV, ENVIRONMENTS } from "../../environments";

const env = import.meta.env as unknown as Record<string, string | undefined>;

/** Build de développement (`electron-vite dev`), jamais un paquet installé. Interne :
 *  ce qu'on en tire au-dehors, c'est `BUILD_ENV` et `ANALYTICS_DEBUG`. */
const IS_DEV: boolean = Boolean(import.meta.env.DEV);

/**
 * L'environnement de CE build, et les adresses qui vont avec.
 *
 * ⚠️ Les adresses viennent de la table partagée (`src/environments/`), pas de littéraux
 * recopiés ici : main s'en sert aussi (profil `userData`, et demain la bascule), et deux
 * maisons pour « l'URL de l'API » sont deux valeurs à corriger le jour où elle bouge.
 * Une variable `VITE_*` l'emporte toujours — c'est ce qui fait marcher `.env.development`
 * (tout en localhost) et un build de CI pointé ailleurs.
 */
const RESOLVED = window.openmasq?.env?.resolved?.() ?? null;

/** L'environnement effectif de CETTE instance. Main l'a résolu (pointeur écrit, sinon la
 *  production) et le remet en synchrone ; sans lui — preload non redémarré en dev, aperçu
 *  navigateur — la production répond. JAMAIS déduit du canal : un candidat (canal beta)
 *  parle à la production, c'est le contrat de l'artefact unique (`../../environments`). */
const ENV_NAME = RESOLVED?.name ?? DEFAULT_ENV;

// Sans main (aperçu, preload non redémarré), `ENV_NAME` vaut la production : la table cuite
// répond. Une pile saisie n'arrive JAMAIS par ici — seulement résolue par main.
const URLS = RESOLVED ?? ENVIRONMENTS[DEFAULT_ENV];

/** L'API distante de l'app (comptes, facturation, synchro, avis). VIDE = ce build n'a
 *  pas de backend, et c'est un état NORMAL (`../../environments`). */
export const BACKEND_URL: string = env.VITE_BACKEND_URL || URLS.backend;

/**
 * Ce build a-t-il un backend ? C'est LA question dont dépendent les créneaux d'hôte
 * `sync` / `org` / `orgShares` / `billing` / `avis` (`main.tsx`). Absent ⇒ ces surfaces
 * n'existent pas du tout, plutôt que d'exister et de ne répondre jamais : un onglet
 * « Compte » qui tourne dans le vide est pire qu'un onglet absent.
 *
 * ⚠️ Le pendant exact d'`AUTH_CONFIGURED` (`auth.ts`), et il se lit ICI, jamais en
 * recomposant un `!!URL` ailleurs (règle 9).
 */
export const BACKEND_CONFIGURED: boolean = !!BACKEND_URL;

/** Le nom de l'environnement EFFECTIF de cette instance — ce que la bascule a résolu,
 *  pas ce que le canal suggère. Exposé pour être MONTRÉ (Réglages → Synchronisation) :
 *  une app qui ne dit pas à qui elle parle laisse diagnostiquer à l'aveugle. */
export const ENV_DISPLAY_NAME: string = ENV_NAME;

/** Le nom de l'environnement effectif, TYPÉ, pour le slot `host.env` (la carte
 *  Environnement de Réglages → Versions) — l'union discriminée que la bascule attend. */
export const RUNTIME_ENV: "production" | "staging" | "custom" = ENV_NAME;

/** Ce build honore-t-il une pile AUTO-HÉBERGÉE saisie dans l'app ? Cuit au build
 *  (`OPENMASQ_ALLOW_CUSTOM_STACK=1`) et remis par main avec l'environnement résolu ; sans
 *  main (aperçu), non. C'est ce qui fait EXISTER la carte « Pile auto-hébergée » — et le
 *  slot `host.env` même dans un build sans aucun backend cuit, puisque c'est précisément
 *  là qu'on en saisit un. */
export const CUSTOM_STACK_ALLOWED: boolean = RESOLVED?.customStackAllowed === true;

/** La pile saisie déjà connue (pour pré-remplir l'écran), `null` sans. */
export const CUSTOM_STACK = RESOLVED?.customStack ?? null;

/**
 * Le secret d'automatisation Vercel qui laisse passer la protection de déploiement
 * de STAGING (`x-vercel-protection-bypass`, voir `backendFetch.ts`). DEV LOCAL
 * SEULEMENT : depuis l'artefact unique, aucun build de CI n'a le droit de l'embarquer
 * — le même binaire sert tous les canaux, et une garde de build refuse le couple
 * canal + bypass (`electron.vite.config.ts` `assertNoBakedBypass`).
 */
export const BACKEND_BYPASS: string = env.VITE_BACKEND_BYPASS || "";

/** La console d'administration d'organisation, ouverte dans le navigateur système. */
export const ADMIN_URL: string = env.VITE_ADMIN_URL || URLS.admin;

/** Identifiants client Supabase — PUBLICS par nature (clé publiable), donc embarqués. */
export const SUPABASE_URL: string = env.VITE_SUPABASE_URL || URLS.supabaseUrl;
export const SUPABASE_ANON_KEY: string = env.VITE_SUPABASE_ANON_KEY || URLS.supabaseAnonKey;

/**
 * Le canal de mises à jour baké au build (`desktop-beta` / `desktop-stable`).
 *
 * ⚠️ **Vide veut dire « local », JAMAIS « production ».** Seule la CI pose cette
 * variable. Le défaut n'est donc pas une URL de production comme les autres : un
 * ancien ternaire retombait sur `"production"` dès qu'elle était vide, si bien que tout
 * build local — un banc, un spec e2e, un essai — se déguisait en utilisateur réel.
 * Mesuré dans PostHog : 277 « installs » de production sur 278 n'avaient vécu qu'un
 * seul jour, la moitié moins d'une minute. Un chiffre produit ne vaut que ce que vaut
 * ce champ.
 */
const UPDATES_CHANNEL: string = env.VITE_UPDATES_CHANNEL || "";

/**
 * Y a-t-il un FLUX de mises à jour dans ce build ? Même variable que le processus main
 * (`main/updates/config.ts`), doublée ici par un `define` du renderer — sans elle, le
 * créneau `host.updates` reste absent et la carte « Mise à jour » comme l'historique des
 * versions ne s'affichent pas. Se mettre à jour depuis le flux de quelqu'un d'autre,
 * c'est se faire remplacer son binaire : il n'y a donc pas de défaut (dépôt privé `infra`).
 */
export const UPDATES_CONFIGURED: boolean = !!env.VITE_UPDATES_URL;

/**
 * L'environnement estampillé sur chaque événement d'analytics et sur les rapports
 * d'erreur.
 *
 * ⚠️ Il suit l'environnement RÉSOLU quand main l'a remis — sans quoi une install basculée
 * sur staging continuerait de compter comme de la production, et les deux flux se
 * mélangeraient dans les chiffres. `development` et `local` restent des états du BUILD :
 * un `pnpm dev` et un build hors CI n'ont rien à voir avec un environnement déployé, et
 * les confondre est ce qui avait fait passer 277 lancements locaux pour des installs.
 */
export const BUILD_ENV: "development" | "local" | "staging" | "production" | "custom" = IS_DEV
  ? "development"
  : !UPDATES_CHANNEL && !RESOLVED
    ? "local"
    : ENV_NAME;

/** Le relais first-party d'analytics (`apps/analytics-fn`). Le bureau ne détient
 *  JAMAIS de clé PostHog : il POSTe l'enveloppe neutre, le relais la signe. */
/** ⚠️ Aucun défaut : VIDE ⇒ le puits d'analytics est un no-op (`@openmasq/analytics`
 *  n'ouvre de transport ni sans relais ni sans clé) et la carte « Nouveautés » n'a pas
 *  de source — ni l'un ni l'autre ne retombe sur l'hôte de la marque. */
export const ANALYTICS_RELAY_URL: string = env.VITE_ANALYTICS_RELAY_URL || "";

/** Les notes de version, servies par le même service que le relais (`/release-notes`).
 *  `undefined` ⇒ Réglages → Versions montre les versions sans les notes. */
export const RELEASE_NOTES_URL: string | undefined = ANALYTICS_RELAY_URL
  ? `${ANALYTICS_RELAY_URL.replace(/\/e\/?$/, "")}/release-notes`
  : undefined;

/** La clé HMAC d'attestation du build (anti-abus, NON identifiante). Absente en dev. */
export const ANALYTICS_APP_KEY: string | undefined = env.VITE_ANALYTICS_APP_KEY;

/** La version affichée et estampillée sur les événements. */
export const APP_VERSION: string | undefined = env.VITE_APP_VERSION;

/** Journaliser chaque événement d'analytics (envoyé / ignoré + raison). Toujours en
 *  dev ; `VITE_POSTHOG_DEBUG=1` l'allume aussi dans un paquet installé. */
export const ANALYTICS_DEBUG: boolean = IS_DEV || env.VITE_POSTHOG_DEBUG === "1";

/** Le conteneur redact-fn — moteur de redaction cloud ET proxy d'inférence des modèles
 *  inclus. Par environnement, donc résolu par la table (la CI ne le bake plus) ; une
 *  variable `VITE_*` l'emporte encore, c'est le chemin du dev local. */
export const REDACT_FN_URL: string = env.VITE_REDACT_FN_URL || URLS.redactFn;

/** La passerelle est-elle fournie ? Elle sert DEUX choses : le redaction cloud et
 *  l'inférence des modèles « inclus ». Vide ⇒ ni l'un ni l'autre, et les modèles
 *  servis par la plateforme deviennent indisponibles au lieu d'échouer à l'envoi
 *  (`@openmasq/ui` `modelAvailability`). */
export const GATEWAY_CONFIGURED: boolean = !!REDACT_FN_URL;
