/**
 * LES environnements que ce binaire sait joindre — une table, cuite, indexée par une clé
 * ÉNUMÉRÉE. Importée par main ET par le renderer (comme `src/sentry/`), pour qu'il n'y ait
 * qu'une maison à ces adresses.
 *
 * ⚠️ **La clé est un nom, jamais une URL, et c'est la garde la plus importante du dossier.**
 * Ce qui est persisté puis relu est `"staging"` ou `"production"` — pas une adresse. Une URL
 * libre dans un fichier que l'utilisateur peut éditer (ou qu'un renderer compromis peut
 * faire écrire) vaudrait egress arbitraire depuis un binaire signé, notarisé, qui détient le
 * trousseau. Une clé inconnue retombe sur la production, jamais sur ce qu'elle prétend être.
 *
 * ⚠️ **L'environnement ne se DÉDUIT jamais du canal de mises à jour.** C'est le contrat de
 * l'artefact unique : le même binaire sert les candidats (canal beta) et le parc (canal
 * stable), et TOUS parlent à la production — un candidat est le vrai logiciel en avance,
 * pas un environnement de test. Le seul chemin vers staging est le pointeur ÉCRIT par la
 * bascule privilégiée (`main/environment.ts`). L'ancienne dérivation canal→environnement
 * (`envNameForChannel`) a été retirée pour que personne ne puisse la rebrancher « parce
 * qu'elle était là ».
 *
 * ⚠️ Ces valeurs ne sont PAS des secrets : des adresses publiques et la clé publiable
 * Supabase. Le bypass Vercel de staging n'est PAS ici et n'a pas à y être — un artefact
 * unique le livrerait à tout le monde (voir `apps/desktop/CLAUDE.md`).
 */
/**
 * ⚠️ **AUCUNE adresse n'a de défaut committé, et c'est le contrat open source.** Un
 * dépôt public dont le build retomberait sur les serveurs de la marque enverrait le
 * trafic de chaque fork chez elle, et proposerait à ses utilisateurs de se connecter à
 * un SaaS qui n'est pas le leur. Chaque service arrive donc au BUILD ; **vide ⇒ la
 * capacité n'existe pas** (ni comptes, ni facturation, ni synchro, ni passerelle), et
 * l'app tourne entièrement sur la machine : clés perso, modèles locaux, CLI
 * d'abonnement, redaction on-device. Même règle que les identifiants OAuth et le DSN
 * Sentry (`scripts/buildDefines.ts`), étendue aux adresses. Comment fournir sa propre
 * pile : le dépôt privé `infra`.
 */

/**
 * Les identifiants du PROJET Supabase ne sont PLUS committés : ils arrivent au BUILD
 * (`OPENMASQ_SUPABASE_URL` / `OPENMASQ_SUPABASE_PUBLISHABLE_KEY`, cuits en littéraux
 * par les `define` d'electron.vite.config.ts — main ET renderer). Vides ⇒ l'app tourne
 * SANS comptes : `auth.ts` ne construit pas de client et le créneau `host.auth` reste
 * absent (pas de porte de connexion) — fail-closed, jamais le projet de quelqu'un d'autre.
 * En dev, `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` (`.env.development` → GoTrue
 * local) l'emportent toujours (`appEnv.ts`).
 */
const SUPABASE_URL = process.env.OPENMASQ_SUPABASE_URL ?? "";
const SUPABASE_PUBLISHABLE_KEY = process.env.OPENMASQ_SUPABASE_PUBLISHABLE_KEY ?? "";

/** L'API distante (comptes, facturation, synchro, avis, orga) et la passerelle
 *  (redaction cloud + inférence des modèles inclus), par environnement. Vides ⇒ ces
 *  créneaux d'hôte n'existent pas (`appEnv.ts` : `BACKEND_CONFIGURED` /
 *  `GATEWAY_CONFIGURED`). La console d'admin n'a PAS sa variable : elle est servie par
 *  le backend, donc dérivée de lui — deux adresses pour un seul déploiement seraient
 *  deux occasions de diverger (règle 9). */
const BACKEND = process.env.OPENMASQ_BACKEND_URL ?? "";
const BACKEND_STAGING = process.env.OPENMASQ_BACKEND_URL_STAGING ?? "";
const GATEWAY = process.env.OPENMASQ_GATEWAY_URL ?? "";
const GATEWAY_STAGING = process.env.OPENMASQ_GATEWAY_URL_STAGING ?? "";

/** La console d'admin vit SOUS le backend (`/admin`). Pas de backend, pas de console —
 *  jamais un `/admin` orphelin qui ouvrirait une page blanche. */
const adminOf = (backend: string): string =>
  backend ? `${backend.replace(/\/+$/, "")}/admin` : "";

/** Les environnements CUITS — ceux dont la table ci-dessous porte les adresses. */
export type BuiltEnvName = "production" | "staging";

/**
 * Tous les noms qu'un pointeur peut porter. `"custom"` est la pile AUTO-HÉBERGÉE
 * (`customStack.ts`) : ses adresses ne sont pas ici, elles vivent dans le pointeur écrit
 * par main — et le nom n'est HONORÉ que dans un build qui l'autorise
 * (`OPENMASQ_ALLOW_CUSTOM_STACK=1`) ; ailleurs il se relit comme la production.
 */
export type EnvName = BuiltEnvName | "custom";

export interface EnvUrls {
  /** L'API distante de l'app (comptes, facturation, synchro, avis). */
  backend: string;
  /** La console d'administration d'organisation, ouverte dans le navigateur système. */
  admin: string;
  /** Le projet Supabase et sa clé PUBLIABLE (identifiants client, publics par nature). */
  supabaseUrl: string;
  supabaseAnonKey: string;
  /** Le conteneur gateway/redact-fn (redaction cloud + inférence des modèles inclus).
   *  Hostnames canoniques tenus par Terraform, côté infra. */
  redactFn: string;
}

export const ENVIRONMENTS: Record<BuiltEnvName, EnvUrls> = {
  production: {
    backend: BACKEND,
    admin: adminOf(BACKEND),
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: SUPABASE_PUBLISHABLE_KEY,
    redactFn: GATEWAY,
  },
  staging: {
    backend: BACKEND_STAGING,
    admin: adminOf(BACKEND_STAGING),
    // Le MÊME projet Supabase que la production : les comptes sont partagés, seule
    // l'API de l'app diffère. Le jour où staging aura son propre projet, c'est une
    // seconde paire de variables à introduire ici, et nulle part ailleurs.
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: SUPABASE_PUBLISHABLE_KEY,
    redactFn: GATEWAY_STAGING,
  },
};

/** La valeur par défaut, et la réponse à toute entrée qu'on ne reconnaît pas. */
export const DEFAULT_ENV: BuiltEnvName = "production";

/** `true` si `value` est un nom d'environnement connu — l'allow-list, en une fonction.
 *  `"custom"` en fait partie : c'est un NOM ; ce que le nom vaut (des adresses saisies)
 *  se décide ailleurs, et seulement dans un build qui l'autorise. */
export function isEnvName(value: unknown): value is EnvName {
  return value === "production" || value === "staging" || value === "custom";
}

/** `true` pour un environnement dont les adresses sont CUITES (indexable dans la table). */
export function isBuiltEnvName(value: unknown): value is BuiltEnvName {
  return value === "production" || value === "staging";
}
