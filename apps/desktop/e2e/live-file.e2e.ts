import { test, expect } from "@playwright/test";
import { writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchApp } from "./helpers";
import { supabaseAuthStorageKey } from "./supabaseAuthKey";

/**
 * « Le modèle écrit, l'utilisateur voit » — end to end, on the built app.
 *
 * The write here is done from OUTSIDE the renderer, exactly as the assistant's filesystem
 * tools do it (main → worker → disk). Nothing in the UI is clicked to refresh: if the panel
 * shows the new text, the watcher → IPC → panel chain works for a model write too.
 *
 * No API call, no cost. The folder grant goes through the REAL gate (audit M-4: a root is
 * only accepted if the NATIVE picker returned it), so the dialog is stubbed in MAIN — the
 * rest of the chain runs for real.
 */
// Dossier temporaire de LA machine qui exécute, jamais un chemin absolu committé :
// celui d'avant nommait le répertoire personnel de qui l'avait écrit.
const SCRATCH = join(tmpdir(), "openmasq-e2e-live");
const ROOT = `${SCRATCH}/live-test`;
const FILE = `${ROOT}/notes.txt`;

const BEFORE = "Première version du document.";
const AFTER = "Version réécrite par l assistant.";

test("un fichier modifié sur le disque se recharge tout seul dans le panneau", async () => {
  rmSync(ROOT, { recursive: true, force: true });
  mkdirSync(ROOT, { recursive: true });
  writeFileSync(FILE, BEFORE, "utf8");

  const { app, page } = await launchApp({ useDefaultProfile: true });
  await page.waitForLoadState("domcontentloaded");
  await page.evaluate((authKey) => {
    const now = Math.floor(Date.now() / 1000);
    localStorage.setItem(
      authKey,
      JSON.stringify({
        access_token: "fake",
        refresh_token: "fake",
        token_type: "bearer",
        expires_in: 999999,
        expires_at: now + 999999,
        user: { id: "u1", email: "e2e@acme.test", aud: "authenticated", role: "authenticated" },
      }),
    );
    localStorage.setItem(
      "openmasq.settings:u1",
      JSON.stringify({ onboarded: true, redactRulesSeen: true }),
    );
    localStorage.setItem("openmasq.conversations:u1", "[]");
  }, supabaseAuthStorageKey());
  await page.reload();
  await page.waitForLoadState("domcontentloaded");
  await page.waitForSelector(".rail-btn, .side-nav-item", { timeout: 60000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 2500));

  // A test cannot click a native dialog — stub it in MAIN so `pickDir → notePickedDir →
  // addStdio → connect` runs for real against the real grant gate.
  await app.evaluate(({ dialog }, root) => {
    (dialog as unknown as { showOpenDialog: unknown }).showOpenDialog = async () => ({
      canceled: false,
      filePaths: [root],
    });
  }, ROOT);

  const granted = await page.evaluate(async (root) => {
    const api = (window as unknown as { openmasq: unknown }).openmasq as {
      mcp: {
        pickDir(): Promise<string | undefined>;
        addStdio(id: string, env: unknown, params: unknown): Promise<{ id?: string }>;
        connect(id: string): Promise<{ connected: boolean }>;
        remove(id: string): Promise<void>;
      };
      localFs?: { roots(): Promise<{ available: boolean; roots: string[] }> };
    };
    // The profile is REUSED between runs, so a previous test's grant is still installed and
    // `addStdio` would leave it in place — the browser would then open someone else's
    // folder. Start from nothing.
    await api.mcp.remove("local-filesystem").catch(() => undefined);
    await api.mcp.pickDir().catch(() => undefined);
    const added = await api.mcp.addStdio("filesystem", {}, { root: [root] }).catch(() => ({}));
    // `addStdio` MINTS the instance id (`local-<catalogId>`).
    await api.mcp.connect(added.id || "local-filesystem").catch(() => ({ connected: false }));
    return api.localFs?.roots();
  }, ROOT);
  // Assert OUR root, not merely "something is granted" — a stale grant from a previous run
  // would otherwise satisfy a weaker check and the test would browse the wrong folder.
  expect(granted?.roots, "notre dossier doit être accordé").toContain(ROOT);

  await page.getByText("Bibliothèque", { exact: true }).first().click().catch(() => {});
  await new Promise((r) => setTimeout(r, 1200));
  await page.getByRole("button", { name: /Dossiers/ }).first().click().catch(() => {});
  await new Promise((r) => setTimeout(r, 1200));
  await page.getByText("notes.txt", { exact: false }).first().click().catch(() => {});
  await new Promise((r) => setTimeout(r, 1500));
  await page.getByRole("button", { name: /Modifier/ }).first().click().catch(() => {});
  await new Promise((r) => setTimeout(r, 1500));

  const editor = page.locator(".fold-edit-area");
  await expect(editor).toHaveValue(new RegExp(BEFORE.slice(0, 20)), { timeout: 20000 });
  await page.screenshot({ path: `${SCRATCH}/live-01-before.png` });

  // THE point of the test: a write from outside, and NOTHING clicked afterwards.
  writeFileSync(FILE, AFTER, "utf8");
  await expect(editor).toHaveValue(new RegExp(AFTER.slice(0, 20)), { timeout: 20000 });
  await page.screenshot({ path: `${SCRATCH}/live-02-after.png` });

  await app.close();
});
