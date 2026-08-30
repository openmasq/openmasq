/**
 * La DÉCISION de la bascule d'environnement, et la charge que le renderer reçoit — sans
 * Electron, sans disque, sans réseau.
 *
 * Séparée du branchement (`registerEnvIpc.ts`) pour une raison mécanique autant que de
 * principe : celui-ci tire `updates/channel` pour la permission serveur, donc
 * `electron-updater`, qui ne se charge pas hors d'Electron. Une porte qui ne peut pas être
 * testée finit par n'être vérifiée que de tête.
 */
import { ENVIRONMENTS, isBuiltEnvName, isEnvName, type EnvName, type EnvUrls } from "../../environments";
import { CUSTOM_STACK_ALLOWED, customEnvUrls, type CustomStack } from "../../environments/customStack";

/** L'état que le renderer lit AU CHARGEMENT, en synchrone : il en a besoin avant de créer
 *  le client Supabase, donc avant tout aller-retour asynchrone. Rien de secret ici —
 *  un nom, des adresses publiques, et la pile saisie (des adresses publiques et une clé
 *  PUBLIABLE) pour pré-remplir l'écran. */
export interface ResolvedEnv {
  name: EnvName;
  backend: string;
  admin: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  redactFn: string;
  /** Ce build honore-t-il une pile saisie ? Cuit au build (`OPENMASQ_ALLOW_CUSTOM_STACK`). */
  customStackAllowed: boolean;
  /** La pile saisie connue du pointeur — `null` sans, ou dans un build qui ne l'honore pas. */
  customStack: CustomStack | null;
}

const EMPTY: EnvUrls = { backend: "", admin: "", supabaseUrl: "", supabaseAnonKey: "", redactFn: "" };

/** Les adresses d'un environnement — cuites pour production/staging, saisies pour custom.
 *  Un `custom` sans pile est VIDE, jamais un repli sur la production : ce serait
 *  précisément parler à un backend que l'utilisateur n'a pas choisi. */
export function envUrls(name: EnvName, custom: CustomStack | null): EnvUrls {
  if (isBuiltEnvName(name)) return ENVIRONMENTS[name];
  return custom ? customEnvUrls(custom) : EMPTY;
}

export function resolvedEnvPayload(
  name: EnvName,
  custom: CustomStack | null = null,
  allowed: boolean = CUSTOM_STACK_ALLOWED,
): ResolvedEnv {
  const urls = envUrls(name, allowed ? custom : null);
  return {
    name,
    backend: urls.backend,
    admin: urls.admin,
    supabaseUrl: urls.supabaseUrl,
    supabaseAnonKey: urls.supabaseAnonKey,
    redactFn: urls.redactFn,
    customStackAllowed: allowed,
    customStack: allowed ? custom : null,
  };
}

export type EnvChangeVerdict =
  | { kind: "refuse"; reason: "unknown_env" | "custom_not_allowed" | "custom_not_configured" }
  | { kind: "allow" | "needs-permission"; env: EnvName };

/**
 * La décision PURE de la bascule, hors Electron et hors disque — c'est elle qu'on épingle.
 * `allowed` est la permission serveur, déjà résolue par l'appelant (et déjà fail-closed).
 *
 * Vers `custom` : pas de permission serveur (la pile est celle de l'utilisateur, il n'y a
 * personne d'autre à qui la demander), mais DEUX conditions structurelles — le build
 * l'honore, et une pile valide est déjà écrite (par `env:set-custom-stack`, qui a passé
 * la boîte native). Le retour à la production est toujours permis, d'où qu'on vienne.
 */
export function classifyEnvChange(args: {
  wanted: unknown;
  current: EnvName;
  allowed: boolean;
  customAllowed?: boolean;
  customConfigured?: boolean;
}): EnvChangeVerdict {
  if (!isEnvName(args.wanted)) return { kind: "refuse", reason: "unknown_env" };
  if (args.wanted === args.current) return { kind: "allow", env: args.wanted };
  if (args.wanted === "custom") {
    if (!(args.customAllowed ?? CUSTOM_STACK_ALLOWED)) return { kind: "refuse", reason: "custom_not_allowed" };
    if (!args.customConfigured) return { kind: "refuse", reason: "custom_not_configured" };
    return { kind: "allow", env: "custom" };
  }
  if (args.wanted === "production") return { kind: "allow", env: "production" };
  return { kind: args.allowed ? "allow" : "needs-permission", env: args.wanted };
}
