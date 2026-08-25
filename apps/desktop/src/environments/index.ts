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
import { brandUrl } from "@openmasq/branding";

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

export type EnvName = "production" | "staging";

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

export const ENVIRONMENTS: Record<EnvName, EnvUrls> = {
  production: {
    backend: brandUrl("app"),
    admin: brandUrl("app", "/admin"),
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: SUPABASE_PUBLISHABLE_KEY,
    redactFn: brandUrl("gateway"),
  },
  staging: {
    backend: brandUrl("staging"),
    admin: brandUrl("staging", "/admin"),
    // Le MÊME projet Supabase que la production : les comptes sont partagés, seule
    // l'API de l'app diffère. Le jour où staging aura son propre projet, c'est une
    // seconde paire de variables à introduire ici, et nulle part ailleurs.
    supabaseUrl: SUPABASE_URL,
    supabaseAnonKey: SUPABASE_PUBLISHABLE_KEY,
    redactFn: brandUrl("gateway-staging"),
  },
};

/** La valeur par défaut, et la réponse à toute entrée qu'on ne reconnaît pas. */
export const DEFAULT_ENV: EnvName = "production";

/** `true` si `value` est un nom d'environnement connu — l'allow-list, en une fonction. */
export function isEnvName(value: unknown): value is EnvName {
  return value === "production" || value === "staging";
}
