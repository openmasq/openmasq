/**
 * QUEL profil `userData` cette instance ouvre — décision pure, testée à côté.
 *
 * Un profil, c'est la base SQLite du compte, les entrées de trousseau, `updates.json`,
 * les réglages, et le verrou d'instance unique. Deux instances qui se croient chez elles
 * dans le même dossier, c'est une base corrompue ; deux ENVIRONNEMENTS qui s'y croisent,
 * c'est pire — le coffre et les clés fournisseur d'un environnement relus par l'autre.
 *
 * ⚠️ **Le bug que ça ferme existe aujourd'hui.** Les deux builds partagent `appId`
 * (branding `desktopBundleId`) et `productName` (branding `name`), donc le même `userData` par défaut.
 * Basculer une install de staging vers production (la bascule privilégiée, qui réinstalle
 * le build de l'autre canal) fait donc ouvrir à l'app de PRODUCTION le coffre, les
 * conversations et les clés de STAGING. Rien ne l'empêchait.
 *
 * ⚠️ **Et la production garde le chemin NU — c'est la contrainte qui décide de tout le
 * reste.** Suffixer aussi la production enverrait chaque install existante sur un dossier
 * vide : conversations, coffre, clés, compte, tout « disparu » à la mise à jour suivante.
 * Le suffixe ne s'applique donc qu'aux environnements qui ne sont PAS la production. Les
 * installs de staging, elles, repartent d'un profil neuf — ce sont des données de test,
 * et c'est le prix, énoncé, de la séparation.
 */
import { DEFAULT_ENV, readEnvPointer, type EnvName } from "./environment";

/** Ce que le profil peut valoir. `""` = le chemin par défaut d'Electron. */
export type ProfileSuffix = "" | " (Dev)" | " (Staging)";

export interface ProfileInput {
  /** L'environnement RÉSOLU de cette instance — le pointeur écrit s'il y en a un, sinon
   *  celui du build (`environment.ts`). C'est ce qui rend le profil correct le jour où
   *  l'environnement se choisit à l'exécution : le dossier suit le choix, pas le binaire. */
  env: EnvName;
  /** `app.isPackaged` — faux sous `electron-vite dev`. */
  isPackaged: boolean;
}

/**
 * Le suffixe à coller au `userData` par défaut.
 *
 * Trois cas, dans cet ordre, et l'ordre est la règle :
 *
 * 1. **Non empaqueté ⇒ `" (Dev)"`.** Un `pnpm dev` et une app installée partagent
 *    `productName`, donc le même profil : un seul verrou d'instance (le second
 *    lancement se ferme) et une seule base SQLite ouverte deux fois. Le dev l'emporte
 *    sur l'environnement — un dev de build staging pointe déjà sur localhost
 *    (`.env.development`), il n'a rien à séparer de plus.
 * 2. **Environnement `staging` ⇒ `" (Staging)"`.** Le seul qui se sépare.
 * 3. **Sinon ⇒ `""`.** La production — et AUSSI un build empaqueté sans canal (un
 *    `pnpm run release` local), qui se résout en production : il partage ce profil
 *    aujourd'hui, et lui en inventer un autre déplacerait les données de quelqu'un sans
 *    qu'on l'ait demandé.
 */
export function profileSuffix({ env, isPackaged }: ProfileInput): ProfileSuffix {
  if (!isPackaged) return " (Dev)";
  return env === "staging" ? " (Staging)" : "";
}

/** La part d'`app` dont ceci a besoin — injectée plutôt qu'importée, pour que ce module
 *  reste testable sans Electron (et que la décision au-dessus le reste tout court). */
/** Ce que le reste de main doit savoir une fois le profil posé. */
export interface ResolvedProfile {
  env: EnvName;
  /** Le dossier `userData` de BASE — là où vit le pointeur, jamais le profil courant. */
  baseUserData: string;
}

export interface ProfileApp {
  isPackaged: boolean;
  getPath(name: "userData"): string;
  setPath(name: "userData", path: string): void;
}

/**
 * Poser le profil de CETTE instance, et rendre ce que le reste de main doit savoir :
 * l'environnement retenu, et le dossier de BASE — celui-ci doit être capturé AVANT le
 * `setPath`, puisque après, `getPath("userData")` rend le profil suffixé, où le pointeur
 * ne vit pas. ⚠️ **Doit tourner avant `whenReady`** —
 * `userData` est lu pendant l'init d'Electron.
 *
 * `OPENMASQ_USER_DATA_DIR` l'emporte sur tout : c'est le crochet e2e, qui pointe un profil
 * jetable et déjà authentifié — il ne change PAS l'environnement, seulement le dossier.
 * Sinon : le pointeur écrit s'il existe, sinon l'environnement du build ; puis le suffixe,
 * et rien du tout quand il est vide — on ne réécrit pas le chemin de production avec sa
 * propre valeur.
 *
 * ⚠️ Le pointeur se lit dans le `userData` de BASE, donc AVANT tout `setPath` : c'est la
 * seule lecture possible, puisque le dossier final est ce qu'on est en train de décider.
 */
export function applyProfilePath(
  app: ProfileApp,
  vars: { OPENMASQ_USER_DATA_DIR?: string },
  readPointer: (base: string, fallback: EnvName) => EnvName = readEnvPointer,
): ResolvedProfile {
  const baseUserData = app.getPath("userData");
  // Sans pointeur, l'environnement est LA production — jamais déduit du canal (contrat de
  // l'artefact unique : un candidat est le vrai logiciel en avance, pas un env de test).
  const env = readPointer(baseUserData, DEFAULT_ENV);

  if (vars.OPENMASQ_USER_DATA_DIR) {
    app.setPath("userData", vars.OPENMASQ_USER_DATA_DIR);
    return { env, baseUserData };
  }
  const suffix = profileSuffix({ env, isPackaged: app.isPackaged });
  if (suffix) app.setPath("userData", `${baseUserData}${suffix}`);
  return { env, baseUserData };
}
