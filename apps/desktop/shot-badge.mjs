import { _electron as electron } from "@playwright/test";
import { resolve } from "node:path";

const SB_AUTH_KEY = `sb-${/https:\/\/([a-z0-9]+)\./.exec(process.env.OPENMASQ_SUPABASE_URL ?? "")?.[1] ?? "local"}-auth-token`;

const DESKTOP_DIR = process.cwd();
const app = await electron.launch({
  args: [DESKTOP_DIR],
  cwd: DESKTOP_DIR,
  env: {
    ...process.env,
    NODE_ENV: "production",
    OPENMASQ_DISABLE_DB: "1",
    OPENMASQ_E2E: "1",
    OPENMASQ_DISABLE_CF_WATCHDOG: "1",
    OPENMASQ_USER_DATA_DIR: resolve(DESKTOP_DIR, "e2e/.profile-badge"),
  },
});
const page = await app.firstWindow();
await page.waitForLoadState("domcontentloaded");
await page.evaluate((authKey) => {
  localStorage.setItem(
    authKey,
    JSON.stringify({
      access_token: "fake", refresh_token: "fake",
      expires_at: Math.floor(Date.now() / 1000) + 86400, token_type: "bearer",
      user: { id: "u1", email: "dev@acme.test", aud: "authenticated", role: "authenticated" },
    }),
  );
  localStorage.setItem("openmasq.settings", JSON.stringify({ onboarded: true }));
  localStorage.setItem("openmasq.conversations:u1", "[]");
}, SB_AUTH_KEY);
await page.reload();
await page.waitForLoadState("domcontentloaded");
await page.waitForTimeout(2500);
for (let i = 0; i < 6; i++) {
  const b = page.getByText("Compris", { exact: true });
  if (await b.count()) { await b.click({ timeout: 3000 }).catch(() => {}); break; }
  await page.waitForTimeout(500);
}
await page.waitForTimeout(500);
await page.locator('[aria-label="Compte & paramètres"]').first().click({ force: true });
await page.waitForTimeout(2000);
await page.locator(".rrm-tags").first().scrollIntoViewIfNeeded();
await page.waitForTimeout(400);

const badge = await page.locator(".rrm-tag.ai").first().evaluate((e) => {
  const r = e.getBoundingClientRect();
  const s = getComputedStyle(e);
  return { w: +r.width.toFixed(1), h: +r.height.toFixed(1), font: s.fontSize, lh: s.lineHeight };
});
const chip = await page.locator(".rrm-cat").first().evaluate((e) => {
  const r = e.getBoundingClientRect();
  return { w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
});
const label = await page.locator(".rrm-cat-label").first().evaluate(
  (e) => getComputedStyle(e).fontSize,
);
console.log("BETA badge:", JSON.stringify(badge));
console.log("chip:", JSON.stringify(chip), "| label font:", label);
console.log("badge height / chip height:", (badge.h / chip.h).toFixed(2));

await page.locator(".settings-rules-card").first().screenshot({ path: "shot-badge-01.png" });
await app.close();
