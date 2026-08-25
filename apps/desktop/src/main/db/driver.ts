import { app, dialog } from "electron";
import type { createClient as CreateClient } from "@libsql/client";
import { reportMainError } from "../runtime/errorReport";
import { BRAND } from "@openmasq/branding";

/**
 * Chargement PARESSEUX du pilote natif libSQL, et l'échec rendu lisible.
 *
 * Pourquoi paresseux : `@libsql/client` est `external`, donc un `import` en tête de module
 * est un `require` natif exécuté au CHARGEMENT du bundle principal — avant `Sentry.init`,
 * avant le pont d'erreurs, avant la moindre ligne à nous. Quand Windows refuse ce
 * `dlopen`, l'utilisateur reçoit le dialogue brut d'Electron (« A JavaScript error occurred
 * in the main process » + une pile), et NOUS ne recevons rien : zéro évènement, aucune
 * trace. C'est arrivé sur la première installation Windows réelle.
 *
 * Différé jusqu'à l'ouverture d'une base (à la connexion), l'échec devient attrapable : on
 * le REMONTE, et on dit à l'utilisateur ce qui manque et comment le réparer, au lieu de lui
 * montrer une pile d'appels.
 */

/** Un échec de chargement de MODULE NATIF, par opposition à une erreur de base de données.
 *  Node donne `ERR_DLOPEN_FAILED` ; le message, lui, est traduit par Windows (« Le module
 *  spécifié est introuvable »), donc il ne peut pas servir de test à lui seul — le code
 *  passe d'abord, le message n'est qu'un filet pour les runtimes qui ne le posent pas.
 *  Pur, donc testé (`driver.test.ts`). */
export function isNativeLoadFailure(err: unknown): boolean {
  const e = err as { code?: unknown; message?: unknown } | null;
  if (e && e.code === "ERR_DLOPEN_FAILED") return true;
  const msg = typeof e?.message === "string" ? e.message : "";
  return /dlopen|\.node\b/i.test(msg) && /not be found|introuvable|no such file|cannot open/i.test(msg);
}

/** Ce qu'on dit à l'utilisateur. Windows est le seul cas connu (le pilote y dépend du
 *  « Visual C++ Redistributable », que nos builds embarquent désormais à côté de l'exe —
 *  un binaire à qui il manquerait ces DLL est donc soit ancien, soit incomplet). */
function explain(): { title: string; message: string } {
  if (process.platform === "win32") {
    return {
      title: `${BRAND.name} ne peut pas démarrer`,
      message:
        "Un composant système requis par la base de données locale est absent de cet " +
        "ordinateur : le « Microsoft Visual C++ Redistributable » (x64).\n\n" +
        "Installez-le depuis https://aka.ms/vs/17/release/vc_redist.x64.exe, puis " +
        `relancez ${BRAND.name}.\n\n` +
        `Si le problème persiste, réinstallez ${BRAND.name} : cette version embarque normalement ` +
        "ce composant.",
    };
  }
  return {
    title: `${BRAND.name} ne peut pas démarrer`,
    message:
      "Le composant natif de la base de données locale n'a pas pu être chargé. " +
      `Réinstallez ${BRAND.name} pour réparer l'installation.`,
  };
}

let cached: typeof CreateClient | null = null;

/**
 * Le `createClient` de libSQL, chargé à la première ouverture de base.
 *
 * Un échec de chargement NATIF est terminal : il se reproduira à chaque lancement, et sans
 * base l'app n'a ni conversations, ni coffre, ni clés. On le REMONTE (Sentry + télémétrie),
 * on l'explique, puis on quitte — plutôt que de laisser tourner une app dont chaque écriture
 * serait un no-op silencieux. Toute autre erreur remonte telle quelle à l'appelant.
 */
export async function loadDriver(): Promise<typeof CreateClient> {
  if (cached) return cached;
  try {
    ({ createClient: cached } = await import("@libsql/client"));
    return cached;
  } catch (err) {
    if (!isNativeLoadFailure(err)) throw err;
    reportMainError("db", "native_load_failed", err);
    const { title, message } = explain();
    dialog.showErrorBox(title, message);
    app.quit();
    throw err;
  }
}
