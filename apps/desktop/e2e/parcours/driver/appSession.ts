import { _electron as electron } from "@playwright/test";
import type { ElectronApplication, Page } from "@playwright/test";
import { rmSync } from "node:fs";
import { startFakeModel, type FakeModel } from "../../fakeModel";
import { emptyConversation, seedSession, type SeedOptions } from "../session";
import { startDevApp } from "./devApp";
import { DESKTOP_DIR, MCP_FIXTURES, PROFILE, TOOLCALL_LOG, WIRE_LOG } from "./paths";

export interface StartOptions extends Omit<SeedOptions, "baseUrl" | "modelId"> {
  /**
   * `jetable` (défaut) — profil neuf, base désactivée, état semé par `localStorage` :
   * reproductible, et rien de réel n'est monté.
   * `reel` — le VRAI profil de l'app sur la machine : le compte signé, ses clés, ses
   * connecteurs OAuth, sa base chiffrée. C'est le seul mode où l'app est celle que la
   * personne utilise vraiment — et le seul où une bêtise a des conséquences réelles.
   */
  profil?: "jetable" | "reel";
  /** `fake` (défaut) : endpoint local, coût nul, wire lisible. `real` : vrais crédits. */
  model?: "fake" | "real";
  /** `fixtures` (défaut) : connecteurs simulés · `none` · `reel` : ceux du compte. */
  mcp?: "fixtures" | "none" | "reel";
  /**
   * QUELLE app on pilote — et donc quel ENVIRONNEMENT elle joint.
   *
   * `dev` (défaut en profil réel) : `electron-vite dev`, servi depuis les sources, donc
   * `.env.development` s'applique et l'app parle au stack LOCAL (voir `devApp.ts`).
   * `build` (défaut sinon) : le bundle d'`out/`, avec les URL cuites au build — staging
   * ou production selon comment il a été construit, JAMAIS localhost.
   *
   * ⚠️ Ce n'est pas une préférence de confort : un build ne se re-pointe pas sur localhost
   * après coup (la bascule d'exécution n'accepte qu'un nom énuméré), et rebuilder pour
   * chaque session coûte des minutes ET se fait écraser par la session d'à côté qui
   * rebuilde `out/` de son côté (arbre partagé).
   */
  mode?: "build" | "dev" | "installed";
  /** Fichiers que le sélecteur natif « rendra » (il ne s'automatise pas). */
  attach?: string[];
  /** Dossier que le sélecteur natif « rendra » pour un octroi de chemin MCP. */
  grantDir?: string;
  /** Repartir d'un profil vierge (défaut). Sans effet — et ignoré — sur `profil:"reel"`. */
  fresh?: boolean;
}

/** Une session d'app vivante, plus ce qu'elle a laissé passer. */
export interface AppSession {
  /** `null` en mode `dev` : là c'est `electron-vite` qui lance Electron et le pilote s'y
   *  ATTACHE (CDP). Aucune commande n'en a besoin — tout passe par la page. */
  app: ElectronApplication | null;
  page: Page;
  /** VRAI si l'app était DÉJÀ lancée et qu'on s'y est attaché (`devApp.ts`) : son
   *  environnement est celui de qui l'a lancée. À DIRE dans tout rapport. */
  attache: boolean;
  /** Le faux destinataire — `null` dès qu'on parle à un vrai modèle. */
  model: FakeModel | null;
  /** Erreurs renderer depuis le démarrage — une page blanche n'a rien d'autre à dire. */
  errors: string[];
  /**
   * Ce que le process principal a écrit, stdout ET stderr. Les deux, parce que le journal
   * brut des outils MCP (`[mcp:raw]`) part en stdout et les exceptions en stderr : n'en
   * capturer qu'un revient à perdre exactement la moitié dont on a besoin.
   */
  mainLog: string[];
  opts: StartOptions;
  close: () => Promise<void>;
}

/**
 * Ouvre l'app buildée comme un utilisateur l'ouvrirait, et garde la session VIVANTE : c'est
 * ce qui distingue ce pilote d'un test — l'agent regarde, décide, agit, re-regarde.
 *
 * **Deux mondes, et il faut savoir dans lequel on est.** En `jetable`, rien de réel n'est
 * monté (profil neuf, base coupée, destinataire sur 127.0.0.1, connecteurs fixtures) : on
 * peut tout casser, ça ne coûte rien et ça ne touche personne. En `reel`, c'est l'app de la
 * personne : ses connecteurs authentifiés, ses crédits, sa base. Le pilote n'y sème RIEN
 * (semer écraserait ses réglages) et n'efface RIEN.
 *
 * Dans les deux cas on arme les deux journaux qui rendent la promesse vérifiable :
 * `OPENMASQ_E2E_WIRE_LOG` (ce que chaque appel provider emporte) et `OPENMASQ_MCP_RAW_LOG`
 * (les arguments RÉELS, un-redacted, que chaque outil reçoit). Ils contiennent de la vraie
 * PII : ils vivent dans `.parcours/`, ignoré par git, et ne se recopient nulle part.
 */
export async function startApp(opts: StartOptions = {}): Promise<AppSession> {
  const reel = opts.profil === "reel";
  const model = opts.model === "real" || reel ? null : await startFakeModel();
  if (!reel && opts.fresh !== false) rmSync(PROFILE, { recursive: true, force: true });
  const errors: string[] = [];
  const mainLog: string[] = [];

  const env: Record<string, string> = {
    ...(process.env as Record<string, string>),
    NODE_ENV: "production",
    // Les deux journaux dont l'agent tire ses preuves. Ni l'un ni l'autre n'est gardé par
    // `OPENMASQ_E2E` : ils fonctionnent donc AUSSI contre de vrais fournisseurs et de
    // vrais connecteurs, ce qui est tout l'intérêt du mode réel.
    OPENMASQ_E2E_WIRE_LOG: WIRE_LOG,
    OPENMASQ_MCP_RAW_LOG: "1",
  };
  if (!reel) {
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

  const noter = (d: unknown) => mainLog.push(String(d).trimEnd());
  // Le profil RÉEL veut l'app de DÉV : c'est le seul chemin vers l'environnement local
  // (`devApp.ts` dit pourquoi un build ne peut pas y être re-pointé). Le profil jetable
  // garde le bundle — il ne parle à personne, et se lance sans compiler.
  const mode = opts.mode ?? (reel ? "dev" : "build");
  const dev = mode === "dev" || mode === "installed" ? await startDevApp(env, mode) : null;
  const app = dev ? null : await electron.launch({ args: [DESKTOP_DIR], cwd: DESKTOP_DIR, env });
  if (dev) dev.onLog(noter);
  else if (app) {
    app.process().stdout?.on("data", noter);
    app.process().stderr?.on("data", noter);
  }
  const page = dev ? dev.page : await app!.firstWindow();
  await page.waitForLoadState("domcontentloaded");
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
  page.on("console", (m) => {
    if (m.type() === "error") errors.push(`console.error: ${m.text()}`);
  });

  if (!reel) {
    // ⚠️ Le modèle est porté par la CONVERSATION, pas seulement par `defaultModelId` : sans
    // conversation pré-posée l'app en crée une sur le modèle par défaut du produit et
    // l'envoi part sur le réseau — un envoi qu'on croyait local.
    await seedSession(page, {
      ...opts,
      ...(model
        ? { baseUrl: model.url, conversations: opts.conversations ?? [emptyConversation()] }
        : {}),
    });
    await page.reload();
    await page.waitForLoadState("domcontentloaded");
  }
  // Un sélecteur réel, jamais un délai : la branche « session en cours de chargement » est
  // un splash plein écran, et une attente courte le photographie en croyant l'app prête.
  if (opts.onboarded !== false) {
    await page.waitForSelector(".rail-btn, .side-nav-item", { timeout: 120_000 });
  }

  // ⚠️ `attach` et `grantDir` voyagent par l'ENVIRONNEMENT du process qu'on lance. Attaché à
  // une app que quelqu'un d'autre a lancée, on n'a pas posé son environnement : les options
  // sont donc SANS EFFET. Le dire fort, parce que le silence coûte cher — une session peut
  // croire avoir joint un dossier, jouer sa journée dessus et rapporter sur des pièces qui
  // n'ont jamais été là (vécu le 17/08, parcours expert-comptable). Un avertissement dans
  // `errors` remonte dans `D errors` ET dans le retour de `start`.
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
