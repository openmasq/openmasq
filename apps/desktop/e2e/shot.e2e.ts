import { test, expect } from "@playwright/test";
import { launchApp } from "./helpers";
import { supabaseAuthStorageKey } from "./supabaseAuthKey";

test("library file opens (downloads)", async () => {
  const { app, page } = await launchApp({ useDefaultProfile: true });
  await page.waitForLoadState("domcontentloaded");
  await page.evaluate((authKey) => {
    const future = Math.floor(Date.now() / 1000) + 3600;
    localStorage.setItem(authKey, JSON.stringify({
      access_token: "fake", token_type: "bearer", expires_in: 3600, expires_at: future,
      refresh_token: "fake", user: { id: "u1", email: "test@acme.test", aud: "authenticated", role: "authenticated" },
    }));
    const now = Date.now();
    localStorage.setItem("openmasq.conversations", JSON.stringify([
      { id: "c1", title: "Files", modelId: "auto", createdAt: now, updatedAt: now, messages: [] },
    ]));
    const cur = JSON.parse(localStorage.getItem("openmasq.settings") || "{}");
    localStorage.setItem("openmasq.settings", JSON.stringify({ ...cur, onboarded: true, defaultModelId: "auto" }));
    // Fake the DB file methods (e2e runs with the DB disabled).
    const w = window as any;
    w.openmasq = w.openmasq || {};
    w.openmasq.db = w.openmasq.db || {};
    w.openmasq.db.listFiles = async () => [
      { id: "f1", name: "rapport.txt", mime: "text/plain", redacted: true, createdAt: now },
    ];
    // The real app opens files through main (shell.openPath); record the call.
    w.__opened = [];
    w.openmasq.db.openFile = async (id: string) => { w.__opened.push(id); return true; };
  }, supabaseAuthStorageKey());
  await page.reload();
  await page.waitForLoadState("domcontentloaded");
  await new Promise((r) => setTimeout(r, 2500));
  await page.getByText("Bibliothèque", { exact: true }).first().click().catch(() => {});
  await new Promise((r) => setTimeout(r, 800));
  await page.locator(".library-file").first().click();
  await new Promise((r) => setTimeout(r, 500));
  const opened = await page.evaluate(() => (window as any).__opened || []);
  // eslint-disable-next-line no-console
  console.log("opened ids:", opened);
  expect(opened, "clicking a library file should open it via the main process").toContain("f1");
  await app.close();
});
