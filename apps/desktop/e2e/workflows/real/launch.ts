import { expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { copyFileSync, existsSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { DESKTOP_DIR, FIXTURE_FILE, KEY } from "../env";
import { REAL_EMAIL, REAL_MODEL, REAL_PROFILE, REAL_UID, realStoreSource } from "./config";
import { supabaseAuthStorageKey } from "../../supabaseAuthKey";

/** Lance une app isolée SANS fixtures MCP, le store RÉEL adopté dans son profil.
 *  Le profil (tokens copiés compris) est jetable — supprimé par `cleanup()`. */
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
  // Banc FIXTURES : aucun credential réel n'est adopté — les connexions viennent
  // du fichier de fixtures, servi en mémoire par main. Banc E2E : on adopte le
  // store MCP du compte dev (déchiffrable car c'est le MÊME binaire Electron).
  if (!fixtures) {
    const src = realStoreSource();
    if (!existsSync(src))
      throw new Error(
        `store MCP introuvable: ${src} — connecte les intégrations dans l'app dev d'abord`,
      );
    copyFileSync(src, resolve(profile, "accounts", `mcp-${REAL_UID}.json`));
  }
  // Le magasin de CLÉS du compte, s'il existe : la clé provider est alors présente
  // AU MONTAGE (`keyConfigured` peuplé d'emblée) — ce qui rend inutiles le
  // `keys.set` + le SECOND reload de `seedRealSession`, ~40 s par test.
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
      // Le SOUS-ENSEMBLE de connecteurs à reconnecter (~20 outils au lieu de 450) :
      // le levier de VITESSE et de DÉTERMINISME — prompt court, routeur trivial,
      // moins de tours perdus. C'est ce qui rend l'itération sur la guidance
      // agentique praticable. Absent ⇒ tous les connecteurs du compte.
      ...(opts.connectors?.length ? { OPENMASQ_E2E_MCP_ONLY: opts.connectors.join(",") } : {}),
      // Banc FIXTURES : les connexions canned (déterministes, gratuites côté
      // services). Le MODÈLE, lui, est bien réel dans les deux bancs — c'est lui
      // qu'on évalue. Banc E2E : rien ici, on parle aux VRAIS serveurs.
      ...(fixtures ? { OPENMASQ_E2E_MCP_FIXTURES: FIXTURE_FILE } : {}),
    },
  });
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  return {
    app,
    page,
    wireLog,
    /** `keepLogs` (échec) : le wire log — REDACTÉ par construction — reste en tmp
     *  pour l'autopsie ; le PROFIL (copie des credentials) est TOUJOURS effacé. */
    cleanup: async (keepLogs = false) => {
      await app.close().catch(() => {});
      // ⚠️ `maxRetries` : la baignade Python (`run_python`) écrit encore des
      // milliers de fichiers dans le profil au moment du `close`, d'où des
      // ENOTEMPTY sur un `rmSync` immédiat (mesuré sur le groupe `tableur`). On
      // retente — la suppression du profil (copie de credentials) ne doit JAMAIS
      // être abandonnée sur une course de fichiers.
      rmSync(profile, { recursive: true, force: true, maxRetries: 12, retryDelay: 400 });
      if (!keepLogs) rmSync(wireLog, { force: true });
    },
  };
}

/**
 * FAIL LOUD : chaque connecteur déclaré par le groupe doit exposer au moins un
 * outil. Sans ça, un groupe dont 2 connecteurs sur 3 ne se connectent pas tourne
 * quand même et produit des chiffres qui ne mesurent RIEN — c'est exactement
 * comme ça qu'un « le modèle n'a appelé aucun outil » a été pris pour un échec de
 * routage alors que le service n'était pas branché du tout.
 * `waitForRealTools` ne vérifie qu'UN préfixe ; celui-ci les vérifie tous.
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

/** Session seedée sur l'uid RÉEL (mêmes clés localStorage que `seedSession`, mais
 *  scopées `:<uid réel>` — c'est ce scoping qui fait pointer `mcp:set-user` sur le
 *  store adopté). Moteur `patterns` (déterministe) + modèle payant par défaut. */
export async function seedRealSession(page: Page): Promise<void> {
  const settings = JSON.stringify({
    onboarded: true,
    redactRulesSeen: true,
    redactEngine: "patterns",
    defaultModelId: REAL_MODEL,
    // BYO explicite : en "subscription", `resolveEffectivePlatform` force la
    // passerelle MÊME avec une clé — or notre session est factice, donc le token
    // Supabase qui partirait est refusé (401 « Unsupported token algorithm »).
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
  // La clé provider vient du magasin de clés COPIÉ (voir `launchRealApp`), donc
  // `keyConfigured` est peuplé dès le montage et le routage est BYO — sans second
  // reload. Filet : si ce compte n'a pas de clé au magasin, la poser par l'IPC
  // Réglages et recharger UNE fois (le store ne lit `keys.configured()` qu'au
  // montage ; un `keys.set` tardif ne rafraîchit pas `keyConfigured`, et le send
  // partirait alors sur la PASSERELLE avec le token Supabase factice → 401).
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
  // Le flux sign-in écrase le blob pré-boot — re-seed LIVE (pattern du harnais).
  await page.evaluate(apply, seed);
  const consent = page.getByRole("button", { name: "Compris" });
  if (await consent.count().catch(() => 0)) await consent.first().click().catch(() => {});
}
