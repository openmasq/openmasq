import { _electron as electron } from "@playwright/test";

const SB_AUTH_KEY = `sb-${/https:\/\/([a-z0-9]+)\./.exec(process.env.OPENMASQ_SUPABASE_URL ?? "")?.[1] ?? "local"}-auth-token`;

const D = process.cwd();
const OUT = process.argv[2] ?? "/tmp/mcp";

const app = await electron.launch({
  args: [D],
  cwd: D,
  env: {
    ...process.env,
    OPENMASQ_DISABLE_DB: "1",
    OPENMASQ_E2E: "1",
    OPENMASQ_DISABLE_CF_WATCHDOG: "1",
    OPENMASQ_USER_DATA_DIR: `${D}/e2e/.profile-mcp`,
  },
});
const page = await app.firstWindow();
await page.waitForLoadState("domcontentloaded");

// Login bypass + onboarded settings (account-scoped keys — see memory note).
await page.evaluate((authKey) => {
  const session = {
    access_token: "e2e",
    refresh_token: "e2e",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: { id: "u1", email: "e2e@acme.test" },
  };
  localStorage.setItem(authKey, JSON.stringify(session));
  localStorage.setItem(
    "openmasq.settings:u1",
    JSON.stringify({ onboarded: true, redactRulesSeen: true }),
  );
  localStorage.setItem("openmasq.settings", JSON.stringify({ onboarded: true, redactRulesSeen: true }));
}, SB_AUTH_KEY);
await page.reload();
await page.waitForSelector(".rail-btn, .side-nav-item", { timeout: 30_000 });
await page.waitForTimeout(1500);

// Navigate to Settings → the MCP/Connecteurs tab.
const settingsBtn = page.locator('[title*="glage" i], [aria-label*="glage" i], [title*="Param" i], [aria-label*="Param" i]').first();
await settingsBtn.click().catch(async () => {
  await page.locator(".rail-btn").last().click();
});
await page.waitForTimeout(800);
const mcpTab = page.locator("text=/Connecteurs|Intégrations|MCP/i").first();
await mcpTab.click().catch(() => {});
await page.waitForTimeout(1200);
await page.screenshot({ path: `${OUT}-grid.png`, fullPage: false });

// Open the Slack modal (vendored logo), screenshot, close; then Outlook.
for (const name of ["Slack", "Outlook", "Cloudflare"]) {
  const card = page.locator(`.mcp-card`).filter({ hasText: name }).first();
  await card.scrollIntoViewIfNeeded().catch(() => {});
  const ok = await card.click({ timeout: 4000 }).then(() => true).catch(() => false);
  if (!ok) { console.log("card introuvable:", name); continue; }
  await page.waitForTimeout(700);
  const modal = page.locator(".modal-scrim, [role=dialog]").first();
  await modal.screenshot({ path: `${OUT}-modal-${name.toLowerCase()}.png` }).catch(async () => {
    await page.screenshot({ path: `${OUT}-modal-${name.toLowerCase()}.png` });
  });
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
}
await app.close();
console.log("done");
