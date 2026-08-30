/**
 * La CSP du renderer, ÉLARGIE aux origines de la pile auto-hébergée — au chargement, par
 * main, et seulement en environnement `custom`.
 *
 * La CSP d'`index.html` est une balise `<meta>` STATIQUE (`src/renderer/index.html`) : elle
 * n'autorise que `'self'`, le Supabase cuit et `https://*.<domaine de la marque>`. Une
 * meta-CSP ne se DESSERRE pas par un en-tête (les deux s'appliquent, la plus stricte gagne),
 * donc une pile sur un autre domaine serait bloquée même acceptée par main. La seule façon
 * honnête de l'élargir est de servir un `index.html` dont le `connect-src` porte EN PLUS les
 * origines déclarées — exactement celles-là, jamais un joker (`customCspOrigins`).
 *
 * Mécanisme : on intercepte le schéma `file:` de la session par défaut (`protocol.handle`),
 * on ne réécrit QUE le fichier `index.html` du renderer, et tout le reste repart au
 * gestionnaire natif (`net.fetch` + `bypassCustomProtocolHandlers`). L'origine du renderer
 * ne change pas, le preload non plus. Doit tourner après `whenReady`, avant `loadFile`.
 */
import { protocol, net } from "electron";
import { readFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { customCspOrigins, patchCspConnectSrc, type CustomStack } from "../environments/customStack";
import type { EnvName } from "../environments";
import { readEnvPointerFull } from "./environment";

export function installCustomStackCsp(stack: CustomStack, rendererIndexHtml: string): void {
  const origins = customCspOrigins(stack);
  if (origins.length === 0) return;
  const indexUrl = pathToFileURL(rendererIndexHtml).href;
  protocol.handle("file", async (request) => {
    // Comparé SANS la requête ni le fragment : `loadFile` peut en ajouter, le fichier est le même.
    const url = request.url.split(/[?#]/, 1)[0];
    if (url !== indexUrl) return net.fetch(request, { bypassCustomProtocolHandlers: true });
    const html = await readFile(rendererIndexHtml, "utf8");
    return new Response(patchCspConnectSrc(html, origins), {
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  });
}

/** Le branchement depuis `index.ts`, en une ligne : rien à faire hors de l'environnement
 *  `custom`, et rien non plus si le pointeur ne porte plus de pile valide (`environment.ts`
 *  relit et REVALIDE — une pile altérée sur le disque n'élargit rien). */
export function installCustomStackCspFor(profile: { env: EnvName; baseUserData: string }, rendererIndexHtml: string): void {
  if (profile.env !== "custom") return;
  const { custom } = readEnvPointerFull(profile.baseUserData);
  if (custom) installCustomStackCsp(custom, rendererIndexHtml);
}
