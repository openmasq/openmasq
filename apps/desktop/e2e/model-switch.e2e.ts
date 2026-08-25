import { test, expect } from "@playwright/test";
import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { launchApp } from "./helpers";
import { supabaseAuthStorageKey } from "./supabaseAuthKey";

/**
 * SMOKE du changement de modèle — le geste le plus fréquent après « envoyer », et la
 * surface qui a mis toute l'app sur l'ErrorBoundary quand Chromium a changé ce que
 * `scrollIntoView` RETOURNE (une Promise, rendue par un effet concis → « destroy is
 * not a function » au démontage du finder). Le typecheck ne voit pas cette classe
 * (lib.dom déclare encore `void`) et le boot-smoke ne navigue pas : seul un VRAI
 * parcours — ouvrir le finder, marcher les colonnes, choisir, recommencer — l'attrape.
 * Aucun modèle appelé, aucun réseau requis ; release.yml le lance avant la signature.
 */
test("changer deux fois de modèle dans une conversation ne jette jamais", async () => {
  // Profil FRAIS à chaque run (le pattern du harness workflows) : l'état d'un run
  // précédent — session invalidée, sidebar repliée — ne doit jamais faire flaker un smoke.
  const profile = resolve(__dirname, `.profile-model-switch-${process.pid}`);
  rmSync(profile, { recursive: true, force: true });
  mkdirSync(profile, { recursive: true });
  process.env.OPENMASQ_USER_DATA_DIR = profile;
  const { app, page } = await launchApp();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`${e.message}`));
  page.on("console", (m) => {
    // La boundary AVALE l'erreur (pas de pageerror) — c'est sa trace console qui témoigne.
    if (m.type() === "error" && /ErrorBoundary|is not a function/.test(m.text()))
      errors.push(m.text().slice(0, 400));
  });
  await page.evaluate((authKey) => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    localStorage.setItem(authKey, JSON.stringify({
      access_token: "fake", token_type: "bearer", expires_in: 3600, expires_at: future,
      refresh_token: "fake", user: { id: "u1", email: "test@acme.test", aud: "authenticated", role: "authenticated" },
    }));
    // Les DEUX clés de settings — la globale ET la scopée par compte (`:u1`), comme le
    // harness workflows : sans la scopée, l'app peut retomber sur l'onboarding/login.
    const s = JSON.stringify({ onboarded: true, redactRulesSeen: true, redactEngine: "patterns", defaultModelId: "auto" });
    for (const k of ["openmasq.settings", "openmasq.settings:u1"]) localStorage.setItem(k, s);
  }, supabaseAuthStorageKey());
  await page.reload();
  await page.waitForLoadState("domcontentloaded");
  await new Promise((r) => setTimeout(r, 2500));

  // Rail replié OU sidebar dépliée : `DesktopShell` garde les DEUX panneaux MONTÉS (le
  // dock anime sa largeur et les fait se croiser), donc un sélecteur par texte ou par
  // classe attrape aussi celui de DERRIÈRE — que l'espace de conversation recouvre, d'où
  // un clic qui ne peut jamais atterrir (le run Windows 31485829086 : « <div
  // class="welcome"> intercepts pointer events », 60 tentatives, échec).
  // `getByRole` lit l'arbre d'ACCESSIBILITÉ, qui exclut le panneau `aria-hidden` : il ne
  // peut désigner que le bouton réellement actif, quel que soit l'état du dock.
  // (L'ancien sélecteur cherchait aussi « Nouveau chat », libellé qui n'existe plus nulle
  // part : il ne tenait que par son repli, et le repli visait le mauvais bouton.)
  await page.getByRole("button", { name: "Nouvelle conversation" }).first().click();
  await new Promise((r) => setTimeout(r, 1000));

  // Deux changements complets : le cleanup d'effet du finder court à CHAQUE
  // navigation de focus ET à son démontage — le crash historique variait entre les deux.
  const pickThrough = async (providerIdx: number) => {
    await page.locator(".model-chip").first().click();
    await new Promise((r) => setTimeout(r, 500));
    for (let col = 0; col < 3; col++) {
      const colEl = page.locator(".model-finder-col").nth(col);
      if ((await colEl.count()) === 0) break;
      const item = colEl.locator(".model-finder-item").nth(col === 0 ? providerIdx : 0);
      if ((await item.count()) === 0) break;
      await item.click().catch(() => {});
      await new Promise((r) => setTimeout(r, 450));
      if ((await page.locator(".model-finder").count()) === 0) return; // modèle choisi
    }
    await page.keyboard.press("Escape").catch(() => {});
  };
  await pickThrough(1);
  await new Promise((r) => setTimeout(r, 800));
  await pickThrough(2);
  await new Promise((r) => setTimeout(r, 1200));

  // L'app est toujours vivante (pas d'ErrorBoundary) et aucune erreur n'a fusé.
  expect(errors, "le changement de modèle a jeté").toEqual([]);
  await expect(page.locator(".model-chip").first()).toBeAttached();
  await app.close();
});
