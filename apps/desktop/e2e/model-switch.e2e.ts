import { test, expect } from "@playwright/test";
import { mkdirSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import { launchApp } from "./helpers";
import { supabaseAuthStorageKey } from "./supabaseAuthKey";
import { stubSupabaseAuth } from "./supabaseStub";

/**
 * SMOKE test for changing models — the most frequent gesture after "send", and the
 * surface that put the whole app on the ErrorBoundary when Chromium changed what
 * `scrollIntoView` RETURNS (a Promise, rendered by a concise effect → "destroy is
 * not a function" on the finder's unmount). The typecheck doesn't see this class
 * (lib.dom still declares `void`) and the boot-smoke doesn't navigate: only a REAL
 * path — open the finder, walk the columns, pick, do it again — catches it.
 * No model called, no network required; release.yml runs it before signing.
 */
test("changer deux fois de modèle dans une conversation ne jette jamais", async () => {
  // FRESH profile on every run (the workflows harness pattern): a previous
  // run's state — invalidated session, collapsed sidebar — must never flake a smoke test.
  const profile = resolve(__dirname, `.profile-model-switch-${process.pid}`);
  rmSync(profile, { recursive: true, force: true });
  mkdirSync(profile, { recursive: true });
  process.env.OPENMASQ_USER_DATA_DIR = profile;
  const { app, page } = await launchApp();
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`${e.message}`));
  page.on("console", (m) => {
    // The boundary SWALLOWS the error (no pageerror) — its console trace is the witness.
    if (m.type() === "error" && /ErrorBoundary|is not a function/.test(m.text()))
      errors.push(m.text().slice(0, 400));
  });
  // Le réseau Supabase est neutralisé AVANT le semis + le reload : sur un build
  // CONFIGURÉ (release.yml), supabase-js rafraîchirait le jeton "fake" contre le vrai
  // projet, recevrait un refus et purgerait la session — écran de connexion, et le
  // bouton attendu plus bas n'existe jamais (`supabaseStub.ts` raconte la panne).
  await stubSupabaseAuth(page);
  await page.evaluate((authKey) => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    localStorage.setItem(authKey, JSON.stringify({
      access_token: "fake", token_type: "bearer", expires_in: 3600, expires_at: future,
      refresh_token: "fake", user: { id: "u1", email: "test@acme.test", aud: "authenticated", role: "authenticated" },
    }));
    // BOTH settings keys — the global one AND the account-scoped one (`:u1`), like the
    // workflows harness: without the scoped one, the app can fall back to onboarding/login.
    // PIN the language. It is a DEVICE preference read BEFORE the first paint
    // (`state/settings/locale.ts`), and with no value it follows the HOST — a GitHub
    // macOS runner is en_US, so the shell rendered in English while this test asserts
    // French labels ("New conversation" vs "Nouvelle conversation"). Asserting on a
    // translated string is only sound once the language is decided by the test.
    localStorage.setItem("openmasq.language", "fr");
    const s = JSON.stringify({ onboarded: true, redactRulesSeen: true, redactEngine: "patterns", defaultModelId: "auto" });
    for (const k of ["openmasq.settings", "openmasq.settings:u1"]) localStorage.setItem(k, s);
  }, supabaseAuthStorageKey());
  await page.reload();
  await page.waitForLoadState("domcontentloaded");
  await new Promise((r) => setTimeout(r, 2500));

  // Collapsed rail OR expanded sidebar: `DesktopShell` keeps BOTH panels MOUNTED (the
  // dock animates its width and makes them cross), so a text or class
  // selector also catches the one BEHIND — which the conversation area covers, hence
  // a click that can never land (the Windows run 31485829086: "<div
  // class="welcome"> intercepts pointer events", 60 attempts, failure).
  // `getByRole` reads the ACCESSIBILITY tree, which excludes the `aria-hidden` panel: it
  // can only designate the actually active button, whatever the dock's state.
  // (The old selector also looked for "Nouveau chat", a label that no longer exists
  // anywhere: it only held up by its fallback, and the fallback targeted the wrong button.)
  // Make a miss SPEAK: a bare timeout says "waiting for button X" and nothing about what
  // WAS on screen, which cost two blind CI rounds. On failure, name the buttons actually
  // reachable — a login screen and a broken shell then read differently at a glance.
  const newChat = page.getByRole("button", { name: "Nouvelle conversation" }).first();
  try {
    await newChat.click({ timeout: 20_000 });
  } catch (e) {
    const names = await page.getByRole("button").evaluateAll((els) =>
      els.map((el) => (el.getAttribute("aria-label") || el.textContent || "").trim()).filter(Boolean).slice(0, 25),
    );
    throw new Error(`"Nouvelle conversation" introuvable. Boutons visibles: ${JSON.stringify(names)} — ${String(e).slice(0, 200)}`);
  }
  await new Promise((r) => setTimeout(r, 1000));

  // Two full changes: the finder's effect cleanup runs on EVERY
  // focus navigation AND on its unmount — the historical crash varied between the two.
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
      if ((await page.locator(".model-finder").count()) === 0) return; // model chosen
    }
    await page.keyboard.press("Escape").catch(() => {});
  };
  await pickThrough(1);
  await new Promise((r) => setTimeout(r, 800));
  await pickThrough(2);
  await new Promise((r) => setTimeout(r, 1200));

  // The app is still alive (no ErrorBoundary) and no error has fired.
  expect(errors, "le changement de modèle a jeté").toEqual([]);
  await expect(page.locator(".model-chip").first()).toBeAttached();
  await app.close();
});
