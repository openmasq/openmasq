/**
 * QUEL environnement cette instance ouvre — et où ce choix est écrit.
 *
 * ⚠️ **Le pointeur ne peut PAS vivre dans `updates.json`.** Celui-ci est dans `userData`,
 * dont le chemin dépend justement de l'environnement (`profile.ts`) : on ne peut pas lire
 * dans le dossier qu'on n'a pas encore choisi. Il vit donc dans le dossier `userData` de
 * BASE — le chemin nu, celui de la production — sous un nom à lui. Une seule ligne, aucun
 * secret, et la seule chose qu'un profil de staging écrit hors de chez lui.
 *
 * ⚠️ **Ce qui est persisté est un NOM, jamais une adresse** (`environments/` dit pourquoi).
 * Une valeur inconnue, un fichier illisible, un JSON cassé ⇒ la production. Fail-closed a
 * ici un sens précis : le défaut n'est pas « rien », c'est l'environnement du binaire.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { DEFAULT_ENV, isEnvName, type EnvName } from "../environments";

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

/**
 * L'environnement choisi, lu dans le dossier de base.
 *
 * `fallback` répond tant qu'AUCUN choix n'a été écrit — et c'est TOUJOURS la production :
 * l'environnement ne se déduit plus du canal (contrat de l'artefact unique, voir
 * `../environments`). Sans pointeur, rien ne change pour personne.
 */
export function readEnvPointer(
  baseUserData: string,
  fallback: EnvName = DEFAULT_ENV,
  io: PointerIo = nodeIo,
): EnvName {
  try {
    const raw = JSON.parse(io.readFile(join(baseUserData, ENV_POINTER_FILE))) as { env?: unknown };
    return isEnvName(raw?.env) ? raw.env : fallback;
  } catch {
    // Fichier absent (le cas normal), illisible, ou JSON cassé — dans les trois cas le
    // défaut sait où aller. On ne jette jamais ici : ceci tourne avant `whenReady`, et une
    // exception y est un lancement mort sans fenêtre pour l'expliquer.
    return fallback;
  }
}

/** Écrire le choix. Best-effort : un disque plein ne doit pas tuer un lancement — au pire
 *  l'app rouvre son environnement précédent au prochain démarrage. */
export function writeEnvPointer(baseUserData: string, env: EnvName, io: PointerIo = nodeIo): boolean {
  try {
    io.writeFile(join(baseUserData, ENV_POINTER_FILE), JSON.stringify({ env }, null, 2));
    return true;
  } catch {
    return false;
  }
}

export { DEFAULT_ENV };
export type { EnvName };
