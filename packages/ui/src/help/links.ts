/**
 * Les adresses PUBLIQUES que l'app propose d'ouvrir — une seule maison (règle 9), parce
 * qu'un domaine se déplace : les adresses en `.io` ont toutes basculé sur `.dev`, et une
 * URL recopiée dans un composant est celle qu'on oublie ce jour-là.
 *
 * Elles vivent dans `help/` avec le reste du vocabulaire montré à l'utilisateur : ce ne
 * sont pas des points d'accès techniques (ceux-là sont injectés par l'hôte), mais des
 * destinations qu'on NOMME dans une phrase.
 */
import { brandUrl } from "@openmasq/branding";

/** Le centre d'aide étendu — la documentation complète, hors de l'app. */
export const HELP_CENTER_URL = brandUrl("help");
