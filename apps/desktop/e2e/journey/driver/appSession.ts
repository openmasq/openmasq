import { _electron as electron } from "@playwright/test";
import type { ElectronApplication, Page } from "@playwright/test";
import { rmSync } from "node:fs";
import { startFakeModel, type FakeModel } from "../../fakeModel";
import { emptyConversation, seedSession, type SeedOptions } from "../session";
import { startDevApp } from "./devApp";
import { DESKTOP_DIR, MCP_FIXTURES, PROFILE, TOOLCALL_LOG, WIRE_LOG } from "./paths";

export interface StartOptions extends Omit<SeedOptions, "baseUrl" | "modelId"> {
  /**
   * `jetable` (default) — fresh profile, DB disabled, state seeded via `localStorage`:
   * reproducible, and nothing real is mounted.
   * `reel` — the REAL app profile on the machine: the signed-in account, its keys, its
   * OAuth connectors, its encrypted DB. It's the only mode where the app is the one the
   * person actually uses — and the only one where a mistake has real consequences.
   */
  profil?: "jetable" | "reel";
  /** `fake` (default): local endpoint, zero cost, readable wire. `real`: real credits. */
  model?: "fake" | "real";
  /** `fixtures` (default): simulated connectors · `none` · `reel`: the account's own. */
  mcp?: "fixtures" | "none" | "reel";
  /**
   * WHICH app is driven — and therefore which ENVIRONMENT it joins.
   *
   * `dev` (default in real profile): `electron-vite dev`, served from source, so
   * `.env.development` applies and the app talks to the LOCAL stack (see `devApp.ts`).
   * `build` (default otherwise): the `out/` bundle, with URLs baked at build time — staging
   * or production depending on how it was built, NEVER localhost.
   *
   * ⚠️ This isn't a matter of comfort: a build doesn't re-point to localhost
   * after the fact (the runtime switch only accepts an enumerated name), and rebuilding for
   * each session costs minutes AND gets overwritten by the neighboring session that's
   * rebuilding `out/` on its own side (shared tree).
   */
  mode?: "build" | "dev" | "installed";
  /** Files the native picker will "return" (it can't be automated). */
  attach?: string[];
  /** Folder the native picker will "return" for an MCP path grant. */
  grantDir?: string;
  /** Start over from a clean profile (default). No effect — and ignored — on `profil:"reel"`. */
  fresh?: boolean;
}

/** A live app session, plus what it let through. */
export interface AppSession {
  /** `null` in `dev` mode: there it's `electron-vite` that launches Electron and the driver
   *  ATTACHES to it (CDP). No command needs it — everything goes through the page. */
  app: ElectronApplication | null;
  page: Page;
  /** TRUE if the app was ALREADY launched and we attached to it (`devApp.ts`): its
   *  environment is that of whoever launched it. MUST BE STATED in any report. */
  attache: boolean;
  /** The fake destination — `null` as soon as we talk to a real model. */
  model: FakeModel | null;
  /** Renderer errors since startup — a blank page has nothing else to say. */
  errors: string[];
  /**
   * What the main process wrote, stdout AND stderr. Both, because the MCP tools' raw
   * journal (`[mcp:raw]`) goes out on stdout and exceptions on stderr: capturing only
   * one of them means losing exactly the half we need.
   */
  mainLog: string[];
  opts: StartOptions;
  close: () => Promise<void>;
}

/**
 * Opens the built app the way a user would, and keeps the session ALIVE: that's
 * what distinguishes this driver from a test — the agent looks, decides, acts, looks again.
 *
 * **Two worlds, and you need to know which one you're in.** In `jetable`, nothing real is
 * mounted (fresh profile, DB cut off, destination on 127.0.0.1, fixture connectors): you
 * can break everything, it costs nothing and touches no one. In `reel`, it's the
 * person's app: their authenticated connectors, their credits, their DB. The driver seeds
 * NOTHING there (seeding would overwrite their settings) and erases NOTHING.
 *
 * Either way we arm the two journals that make the promise verifiable:
 * `OPENMASQ_E2E_WIRE_LOG` (what each provider call carries) and `OPENMASQ_MCP_RAW_LOG`
 * (the REAL, un-redacted arguments each tool receives). They contain real
 * PII: they live in `.journey/`, git-ignored, and are never copied anywhere.
 */
export async function startApp(opts: StartOptions = {}): Promise<AppSession> {
  const isReal = opts.profil === "reel";
  const model = opts.model === "real" || isReal ? null : await startFakeModel();
  if (!isReal && opts.fresh !== false) rmSync(PROFILE, { recursive: true, force: true });
  const errors: string[] = [];
  const mainLog: string[] = [];

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    NODE_ENV: "production",
    // The two journals the agent draws its proof from. Neither one is gated by
    // `OPENMASQ_E2E`: they therefore ALSO work against real providers and
    // real connectors, which is the whole point of the real mode.
    OPENMASQ_E2E_WIRE_LOG: WIRE_LOG,
    OPENMASQ_MCP_RAW_LOG: "1",
  };
  if (!isReal) {
    env.OPENMASQ_E2E = "1";
    env.OPENMASQ_DISABLE_DB = "1";
    env.OPENMASQ_USER_DATA_DIR = PROFILE;
    if (opts.mcp !== "none" && opts.mcp !== "reel") {
      env.OPENMASQ_E2E_MCP_FIXTURES = MCP_FIXTURES;
      env.OPENMASQ_E2E_TOOLCALL_LOG = TOOLCALL_LOG;
    }
  }
  if (opts.attach?.length) env.OPENMASQ_E2E_ATTACH = opts.attach.join(":");
  if (opts.grantDir) env.OPENMASQ_E2E_PICK_DIR = opts.grantDir;

  const note = (d: unknown) => mainLog.push(String(d).trimEnd());
  // The REAL profile wants the DEV app: it's the only path to the local environment
  // (`devApp.ts` says why a build can't be re-pointed there). The disposable profile
  // keeps the bundle — it talks to no one, and launches without compiling.
  const mode = opts.mode ?? (isReal ? "dev" : "build");
  const dev = mode === "dev" || mode === "installed" ? await startDevApp(env, mode) : null;
  const app = dev ? null : await electron.launch({ args: [DESKTOP_DIR], cwd: DESKTOP_DIR, env });
  if (dev) dev.onLog(note);
  else if (app) {
    app.process().stdout?.on("data", note);
    app.process().stderr?.on("data", note);
  }
  const page = dev ? dev.page : await app!.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console.error: ${m.text()}`);
  });

  if (!isReal) {
    // ⚠️ The model is carried by the CONVERSATION, not just by `defaultModelId`: without
    // a pre-seeded conversation the app creates one on the product's default model and
    // the send goes out over the network — a send we thought was local.
    await seedSession(page, {
      ...opts,
      ...(model
        ? { baseUrl: model.url, conversations: opts.conversations ?? [emptyConversation()] }
        : {}),
    });
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
  }
  // A real selector, never a delay: the "session loading" branch is
  // a full-screen splash, and a short wait would photograph it while believing the app ready.
  if (opts.onboarded !== false) {
    await page.waitForSelector(".rail-btn, .side-nav-item", { timeout: 120_000 });
  }

  // ⚠️ `attach` and `grantDir` travel via the ENVIRONMENT of the process we launch. Attached to
  // an app someone else launched, we didn't set its environment: the options
  // therefore have NO EFFECT. Say it loudly, because silence is costly — a session could
  // believe it attached a folder, work its whole run on it and report on files that
  // were never there (happened on 17/08, accountant persona run). A warning in
  // `errors` surfaces in `D errors` AND in `start`'s return value.
  if (dev?.attache && (opts.attach?.length || opts.grantDir)) {
    errors.push(
      "⚠️ mode ATTACHÉ : `attach`/`grantDir` sont IGNORÉS (ils passent par l'environnement " +
        "du process, que seul un lancement par le pilote peut poser). Les pièces ne sont PAS " +
        "jointes — relancez l'app par le pilote (`D down` puis `D start`) si vous en avez besoin.",
    );
  }

  return {
    app,
    page,
    model,
    errors,
    mainLog,
    opts,
    attache: dev?.attache ?? false,
    close: async () => {
      if (dev) await dev.close();
      else await app?.close().catch(() => {});
      await model?.close();
    },
  };
}
