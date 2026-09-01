import type { Page } from "@playwright/test";

/**
 * Neutralise le RÉSEAU Supabase pour un test E2E, afin que la fausse session semée dans
 * `localStorage` (`supabaseAuthKey.ts`) survive.
 *
 * ⚠️ POURQUOI ce fichier existe — la panne du 01/09/2026. Semer une session suffisait
 * TANT QUE le build n'avait pas de projet Supabase : sans `OPENMASQ_SUPABASE_URL`,
 * `main.tsx` passe `auth: undefined` et l'app SAUTE entièrement la porte de connexion
 * (`packages/ui` host/account.ts). Le jour où la variable a été câblée, supabase-js s'est
 * mis à rafraîchir le jeton `"fake"` contre le VRAI projet, a reçu un refus, a purgé la
 * session — et l'app est restée sur l'écran de connexion. Le test attendait alors un
 * bouton qui n'existait pas, 30 s, puis échouait. Autrement dit : le harnais ne passait
 * que parce que le produit était mal configuré, et le réparer a révélé le trou.
 *
 * Ce que ça fait : toute requête vers `/auth/v1/*` reçoit une réponse fabriquée — jamais
 * de réseau réel. Un rafraîchissement rend une session valide une heure, `GET /user` rend
 * l'utilisateur semé, et tout le reste rend un objet vide plutôt qu'une erreur (une route
 * inconnue qui échouerait relancerait exactement la purge qu'on évite ici).
 *
 * ⚠️ À poser AVANT le `page.reload()` qui suit le semis : une route enregistrée après le
 * chargement ne voit pas les appels déjà partis.
 *
 * Aucune identité vraie n'entre ici : c'est un décor, pas une authentification. Les tests
 * qui sèment une session et tourneront un jour sur un build CONFIGURÉ en ont tous besoin
 * (`documents-multi`, `shot`, `live-file`, `parcours/session`) ; aujourd'hui seul
 * `model-switch` s'exécute sur un tel build (release.yml), les autres passant par
 * `verify.yml`, qui construit sans valeurs.
 */
const USER = {
  id: "u1",
  aud: "authenticated",
  role: "authenticated",
  email: "test@acme.test",
  app_metadata: {},
  user_metadata: {},
  created_at: "2020-01-01T00:00:00Z",
};

function session(): Record<string, unknown> {
  return {
    access_token: "fake",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    refresh_token: "fake",
    user: USER,
  };
}

export async function stubSupabaseAuth(page: Page): Promise<void> {
  await page.route("**/auth/v1/**", async (route) => {
    const url = route.request().url();
    const json = url.includes("/user") ? USER : url.includes("/token") ? session() : {};
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      // CORS : la fenêtre du renderer a une origine `file://`/`app://`, donc une réponse
      // sans en-tête permissif serait rejetée avant d'atteindre supabase-js.
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify(json),
    });
  });
}
