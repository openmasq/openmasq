import { test } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { launchApp } from "./helpers";

// Sortie des captures : un dossier temporaire de LA machine qui exécute, jamais un
// chemin absolu committé — celui d'avant nommait le répertoire personnel de qui
// l'avait écrit et n'existait sur aucune autre machine.
const OUT = join(tmpdir(), "openmasq-e2e-shots");
mkdirSync(OUT, { recursive: true });

test("library page", async () => {
  const { app, page } = await launchApp({ useDefaultProfile: true });
  await page.waitForLoadState("domcontentloaded");
  await page.evaluate(() => {
    const cur = JSON.parse(localStorage.getItem("openmasq.settings") || "{}");
    localStorage.setItem("openmasq.settings", JSON.stringify({ ...cur, onboarded: true }));
  });
  await page.reload();
  await page.waitForLoadState("domcontentloaded");
  await new Promise((r) => setTimeout(r, 2500));
  await page.getByText("Bibliothèque", { exact: true }).first().click().catch(() => {});
  await new Promise((r) => setTimeout(r, 900));
  await page.screenshot({ path: `${OUT}/library.png` });
  await app.close();
});
