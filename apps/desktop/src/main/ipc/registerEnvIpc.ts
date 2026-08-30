import { app, ipcMain, type BrowserWindow } from "electron";
import { DEFAULT_ENV, ENVIRONMENTS, type EnvName } from "../../environments";
import { CUSTOM_STACK_ALLOWED } from "../../environments/customStack";
import { CLIENT_HEADER, clientIdentityHeader } from "../../clientIdentity";
import { classifyEnvChange, resolvedEnvPayload } from "./envSwitch";
import { readEnvPointerFull, writeEnvPointer } from "../environment";
import { registerCustomStackIpc } from "./registerCustomStackIpc";
import { selfPinAllowed } from "../updates/channel";
import { relaunchSafely } from "../updates/install";
import { handle, obj } from "./handle";

/**
 * La famille « environnement » : QUEL environnement cette install joint, et comment elle
 * en change. Un seul module, parce que c'est une seule frontière (règle 10).
 *
 * ⚠️ **Changer d'environnement n'est pas une préférence** : c'est décider à quelle API
 * l'app parle, donc quelles données elle lit et écrit. La porte est donc en MAIN, jamais
 * dans l'interface — un XSS du renderer appellerait l'IPC directement (règle 7). Elle a
 * trois dents, et l'ordre compte :
 *
 * 1. **Allow-list de NOMS.** La cible doit être `"staging"` ou `"production"`. Ce qui est
 *    persisté puis relu n'est jamais une adresse : `environments/` dit pourquoi.
 * 2. **Revenir à l'environnement courant est toujours permis** — ça ne bascule rien.
 * 3. **Sinon, une permission vérifiée SERVEUR**, fail-closed, par l'un de DEUX chemins :
 *    le drapeau de COMPTE `staging_tester` (backend de PRODUCTION, jeton Supabase du
 *    compte — accordé à une personne, valable sur toutes ses machines, retiré d'un
 *    geste), ou `allow_self_pin` (Worker updates, par machine — le dépannage support,
 *    même porte que le changement de canal). Le jeton vient du renderer, et c'est
 *    correct : ce n'est pas une AFFIRMATION qu'on croit, c'est un credential que le
 *    backend vérifie — un jeton volé est le même problème que partout ailleurs.
 *
 * ⚠️ **Le canal de mises à jour n'est PAS touché**, et c'est volontaire. Avec un artefact
 * unique, l'octet livré est le même partout : « quels builds je reçois » (le canal) et « à
 * quelle API je parle » (l'environnement) deviennent deux axes indépendants, accordés
 * séparément. Les faire bouger ensemble ici recréerait le couplage qu'on défait.
 *
 * La pile AUTO-HÉBERGÉE (`custom`) a sa propre porte d'ÉCRITURE — `registerCustomStackIpc`
 * (validation en main + boîte native) — et n'existe que dans un build qui l'honore. Ici on
 * ne fait qu'y REVENIR (`env:switch` vers `custom`), ce qui suppose une pile déjà écrite.
 */

/** Brancher la famille. `current` est l'environnement résolu au démarrage, `baseUserData`
 *  le dossier de BASE où vit le pointeur (jamais le profil courant — voir `environment.ts`). */
/** Le drapeau `staging_tester` du COMPTE, demandé au backend de PRODUCTION — toujours
 *  lui : la vérité des rôles vit dans sa base, quel que soit l'environnement courant
 *  (et il n'est jamais derrière la protection Vercel). Fail-closed sur tout : jeton
 *  absent, réseau, non-2xx, réponse difforme — un refus, jamais une exception. */
async function accountIsStagingTester(token: unknown): Promise<boolean> {
  if (typeof token !== "string" || !token) return false;
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 5000);
    t.unref?.();
    const res = await fetch(`${ENVIRONMENTS[DEFAULT_ENV].backend}/api-features/users/me/flags`, {
      // L'identité du client voyage AUSSI sur ce chemin-ci : il est authentifié, donc il
      // provisionne la ligne `users` comme n'importe quel autre — voir `clientIdentity.ts`.
      headers: { Authorization: `Bearer ${token}`, [CLIENT_HEADER]: clientIdentityHeader(app.getVersion()) },
      signal: ctl.signal,
    });
    clearTimeout(t);
    if (!res.ok) return false;
    const body = (await res.json()) as { flags?: { staging_tester?: boolean } };
    return body?.flags?.staging_tester === true;
  } catch {
    return false;
  }
}

export function registerEnvIpc(
  args: { env: EnvName; baseUserData: string },
  window: () => BrowserWindow | null = () => null,
): void {
  const current = args.env;
  // La pile saisie, relue (et REVALIDÉE) depuis le pointeur : c'est elle que le renderer
  // reçoit en `custom`, et elle qu'on conserve quand on bascule vers un environnement cuit.
  const { custom } = readEnvPointerFull(args.baseUserData);
  const payload = resolvedEnvPayload(current, custom);
  registerCustomStackIpc({ baseUserData: args.baseUserData, window });

  // SYNCHRONE, et c'est délibéré : `renderer/src/appEnv.ts` doit connaître les adresses au
  // chargement du module, avant que `auth.ts` ne construise le client Supabase. Un aller
  // -retour asynchrone arriverait trop tard. Un seul échange, au tout début du boot.
  ipcMain.on("env:resolved-sync", (e) => {
    e.returnValue = payload;
  });

  handle("env:switch", [obj], async (_e, raw) => {
    const { env: wanted, token } = (raw as { env?: unknown; token?: unknown }) ?? {};
    const verdict = classifyEnvChange({
      wanted,
      current,
      // La permission n'est demandée QUE si la cible est STAGING — pas d'appel réseau pour
      // un no-op, ni pour un retour en production ou vers la pile de l'utilisateur.
      // Compte d'abord (le chemin durable), machine ensuite (le dépannage).
      allowed:
        wanted === "staging" && wanted !== current
          ? (await accountIsStagingTester(token)) || (await selfPinAllowed())
          : false,
      customAllowed: CUSTOM_STACK_ALLOWED,
      customConfigured: !!custom,
    });

    if (verdict.kind === "refuse") return { ok: false, reason: verdict.reason, env: current };
    if (verdict.kind === "needs-permission") {
      return { ok: false, reason: "not_privileged", env: current };
    }
    if (verdict.env === current) return { ok: true, env: current, relaunching: false };

    // La pile saisie SURVIT à une bascule vers un environnement cuit : on y revient d'un clic.
    if (!writeEnvPointer(args.baseUserData, verdict.env, undefined, custom)) {
      // Le pointeur n'a pas pu s'écrire : ne PAS redémarrer, ou l'app rouvrirait
      // l'ancien environnement sans que personne comprenne pourquoi.
      return { ok: false, reason: "write_failed", env: current };
    }
    void relaunchSafely(() => {
      app.relaunch();
      app.quit();
    });
    return { ok: true, env: verdict.env, relaunching: true };
  });
}
