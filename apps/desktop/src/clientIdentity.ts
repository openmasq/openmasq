/**
 * QUI parle à notre API — un en-tête, posé par l'app de bureau sur chacun de ses appels.
 *
 * ⚠️ **Ce n'est pas une frontière de sécurité, et il ne faut jamais s'en servir comme
 * telle.** N'importe qui peut forger cet en-tête ; l'identité et l'autorité viennent du
 * jeton vérifié, jamais d'ici (règle 7). Il répond à une question de PRODUIT, pas
 * d'autorisation : « cette requête vient-elle de l'application de bureau ? » — et mentir
 * n'ouvre aucune porte, ça ne fait que s'inscrire soi-même sur une liste de diffusion.
 *
 * Ce qu'il rend possible, et qui ne l'était pas : le backend voit passer les mêmes
 * requêtes authentifiées depuis l'app, le site, la console d'organisation et la console
 * ops, sans pouvoir les distinguer. Une règle qui dit « les gens qui se sont connectés
 * SUR L'APP DE BUREAU » était donc inapplicable — on ne savait pas le dire.
 *
 * ⚠️ `User-Agent` n'était pas une option : Chromium l'interdit à `fetch` depuis un
 * renderer (en-tête gardé). D'où un en-tête à nous.
 *
 * Le nom DÉRIVE de la marque (`brandHeader`, règle 9) ; le backend, qui ne peut pas
 * importer une app sœur (`pnpm check:dup`), le dérive de la même maison. Le test de
 * parité côté backend (`clientApp.parity.test.ts`) relit ce fichier.
 */
import { brandHeader } from "@openmasq/branding";

/** L'en-tête. Minuscules : Node normalise, et une comparaison de casse est un piège. */
export const CLIENT_HEADER = brandHeader("client");

/** Le produit que ce binaire EST. Une seule valeur — il n'y en a pas d'autre ici.
 *  PAS exporté : rien d'autre n'en a besoin ici, et le test de parité le lit comme du
 *  TEXTE (il ne peut pas l'importer — apps sœurs). Un export que personne n'importe est
 *  du code mort pour knip, et le cliquet a raison. */
const CLIENT_PRODUCT = "desktop";

/**
 * La valeur envoyée : `desktop/0.8.0`, ou `desktop` si la version n'a pas été cuite
 * (dev). Le backend ne lit que le produit ; la version voyage pour les journaux, et
 * c'est ce qui permettra un jour de corréler une erreur à une version de client.
 */
export function clientIdentityHeader(version?: string): string {
  return version ? `${CLIENT_PRODUCT}/${version}` : CLIENT_PRODUCT;
}
