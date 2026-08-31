import { expect, _electron as electron, type ElectronApplication, type Page } from "@playwright/test";
import { readFileSync, existsSync, rmSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { DESKTOP_DIR, FIXTURE_FILE, FIXTURES, KEY, MODEL } from "./env";
import { supabaseAuthStorageKey } from "../supabaseAuthKey";

// The workflows suite's harness: isolated launch, session seed, UI model
// selection, human-style send, write approval. See the spec's doc-comment
// (`../workflows-openrouter.e2e.ts`) for the invariants.
/** Launch one ISOLATED app instance for this test (own profile, own logs) — the shared
 *  helpers.launchApp profile would collide across parallel workers. */
export async function launchWorkflowApp(id: string): Promise<{
  app: ElectronApplication;
  page: Page;
  profile: string;
  wireLog: string;
  callLog: string;
}> {
  const profile = resolve(DESKTOP_DIR, `e2e/.profile-workflows/${id}-${process.pid}`);
  rmSync(profile, { recursive: true, force: true });
  mkdirSync(profile, { recursive: true });
  const wireLog = resolve(tmpdir(), `openmasq-wf-wire-${id}-${process.pid}.jsonl`);
  const callLog = resolve(tmpdir(), `openmasq-wf-calls-${id}-${process.pid}.jsonl`);
  rmSync(wireLog, { force: true });
  rmSync(callLog, { force: true });
  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    NODE_ENV: "production",
    OPENMASQ_DISABLE_DB: "1",
    OPENMASQ_E2E: "1",
    OPENMASQ_USER_DATA_DIR: profile,
    OPENMASQ_E2E_WIRE_LOG: wireLog,
    OPENMASQ_E2E_TOOLCALL_LOG: callLog,
  };
  if (FIXTURES) env.OPENMASQ_E2E_MCP_FIXTURES = FIXTURE_FILE;
  const app = await electron.launch({ args: [DESKTOP_DIR], cwd: DESKTOP_DIR, env });
  const page = await app.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  return { app, page, profile, wireLog, callLog };
}

/** Seed a signed-in session + settings (OpenRouter key, deterministic `patterns`
 *  engine, onboarding done), then reload so auth resolves and mcp:set-user fires
 *  (which is ALSO what registers the fixture connections main-side). After the boot,
 *  RE-SEED the settings LIVE (StorageEvent, the openai-spec pattern): the sign-in
 *  settings flow overwrites the pre-boot blob (defaultModelId reverted to the factory
 *  default in earlier runs), and the live event also re-arms the legacy apiKeys import.
 *  `extraLocalStorage` rides in the SAME pre-reload seed — the documents spec plants a
 *  ready-made conversation (`openmasq.conversations:u1`) this way. */
export async function seedSession(
  page: Page,
  extraLocalStorage: Record<string, string> = {},
): Promise<void> {
  const settings = JSON.stringify({
    onboarded: true,
    redactRulesSeen: true,
    redactEngine: "patterns",
    defaultModelId: MODEL,
    apiKeys: { openrouter: KEY },
  });
  const applySettings = (s: string) => {
    for (const k of ["openmasq.settings", "openmasq.settings:u1"]) {
      localStorage.setItem(k, s);
      window.dispatchEvent(new StorageEvent("storage", { key: k, newValue: s }));
    }
  };
  await page.evaluate(
    ({ s, extra, authKey }: { s: string; extra: Record<string, string>; authKey: string }) => {
      const now = Math.floor(Date.now() / 1000);
      const session = {
        access_token: "e2e-fake-token",
        refresh_token: "e2e-fake-refresh",
        token_type: "bearer",
        expires_in: 999999,
        expires_at: now + 999999,
        user: { id: "u1", email: "e2e@acme.test", aud: "authenticated", role: "authenticated" },
      };
      localStorage.setItem(authKey, JSON.stringify(session));
      for (const k of ["openmasq.settings", "openmasq.settings:u1"]) localStorage.setItem(k, s);
      for (const [k, v] of Object.entries(extra)) localStorage.setItem(k, v);
    },
    { s: settings, extra: extraLocalStorage, authKey: supabaseAuthStorageKey() },
  );
  await page.reload();
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator(".composer-input").first()).toBeVisible({ timeout: 30_000 });
  // Let sign-in + mcp:set-user settle, then re-seed LIVE (see docstring).
  await page.waitForTimeout(4000);
  await page.evaluate(applySettings, settings);
  await page.waitForTimeout(1500);
  // Respond to the GDPR consent toast if shown (it swallows focus).
  const consent = page.getByRole("button", { name: "Compris" });
  if (await consent.count().catch(() => 0)) await consent.first().click().catch(() => {});
}

/** Pick the model VIA THE UI (model-chip → finder → option), like a human — the
 *  seeded `defaultModelId` is overwritten by the sign-in settings flow, so the UI
 *  selection is the only reliable way to pin the conversation's model. The finder's
 *  free-text match scans model IDS (`prompt/modelFilter`), so the full id works. */
export async function selectModel(page: Page, modelId: string = MODEL): Promise<void> {
  await page.locator(".model-chip").first().click();
  const search = page.getByPlaceholder(/Rechercher un modèle/);
  await expect(search).toBeVisible({ timeout: 10_000 });
  await search.fill(modelId);
  // An id can exist in TWO variants (paid + `:free`, e.g. laguna) and the
  // prefix search lists both — discriminate by the "free"
  // badge: `:free` id ⇒ the option WITH the badge, otherwise the option WITHOUT (the
  // paid one goes through the BYO key; the free one through the platform, whose
  // fake e2e auth causes a 401 "Unsupported token algorithm").
  const wantFree = /:free$/.test(modelId);
  const pick = () => {
    const all = page.locator(".model-option");
    const badge = page.locator(".model-free-badge");
    return (wantFree ? all.filter({ has: badge }) : all.filter({ hasNot: badge })).first();
  };
  let option = pick();
  if ((await option.count().catch(() => 0)) === 0) {
    // Catalog variant (dynamic label): retry on a fragment of the id.
    await search.fill(modelId.split("/").pop()?.replace(/:free$/, "") ?? modelId);
    option = pick();
  }
  await option.click({ timeout: 10_000 });
}

/** Send like a human: type, Enter — and when the in-flight composer PII detection
 *  swallows the first Enter (real app behaviour: no retry), press it again once the
 *  detection settles, until the composer empties (= submit actually ran). */
export async function submitPrompt(page: Page, text: string): Promise<void> {
  const input = page.locator(".composer-input");
  await input.click();
  await input.fill(text);
  for (let i = 0; i < 4; i++) {
    await input.press("Enter");
    await page.waitForTimeout(1500);
    if (((await input.inputValue().catch(() => "")) || "").length === 0) return;
  }
  throw new Error("le composer n'a jamais soumis (détection PII bloquée ?)");
}

/** Wait until the renderer can see the fixture tools (mcp:set-user → registration →
 *  refreshRoutes is async after reload) — a deterministic sync point before sending. */
export async function waitForFixtureTools(page: Page): Promise<void> {
  await page.waitForFunction(
    async () => {
      const mcp = (window as unknown as { openmasq?: { mcp?: { listTools?: () => Promise<{ name: string }[]> } } })
        .openmasq?.mcp;
      if (!mcp?.listTools) return false;
      try {
        const tools = await mcp.listTools();
        return tools.some((t) => t.name === "gmail__list_recent");
      } catch {
        return false;
      }
    },
    null,
    { timeout: 30_000 },
  );
}

/** Auto-approve loop, clicking like a human would: the renderer exfil card
 *  ("Allow", .btn-danger) AND the main un-spoofable window (sentinel
 *  https://example.invalid/write-allow). Returns how many approvals were clicked. */
/**
 * Approves writes the way a human would, counting the two surfaces
 * SEPARATELY — this is what lets the spec assert not just "the user
 * confirmed" but "they confirmed WHERE IT MATTERED":
 *   • `system` — the non-spoofable main window, outside the renderer's DOM (send, invitation,
 *     deletion, unverified server);
 *   • `chat`   — the card in the conversation, for a local and reversible gesture.
 * A single counter would let a send slip through the card without anything flagging it.
 */
export function startAutoApprove(app: ElectronApplication, page: Page) {
  let stop = false;
  let system = 0;
  let chat = 0;
  const loop = (async () => {
    while (!stop) {
      try {
        const cardBtn = page.locator(".write-confirm-card .btn-danger");
        if ((await cardBtn.count().catch(() => 0)) > 0) {
          await cardBtn.first().click({ timeout: 1_000 }).catch(() => {});
          chat += 1;
        }
        for (const w of app.windows()) {
          if (w === page) continue;
          const allow = w.locator('a[href="https://example.invalid/write-allow"]');
          if ((await allow.count().catch(() => 0)) > 0) {
            await allow.first().click({ timeout: 1_000 }).catch(() => {});
            system += 1;
          }
        }
      } catch {
        /* window may close mid-poll — keep looping */
      }
      await new Promise((r) => setTimeout(r, 400));
    }
  })();
  return {
    /** Confirmations on the non-spoofable main window. */
    systemCount: () => system,
    /** Confirmations on the in-conversation card. */
    chatCount: () => chat,
    /** Total — for "a write didn't run with no confirmation at all". */
    approvedCount: () => system + chat,
    stop: async () => {
      stop = true;
      await loop;
    },
  };
}

export function readJsonl<T>(path: string): T[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l) as T);
}
