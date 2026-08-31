import { expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { DESKTOP_DIR, FIXTURE_FILE, KEY } from "../env";
import { REAL_EMAIL, REAL_MODEL, REAL_PROFILE, REAL_UID, realStoreSource } from "./config";
import { supabaseAuthStorageKey } from "../../supabaseAuthKey";

/** Launches an isolated app WITHOUT MCP fixtures, the REAL store adopted into its profile.
 *  The profile (copied tokens included) is disposable — removed by `cleanup()`. */
export async function launchRealApp(
  id: string,
  opts: { connectors?: string[]; mode?: "fixtures" | "e2e" } = {},
): Promise<{
  app: ElectronApplication;
  page: Page;
  wireLog: string;
  cleanup: (keepLogs?: boolean) => Promise<void>;
}> {
  const fixtures = opts.mode === "fixtures";
  const profile = resolve(DESKTOP_DIR, `e2e/.profile-workflows/real-${id}-${process.pid}`);
  rmSync(profile, { recursive: true, force: true });
  mkdirSync(resolve(profile, "accounts"), { recursive: true });
  // FIXTURES bench: no real credential is adopted — connections come from
  // the fixtures file, served in memory by main. E2E bench: we adopt the
  // dev account's MCP store (decryptable because it's the SAME Electron binary).
  if (!fixtures) {
    const src = realStoreSource();
    if (!existsSync(src))
      throw new Error(
        `store MCP introuvable: ${src} — connecte les intégrations dans l'app dev d'abord`,
      );
    copyFileSync(src, resolve(profile, "accounts", `mcp-${REAL_UID}.json`));
  }
  // The account's KEY store, if it exists: the provider key is then present
  // AT MOUNT (`keyConfigured` populated right away) — which makes the
  // `keys.set` + the SECOND reload of `seedRealSession` unnecessary, ~40 s per test.
  const keysSrc = resolve(REAL_PROFILE, "accounts", `keys-${REAL_UID}.enc`);
  if (existsSync(keysSrc))
    copyFileSync(keysSrc, resolve(profile, "accounts", `keys-${REAL_UID}.enc`));

  const wireLog = resolve(tmpdir(), `openmasq-real-wire-${id}-${process.pid}.jsonl`);
  rmSync(wireLog, { force: true });
  const app = await electron.launch({
    args: [DESKTOP_DIR],
    cwd: DESKTOP_DIR,
    env: {
      ...(process.env as Record<string, string>),
      NODE_ENV: "production",
      OPENMASQ_DISABLE_DB: "1",
      OPENMASQ_E2E: "1",
      OPENMASQ_USER_DATA_DIR: profile,
      OPENMASQ_E2E_WIRE_LOG: wireLog,
      // The SUBSET of connectors to reconnect (~20 tools instead of 450):
      // the SPEED and DETERMINISM lever — short prompt, trivial router,
      // fewer wasted turns. This is what makes iterating on agentic
      // guidance practical. Absent ⇒ all the account's connectors.
      ...(opts.connectors?.length ? { OPENMASQ_E2E_MCP_ONLY: opts.connectors.join(",") } : {}),
      // FIXTURES bench: canned connections (deterministic, free on the
      // services' side). The MODEL, though, is indeed real in both benches — it's what
      // we're evaluating. E2E bench: nothing here, we talk to the REAL servers.
      ...(fixtures ? { OPENMASQ_E2E_MCP_FIXTURES: FIXTURE_FILE } : {}),
    },
  });
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  return {
    app,
    page,
    wireLog,
    /** `keepLogs` (failure): the wire log — REDACTED by construction — stays in tmp
     *  for the autopsy; the PROFILE (copy of the credentials) is ALWAYS erased. */
    cleanup: async (keepLogs = false) => {
      await app.close().catch(() => {});
      // ⚠️ `maxRetries`: the Python sandbox (`run_python`) is still writing
      // thousands of files into the profile at `close` time, hence
      // ENOTEMPTY on an immediate `rmSync` (measured on the `tableur` group). We
      // retry — deleting the profile (copy of credentials) must NEVER
      // be abandoned to a file race.
      rmSync(profile, { recursive: true, force: true, maxRetries: 12, retryDelay: 400 });
      if (!keepLogs) rmSync(wireLog, { force: true });
    },
  };
}

/**
 * FAIL LOUD: every connector declared by the group must expose at least one
 * tool. Without this, a group where 2 out of 3 connectors don't connect still
 * runs and produces numbers that measure NOTHING — that's exactly
 * how a "the model called no tool" outcome was mistaken for a routing
 * failure when the service wasn't connected at all.
 * `waitForRealTools` only checks ONE prefix; this one checks all of them.
 */
export async function assertConnectorsAvailable(page: Page, connectors: string[]): Promise<void> {
  if (!connectors.length) return;
  const names = await page.evaluate(async () => {
    const mcp = (
      window as unknown as { openmasq?: { mcp?: { listTools?: () => Promise<{ name: string }[]> } } }
    ).openmasq?.mcp;
    return mcp?.listTools ? (await mcp.listTools()).map((t) => t.name) : [];
  });
  const missing = connectors.filter((c) => !names.some((n) => n.startsWith(`${c}__`)));
  if (missing.length)
    throw new Error(
      `connecteur(s) déclaré(s) mais NON connecté(s) : ${missing.join(", ")} — ` +
        `le run ne mesurerait rien. Connecte-les dans l'app dev, ou retire-les du groupe.`,
    );
}

/** Session seeded on the REAL uid (same localStorage keys as `seedSession`, but
 *  scoped `:<real uid>` — it's this scoping that makes `mcp:set-user` point at the
 *  adopted store). `patterns` engine (deterministic) + paid model by default. */
export async function seedRealSession(page: Page): Promise<void> {
  const settings = JSON.stringify({
    onboarded: true,
    redactRulesSeen: true,
    redactEngine: "patterns",
    defaultModelId: REAL_MODEL,
    // Explicit BYO: in "subscription" mode, `resolveEffectivePlatform` forces the
    // gateway EVEN with a key — but our session is fake, so the Supabase
    // token that would go out gets refused (401 "Unsupported token algorithm").
    billingMode: "byo",
    apiKeys: { openrouter: KEY },
  });
  const seed = { s: settings, uid: REAL_UID, email: REAL_EMAIL, authKey: supabaseAuthStorageKey() };
  const apply = ({ s, uid, email, authKey }: { s: string; uid: string; email: string; authKey: string }) => {
    const now = Math.floor(Date.now() / 1000);
    const session = {
      access_token: "e2e-fake-token",
      refresh_token: "e2e-fake-refresh",
      token_type: "bearer",
      expires_in: 999999,
      expires_at: now + 999999,
      user: {
        id: uid,
        email,
        aud: "authenticated",
        role: "authenticated",
      },
    };
    localStorage.setItem(authKey, JSON.stringify(session));
    for (const k of ["openmasq.settings", `openmasq.settings:${uid}`]) {
      localStorage.setItem(k, s);
      window.dispatchEvent(new StorageEvent("storage", { key: k, newValue: s }));
    }
  };
  await page.evaluate(apply, seed);
  await page.reload();
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator(".composer-input").first()).toBeVisible({ timeout: 30_000 });
  // The provider key comes from the COPIED key store (see `launchRealApp`), so
  // `keyConfigured` is populated right at mount and routing is BYO — no second
  // reload needed. Safety net: if this account has no key in the store, set it via the
  // Settings IPC and reload ONCE (the store only reads `keys.configured()` at
  // mount; a late `keys.set` doesn't refresh `keyConfigured`, and the send
  // would then go out over the GATEWAY with the fake Supabase token → 401).
  const hasKey = async () =>
    (
      await page.evaluate(() =>
        (
          window as unknown as { openmasq: { keys: { configured: () => Promise<string[]> } } }
        ).openmasq.keys.configured(),
      )
    ).includes("openrouter");
  if (!(await hasKey())) {
    await page.evaluate(
      (k) =>
        (
          window as unknown as { openmasq: { keys: { set: (id: string, v: string) => Promise<void> } } }
        ).openmasq.keys.set("openrouter", k),
      KEY!,
    );
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
    await expect(page.locator(".composer-input").first()).toBeVisible({ timeout: 30_000 });
  }
  // The sign-in flow overwrites the pre-boot blob — re-seed LIVE (harness pattern).
  await page.evaluate(apply, seed);
  const consent = page.getByRole("button", { name: "Compris" });
  if (await consent.count().catch(() => 0)) await consent.first().click().catch(() => {});
}
