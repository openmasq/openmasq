/**
 * La DÉCISION de la bascule d'environnement, et la charge que le renderer reçoit — sans
 * Electron, sans disque, sans réseau.
 *
 * Séparée du branchement (`registerEnvIpc.ts`) pour une raison mécanique autant que de
 * principe : celui-ci tire `updates/channel` pour la permission serveur, donc
 * `electron-updater`, qui ne se charge pas hors d'Electron. Une porte qui ne peut pas être
 * testée finit par n'être vérifiée que de tête.
 */
import { ENVIRONMENTS, isEnvName, type EnvName } from "../../environments";

/** L'état que le renderer lit AU CHARGEMENT, en synchrone : il en a besoin avant de créer
 *  le client Supabase, donc avant tout aller-retour asynchrone. Rien de secret ici —
 *  un nom et des adresses publiques. */
export interface ResolvedEnv {
  name: EnvName;
  backend: string;
  admin: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  redactFn: string;
}

export function resolvedEnvPayload(name: EnvName): ResolvedEnv {
  const urls = ENVIRONMENTS[name];
  return {
    name,
    backend: urls.backend,
    admin: urls.admin,
    supabaseUrl: urls.supabaseUrl,
    supabaseAnonKey: urls.supabaseAnonKey,
    redactFn: urls.redactFn,
  };
}

type SwitchVerdict =
  | { ok: true; env: EnvName; relaunching: boolean }
  | { ok: false; reason: "unknown_env" | "not_privileged" | "write_failed"; env: EnvName };

/**
 * La décision PURE de la bascule, hors Electron et hors disque — c'est elle qu'on épingle.
 * `allowed` est la permission serveur, déjà résolue par l'appelant (et déjà fail-closed).
 */
export function classifyEnvChange(args: {
  wanted: unknown;
  current: EnvName;
  allowed: boolean;
}): { kind: "refuse"; reason: "unknown_env" } | { kind: "allow" | "needs-permission"; env: EnvName } {
  if (!isEnvName(args.wanted)) return { kind: "refuse", reason: "unknown_env" };
  if (args.wanted === args.current) return { kind: "allow", env: args.wanted };
  return { kind: args.allowed ? "allow" : "needs-permission", env: args.wanted };
}
