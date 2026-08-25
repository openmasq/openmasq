import { test, expect } from "@playwright/test";
import { launchApp } from "./helpers";

/**
 * Le SMOKE de démarrage — la seule vérification qui attrape TOUT ce qui tue l'app au
 * chargement : un pair optionnel bundlé en throw (la mine que `scripts/check-bundle.mjs`
 * scanne statiquement), un module natif absent de l'arbre packagé, un handler IPC qui
 * jette à l'enregistrement. Le build passe dans tous ces cas ; seul un LANCEMENT réel
 * les voit — c'est pourquoi la release le fait avant de signer (release.yml).
 * Volontairement minimal : lancer, une fenêtre, du DOM, quitter — aucun modèle,
 * aucun réseau, aucun coût.
 */
test("l'app construite démarre : une fenêtre, du DOM, zéro erreur de chargement", async () => {
  const { app, page } = await launchApp();
  // Une racine React montée suffit — le renderer a chargé et le main n'a pas jeté.
  await expect(page.locator("#root")).toBeAttached();
  await app.close();
});
