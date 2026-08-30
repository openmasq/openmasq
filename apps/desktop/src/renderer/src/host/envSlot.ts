import { backendFetch } from "../backendFetch";
import {
  BACKEND_CONFIGURED,
  BACKEND_URL,
  CUSTOM_STACK,
  CUSTOM_STACK_ALLOWED,
  RUNTIME_ENV,
} from "../appEnv";
import { authHost } from "../auth";
import type { Host } from "@openmasq/ui";

/**
 * L'environnement d'exécution (production/staging) + sa bascule — la carte
 * « Environnement » de Réglages → Versions, et la pile AUTO-HÉBERGÉE qu'on y saisit.
 *
 * Hors de `main.tsx` parce que c'est le seul slot du `Host` qui porte une DÉCISION à
 * lui (trois gardes qui se composent), et parce que la composition racine doit rester
 * lisible d'un écran : ce qu'on y lit est la LISTE des capacités, pas comment l'une
 * d'elles se garde.
 *
 * Les trois gardes, dans l'ordre où elles tombent :
 * 1. `switchTo` absent du preload (non redémarré) ⇒ pas de carte du tout, jamais un throw.
 * 2. Un seul backend cuit ⇒ rien à basculer… SAUF si le build honore une pile
 *    auto-hébergée : c'est justement dans un build sans backend qu'on en saisit une.
 * 3. `setCustomStack` absent du preload ⇒ la carte s'affiche sans la pile saisie.
 *
 * ⚠️ Tout ce qui est ici est de l'AFFICHAGE. La décision revit en main
 * (`registerEnvIpc` / `registerCustomStackIpc`, fail-closed) : un renderer ne décide
 * de rien, et `stagingTester` ne fait que proposer ou non la bascule.
 */
export function envSlot(): Host["env"] {
  return (BACKEND_CONFIGURED || CUSTOM_STACK_ALLOWED) && window.openmasq.env?.switchTo
    ? {
        name: RUNTIME_ENV,
        // La pile saisie : proposée seulement si le build l'honore ET que le preload la
        // sait écrire (un preload d'avant la fonctionnalité n'a pas la méthode).
        customStack:
          CUSTOM_STACK_ALLOWED && window.openmasq.env.setCustomStack
            ? {
                current: CUSTOM_STACK,
                set: (stack) => window.openmasq.env.setCustomStack(stack),
                forget: () => window.openmasq.env.forgetCustomStack(),
              }
            : undefined,
        switchTo: async (envName) => {
          const token = (await authHost.getAccessToken?.().catch(() => null)) ?? undefined;
          return window.openmasq.env.switchTo(envName, token);
        },
        // AFFICHAGE seulement (proposer ou non la bascule), fail-closed à false — la vraie
        // garde revit en main au moment de basculer, et BACKEND_URL est bien la production.
        stagingTester: async () => {
          try {
            const token = await authHost.getAccessToken?.();
            if (!token) return false;
            // `backendFetch`, jamais `fetch` : il porte l'identité du client — voir sa source.
            const res = await backendFetch(`${BACKEND_URL}/api-features/users/me/flags`, {
              headers: { authorization: `Bearer ${token}` },
            });
            if (!res.ok) return false;
            const body = (await res.json()) as { flags?: { staging_tester?: boolean } };
            return body?.flags?.staging_tester === true;
          } catch {
            return false;
          }
        },
      }
    : undefined;
}
