import { accountSecretFile, secretFile } from "./secretFile";

/**
 * Les deux secrets de la synchro au repos, chiffrés par `safeStorage` (trousseau de l'OS)
 * dans `${userData}`. Le squelette est partagé (`secretFile.ts`) ; ce fichier ne dit plus
 * que CE QUE chacun protège — c'est la seule chose qui les distingue, et elle mérite d'être
 * lisible d'un coup d'œil (règle 10 : les magasins de secrets au repos, ensemble).
 *
 * ⚠️ Ni l'un ni l'autre ne doit retourner dans le localStorage du renderer : c'est du
 * LevelDB Chromium, en clair sur le disque.
 */

/**
 * La PHRASE de synchro — la clé E2E qui déchiffre les coffres synchronisés de tous les
 * appareils du compte. Non définie ⇒ la synchro des coffres est éteinte.
 *
 * ⚠️ **PAR COMPTE**, et c'était le quatrième magasin que `CLAUDE.md` annonçait comme « la
 * fuite » s'il n'était pas branché sur le même effet que `keys`/`db`/`mcp`. À portée
 * APPAREIL, changer de compte laissait la phrase en place : le compte B se retrouvait
 * synchronisé avec la clé de A — sans l'avoir demandé, et sans la détenir. La promesse E2E
 * (« personne d'autre que vous n'a la clé ») était donc fausse pour lui, et ses coffres
 * partaient chiffrés par une clé qu'un autre connaît. Le backend borne bien chaque ligne au
 * jeton vérifié, donc A ne peut pas LIRE celles de B — mais la garantie, elle, était perdue.
 *
 * On RANGE par compte, on n'efface jamais au changement : il n'existe aucun séquestre, donc
 * détruire une phrase orpheline définitivement les coffres déjà synchronisés. Revenir sur A
 * doit retrouver la sienne.
 */
const pass = accountSecretFile("sync-pass", "passphrase");

/** Connexion / changement de compte / déconnexion — appelé par le MÊME effet que
 *  `keys:set-user`, `db:set-user` et `mcp:set-user` (`../store/CLAUDE.md`). */
export const setSyncPassUser = (uid: string | null): void => pass.setUser(uid);

export const getSyncPass = (): string | null => pass.get();
export const setSyncPass = (value: string): void => pass.set(value);
export const clearSyncPass = (): void => pass.clear();

/**
 * Le SECRET D'APPAREIL (TOFU) — ce qui prouve au serveur que cet appareil est bien
 * celui-là, et donc ce qui ferme l'usurpation de replica : l'id d'appareil est énumérable
 * par la liste des appareils, le secret non. Il vivait en clair dans le localStorage,
 * c'est-à-dire exactement là où la phrase avait cessé de vivre — l'asymétrie était à
 * l'envers de son rôle.
 *
 * ⚠️ Celui-ci reste à portée APPAREIL, et c'est voulu : il ne répond pas « qui êtes-vous »
 * mais « est-ce bien la même machine ». Le scinder par compte inventerait un appareil neuf
 * à chaque connexion — la liste des appareils se remplirait de doublons et le TOFU perdrait
 * ce qu'il vaut. C'est la phrase qui appartient au compte, pas la machine.
 */
const deviceSecret = secretFile("sync-device-secret", "device secret");

export const getDeviceSecret = (): string | null => deviceSecret.get();
export const setDeviceSecret = (value: string): void => deviceSecret.set(value);
