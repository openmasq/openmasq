/**
 * QUEL environnement cette instance ouvre — et où ce choix est écrit.
 *
 * ⚠️ **Le pointeur ne peut PAS vivre dans `updates.json`.** Celui-ci est dans `userData`,
 * dont le chemin dépend justement de l'environnement (`profile.ts`) : on ne peut pas lire
 * dans le dossier qu'on n'a pas encore choisi. Il vit donc dans le dossier `userData` de
 * BASE — le chemin nu, celui de la production — sous un nom à lui. Une seule ligne, aucun
 * secret, et la seule chose qu'un profil de staging écrit hors de chez lui.
 *
 * ⚠️ **Ce qui est persisté est un NOM, jamais une adresse** (`environments/` dit pourquoi)
 * — à UNE exception près, délibérée et bornée : la pile AUTO-HÉBERGÉE (`custom`), dont
 * les adresses vivent dans ce même fichier, mais qui n'est HONORÉE que dans un build qui
 * l'autorise (`OPENMASQ_ALLOW_CUSTOM_STACK=1`) et seulement si elles repassent la
 * validation à CHAQUE lecture (`environments/customStack.ts`). Un binaire officiel qui
 * trouve un pointeur `custom` ouvre la production ; un pointeur `custom` aux adresses
 * altérées aussi. Une valeur inconnue, un fichier illisible, un JSON cassé ⇒ la production.
 * Fail-closed a ici un sens précis : le défaut n'est pas « rien », c'est l'environnement du
 * binaire.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_ENV, isEnvName, type EnvName } from "../environments";
import { CUSTOM_STACK_ALLOWED, validateCustomStack, type CustomStack } from "../environments/customStack";

/** Le fichier qui porte le choix, dans le `userData` de BASE. */
export const ENV_POINTER_FILE = "environment.json";

/** La part de `fs` dont ceci a besoin — injectée, pour que le module reste testable. */
export interface PointerIo {
  readFile(path: string): string;
  writeFile(path: string, contents: string): void;
}

const nodeIo: PointerIo = {
  readFile: (p) => readFileSync(p, "utf8"),
  writeFile: (p, c) => writeFileSync(p, c),
};

/** Ce que le pointeur dit, une fois relu et FILTRÉ : un environnement honorable, et la
 *  pile saisie si elle est valide — gardée même quand l'environnement courant est un
 *  autre, pour que l'écran puisse la pré-remplir et qu'on puisse y revenir. */
export interface EnvPointer {
  env: EnvName;
  custom: CustomStack | null;
}

/**
 * Le pointeur, en entier.
 *
 * `fallback` répond tant qu'AUCUN choix n'a été écrit — et c'est TOUJOURS la production :
 * l'environnement ne se déduit plus du canal (contrat de l'artefact unique, voir
 * `../environments`). Sans pointeur, rien ne change pour personne.
 *
 * `allowed` = le build honore-t-il une pile saisie ; injecté pour le test, cuit sinon.
 */
export function readEnvPointerFull(
  baseUserData: string,
  fallback: EnvName = DEFAULT_ENV,
  io: PointerIo = nodeIo,
  allowed: boolean = CUSTOM_STACK_ALLOWED,
): EnvPointer {
  try {
    const raw = JSON.parse(io.readFile(join(baseUserData, ENV_POINTER_FILE))) as {
      env?: unknown;
      custom?: unknown;
    };
    // La pile n'est retenue que si elle repasse la validation ET que le build l'honore :
    // une adresse écrite à la main dans le fichier n'est pas une adresse acceptée.
    const verdict = allowed && raw?.custom ? validateCustomStack(raw.custom) : null;
    const custom = verdict?.ok ? verdict.stack : null;
    if (!isEnvName(raw?.env)) return { env: fallback, custom };
    if (raw.env === "custom") return { env: custom ? "custom" : fallback, custom };
    return { env: raw.env, custom };
  } catch {
    // Fichier absent (le cas normal), illisible, ou JSON cassé — dans les trois cas le
    // défaut sait où aller. On ne jette jamais ici : ceci tourne avant `whenReady`, et une
    // exception y est un lancement mort sans fenêtre pour l'expliquer.
    return { env: fallback, custom: null };
  }
}

/** L'environnement choisi, seul — ce que le profil (`profile.ts`) a besoin de savoir. */
export function readEnvPointer(
  baseUserData: string,
  fallback: EnvName = DEFAULT_ENV,
  io: PointerIo = nodeIo,
): EnvName {
  return readEnvPointerFull(baseUserData, fallback, io).env;
}

/** Écrire le choix. Best-effort : un disque plein ne doit pas tuer un lancement — au pire
 *  l'app rouvre son environnement précédent au prochain démarrage. `custom` est la pile
 *  saisie à CONSERVER (celle qu'on applique, ou celle déjà connue quand on bascule vers un
 *  environnement cuit) — `null` l'oublie. */
export function writeEnvPointer(
  baseUserData: string,
  env: EnvName,
  io: PointerIo = nodeIo,
  custom: CustomStack | null = null,
): boolean {
  try {
    const body = custom ? { env, custom } : { env };
    io.writeFile(join(baseUserData, ENV_POINTER_FILE), JSON.stringify(body, null, 2));
    return true;
  } catch {
    return false;
  }
}

export { DEFAULT_ENV };
export type { EnvName };
