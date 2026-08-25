import { chromium, type Browser, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { resolve } from "node:path";
import { DESKTOP_DIR, MAIN_LOG } from "./paths";
import { suivreLog } from "./suivreLog";
import { BRAND } from "@openmasq/branding";

/**
 * L'app de DÉV — `electron-vite dev`, pilotée par CDP.
 *
 * ⚠️ **C'est le seul mode qui parle à l'environnement LOCAL, et ce n'est pas un réglage :
 * c'est une conséquence.** Les URL du renderer (`appEnv.ts`) viennent d'`import.meta.env`,
 * donc elles sont CUITES au build ; la bascule d'exécution, elle, n'accepte qu'un nom
 * ÉNUMÉRÉ (`src/environments/` : production | staging — exprès, une URL libre dans un
 * pointeur vaudrait egress arbitraire). Un binaire buildé ne peut donc PAS être pointé sur
 * localhost après coup : le seul chemin est le serveur de dév, qui applique
 * `.env.development` au moment de servir. Le même mode donne gratuitement la CSP de dév
 * (un plugin Vite y injecte `http://localhost:*`), qu'un build oblige sinon à rapiécer à
 * la main dans `out/renderer/index.html` — et ce rapiéçage saute au rebuild suivant.
 *
 * Pourquoi CDP plutôt que `electron.launch` : c'est `electron-vite` qui lance Electron
 * (il compile main/preload en mode dév et sert le renderer), donc Playwright ne peut que
 * s'ATTACHER. Le pilote n'y perd rien — aucune commande n'a besoin du handle Electron,
 * toutes passent par la page — et on gagne de ne rien rebuilder entre deux sessions.
 */
export interface DevApp {
  page: Page;
  /** VRAI si on s'est attaché à une app qu'on n'a pas lancée (voir `attacheOuSpawn`).
   *  L'agent DOIT le dire dans son rapport : l'environnement est celui de la personne
   *  qui a lancé l'app, pas celui que le pilote aurait armé. */
  attache: boolean;
  /** Ce que le process principal écrit (`[mcp:raw]` en stdout, exceptions en stderr).
   *  Rejoue ce qui a été écrit AVANT l'abonnement : le démarrage parle pendant que le
   *  pilote attend encore le port CDP. */
  onLog: (noter: (d: unknown) => void) => void;
  close: () => Promise<void>;
}

/** Combien de lignes de démarrage on garde pour expliquer un échec d'attache. */
const TAIL_LINES = 40;

const BIN = resolve(DESKTOP_DIR, "../../node_modules/.bin/electron-vite");
/** L'app INSTALLÉE (mode `installed`) — le binaire empaqueté, comme un utilisateur
 *  l'a sur sa machine. Surchargable par `OPENMASQ_INSTALLED_APP` (un autre chemin,
 *  une autre machine). */
const INSTALLED_BIN =
  process.env.OPENMASQ_INSTALLED_APP ?? `/Applications/${BRAND.name}.app/Contents/MacOS/${BRAND.name}`;
/** Port CDP fixe : une seule session de pilote à la fois (un démon, une app). */
const CDP_PORT = 9333;
/** Le premier démarrage compile main + preload : c'est long, mais ça reste du dév. */
const READY_TIMEOUT_MS = 180_000;

const dors = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function attendCdp(port: number, finAt: number, mort: () => string | null): Promise<string> {
  for (;;) {
    try {
      const r = await fetch(`http://127.0.0.1:${port}/json/version`);
      if (r.ok) return `http://127.0.0.1:${port}`;
    } catch {
      /* pas encore là */
    }
    // Un enfant déjà mort n'ouvrira jamais le port : attendre les 180 s complètes ne fait
    // qu'éloigner l'opérateur de la cause, qui vient d'être écrite sur stderr.
    const fin = mort();
    if (fin) throw new Error(`l'app s'est arrêtée avant d'ouvrir son port CDP (${fin})`);
    if (Date.now() > finAt) throw new Error("electron-vite dev n'a pas ouvert son port CDP");
    await dors(500);
  }
}

/**
 * La fenêtre de l'APP parmi les cibles CDP. En dév c'est la page servie par le serveur
 * local ; empaquetée, le renderer vit en `file://…/index.html`. Une page `devtools://` ou
 * `about:blank` peut exister à côté — d'où un filtre par ORIGINE, en liste blanche.
 *
 * ⚠️ Le filtre ne doit RIEN dire de la fin de l'URL. Une version antérieure exigeait un
 * dernier caractère qui ne soit pas `/`, et la racine du serveur de dév (`http://localhost:5173/`,
 * la forme que Chromium NORMALISE) n'a donc jamais correspondu : le pilote attendait 180 s
 * puis annonçait « aucune fenêtre d'app » devant une app parfaitement ouverte.
 */
const ORIGINE_APP = /^(https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?(\/|$)|file:\/\/)/;

async function attendPage(navigateur: Browser, finAt: number): Promise<Page> {
  for (;;) {
    for (const ctx of navigateur.contexts()) {
      for (const p of ctx.pages()) {
        if (ORIGINE_APP.test(p.url())) return p;
      }
    }
    if (Date.now() > finAt) throw new Error("aucune fenêtre d'app (serveur de dév ou file://)");
    await dors(500);
  }
}

/** Le port CDP répond-il DÉJÀ ? Une seule tentative — on ne veut pas attendre ici. */
async function portOuvert(port: number): Promise<boolean> {
  try {
    const r = await fetch(`http://127.0.0.1:${port}/json/version`, {
      signal: AbortSignal.timeout(1500),
    });
    return r.ok;
  } catch {
    return false;
  }
}

/**
 * S'ATTACHER à une app déjà lancée, plutôt que la lancer.
 *
 * ⚠️ **Ce n'est pas un raccourci : sur une machine où la session d'agent est elle-même
 * confinée, c'est la SEULE voie.** Chromium crée un bac à sable par renderer / GPU /
 * service réseau, et macOS refuse `sandbox_apply` à un process déjà sous seatbelt : une
 * app lancée DEPUIS une session confinée ouvre son port CDP puis meurt sans renderer
 * (`GPU process exit_code=6`). Lancée par un terminal normal, elle garde son confinement
 * INTACT — on ne lui retire rien, on déplace seulement qui l'a mise au monde.
 *
 * Ce que le mode attaché coûte, et qu'il faut savoir : le pilote ne tient aucun tuyau, donc
 * la sortie du process principal (`[mcp:raw]`, exceptions) ne lui parvient que par
 * `.parcours/main.log` — d'où la redirection dans la commande de lancement. Et `close()`
 * ne tue RIEN : on ne ferme pas l'app de quelqu'un d'autre.
 */
async function attacher(): Promise<DevApp> {
  const navigateur = await chromium.connectOverCDP(`http://127.0.0.1:${CDP_PORT}`);
  const page = await attendPage(navigateur, Date.now() + 30_000);
  const arrets: Array<() => void> = [];
  return {
    page,
    attache: true,
    onLog: (noter) => arrets.push(suivreLog(MAIN_LOG, noter)),
    close: async () => {
      for (const a of arrets) a();
      await navigateur.close().catch(() => {});
    },
  };
}

export async function startDevApp(
  env: Record<string, string>,
  /** `installed` : piloter le binaire EMPAQUETÉ (INSTALLED_BIN) plutôt que le serveur
   *  de dév — l'app telle qu'un utilisateur l'a installée, chaînes de signature et
   *  runtime compris. Les flags Chromium (dont le port CDP) restent acceptés par un
   *  build empaqueté ; seul l'inspecteur NODE est fusé. */
  mode: "dev" | "installed" = "dev",
): Promise<DevApp> {
  // Une app est déjà là sur le port : s'y attacher. Spawner par-dessus donnerait un second
  // Electron qui échoue sur le port pris — et c'est ce qui a déjà fait diagnostiquer « port
  // occupé » là où la cause était tout autre.
  if (await portOuvert(CDP_PORT)) return attacher();
  const [bin, args] =
    mode === "installed"
      ? [INSTALLED_BIN, [`--remote-debugging-port=${CDP_PORT}`]]
      : [BIN, ["dev", `--remoteDebuggingPort=${CDP_PORT}`]];
  const enfant: ChildProcess = spawn(bin, args, {
    cwd: DESKTOP_DIR,
    env: { ...env, ...(mode === "installed" ? {} : { NODE_ENV: "development" }) },
    // Groupe de processus À PART : `electron-vite` lance Electron comme ENFANT, donc tuer
    // le seul PID connu laisserait l'app vivante (et le port CDP pris au prochain start).
    detached: true,
    stdio: ["ignore", "pipe", "pipe"],
  });
  // ⚠️ Brancher les flux TOUT DE SUITE, pas après l'attache. Ce que l'app dit en mourant
  // (« sandbox initialization failed », un module natif absent, un port déjà pris) sort
  // AVANT que le port CDP existe : abonné après coup, l'opérateur ne voyait que
  // « socket hang up » et cherchait la cause au mauvais endroit. Personne ne lisant les
  // tuyaux, ils se remplissaient en plus jusqu'à bloquer l'enfant.
  const tail: string[] = [];
  const abonnes: Array<(d: unknown) => void> = [];
  const capter = (d: unknown) => {
    for (const l of String(d).split("\n")) if (l.trim()) tail.push(l.trimEnd());
    if (tail.length > TAIL_LINES) tail.splice(0, tail.length - TAIL_LINES);
    for (const noter of abonnes) noter(d);
  };
  enfant.stdout?.on("data", capter);
  enfant.stderr?.on("data", capter);
  let mort: string | null = null;
  enfant.on("exit", (code, signal) => {
    mort = signal ? `signal ${signal}` : `code ${code}`;
  });

  const finAt = Date.now() + READY_TIMEOUT_MS;
  let page: Page;
  let navigateur: Browser | null = null;
  try {
    navigateur = await chromium.connectOverCDP(await attendCdp(CDP_PORT, finAt, () => mort));
    page = await attendPage(navigateur, finAt);
  } catch (e) {
    // Tuer le groupe : un enfant laissé vivant garde le port CDP, et la tentative suivante
    // échoue « autrement » — c'est ce qui fait diagnostiquer un port occupé au lieu de la
    // vraie cause.
    await navigateur?.close().catch(() => {});
    try {
      if (enfant.pid) process.kill(-enfant.pid, "SIGTERM");
    } catch {
      /* déjà mort */
    }
    const sortie = tail.length ? `\n--- dernières lignes de ${bin} ---\n${tail.join("\n")}` : "";
    throw new Error(`${e instanceof Error ? e.message : String(e)}${sortie}`);
  }
  return {
    page,
    attache: false,
    onLog: (noter) => {
      for (const l of tail) noter(l);
      abonnes.push(noter);
    },
    close: async () => {
      // Détacher AVANT de tuer : fermer le navigateur CDP ne ferme pas l'app, et tuer
      // l'app pendant que Playwright y parle produit une erreur qui masque la vraie.
      await navigateur?.close().catch(() => {});
      try {
        if (enfant.pid) process.kill(-enfant.pid, "SIGTERM");
      } catch {
        /* déjà mort */
      }
    },
  };
}
