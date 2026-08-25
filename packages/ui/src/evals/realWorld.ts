import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
// Les VRAIS modules produit (purs, zéro electron) — même parsing HTML→texte que
// `web_fetch_many` en prod, même PREAMBLE Python (thème de marque + `*_prices` +
// collecte des figures) et même proxy d'egress yfinance que le jail de l'app. Ce que
// le modèle lit et exécute ici est EXACTEMENT ce qu'il aurait dans l'app.
import { htmlToText, HTML_TEXT_MAX } from "../../../../apps/desktop/src/main/net/htmlText";
import { extractArticle } from "../../../../apps/desktop/src/main/net/articleExtract";
import { ALLOW_HOSTS, buildScript } from "../../../../apps/desktop/src/main/python/wheels";
import { startEgressProxy } from "../../../../apps/desktop/src/main/python/egressProxy";

// Les branches « monde réel » du harnais d'eval — OPT-IN par env, EVAL-ONLY :
//   OPENMASQ_EVAL_REAL_WEB=1 → `web_fetch_many` fait de VRAIS GET (sanitisés produit).
//   OPENMASQ_EVAL_REAL_PY=1  → `run_python` exécute RÉELLEMENT le code du modèle,
//     COMME DANS L'APP : runtime CPython baké, `buildScript` produit (thème de marque,
//     `*_prices`, collecte des figures — ce que le prompt système PROMET existe
//     donc vraiment), proxy d'egress `ALLOW_HOSTS` (yfinance joignable, tout autre
//     hôte refusé), seatbelt (écriture scratch-only, DNS refusé au child), timeout
//     dur + kill du groupe. Ce n'est pas LE jail complet de l'app (pas de masquage
//     des secrets userData ni de rlimits) — même surface FONCTIONNELLE, confinement réel.

export const realWebEnabled = (): boolean => process.env.OPENMASQ_EVAL_REAL_WEB === "1";
export const realPyEnabled = (): boolean => process.env.OPENMASQ_EVAL_REAL_PY === "1";

/** De vrais GET, sanitisés par le pipeline produit. http(s) publics only, timeout,
 *  cap octets — fail-closed par URL comme `webFetchMany`. */
export async function realFetchMany(
  urls: string[],
): Promise<{ url: string; ok: boolean; text?: string; error?: string }[]> {
  return Promise.all(
    urls.slice(0, 6).map(async (url) => {
      try {
        if (!/^https?:\/\//i.test(url)) return { url, ok: false, error: "schéma non autorisé" };
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 15_000);
        try {
          const res = await fetch(url, {
            signal: ctrl.signal,
            headers: { "user-agent": "Mozilla/5.0 (Macintosh) OpenMasqEval/1.0", accept: "text/html,*/*" },
          });
          if (!res.ok) return { url, ok: false, error: `HTTP ${res.status}` };
          const raw = (await res.text()).slice(0, 800_000);
          const text = extractArticle(raw, HTML_TEXT_MAX) ?? htmlToText(raw, HTML_TEXT_MAX);
          if (!text.trim()) return { url, ok: false, error: "page vide ou rendue via JavaScript" };
          return { url, ok: true, text };
        } finally {
          clearTimeout(timer);
        }
      } catch (e) {
        return { url, ok: false, error: e instanceof Error && e.name === "AbortError" ? "délai dépassé" : "échec réseau" };
      }
    }),
  );
}

export interface RealPyResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  images: { name: string; base64: string }[];
  files: { name: string; base64: string; mime: string }[];
}

/** Exécutions réelles — inspectables par les asserts d'un scénario. `all` accumule
 *  TOUTES les exécutions du run en cours (reset par le host à sa création) : le modèle
 *  peut réussir sa figure PUIS émettre un appel raté — le dernier ne résume pas le run. */
export const lastRealPy: { result?: RealPyResult; code?: string; all: RealPyResult[] } = { all: [] };

const RUNTIME_DIR = resolve(process.cwd(), "apps/desktop/build/python-runtime/darwin-arm64");
const PY_BIN = join(RUNTIME_DIR, "python", "bin", "python3");
/** Cache matplotlib PERSISTANT entre les runs (comme `mplConfigDir()` de l'app) : sans
 *  lui, chaque run refait le scan des polices (~secondes) et le premier crève le timeout. */
const MPL_DIR = join(tmpdir(), "openmasq-eval-mpl");

/** Profil seatbelt éval — mêmes règles réseau que le jail produit (`sandbox.ts`) :
 *  tout DENY ; écritures scratch+cache mpl only ; réseau UNIQUEMENT vers le proxy
 *  d'egress loopback (allow-list yfinance) ; DNS refusé au child (le proxy résout). */
function sbProfile(scratch: string, proxyPort: number): string {
  return [
    "(version 1)",
    "(deny default)",
    "(allow process-exec*)",
    "(allow process-fork)",
    "(allow file-read*)",
    "(allow sysctl-read)",
    "(allow mach-lookup)",
    '(deny mach-lookup (global-name "com.apple.mDNSResponder"))',
    '(deny mach-lookup (global-name "com.apple.mDNSResponderHelper"))',
    '(deny mach-lookup (global-name "com.apple.dnssd.service"))',
    `(allow file-write* (subpath "${scratch}") (subpath "${realpathSync(MPL_DIR)}"))`,
    `(allow file-write* (subpath "/dev/null"))`,
    `(allow network-outbound (remote ip "localhost:${proxyPort}"))`,
    "(allow signal (target self))",
  ].join("\n");
}

/** Exécute le code du modèle comme l'APP le ferait : `buildScript` produit (thème
 *  de marque + `*_prices` + save des figures), proxy d'egress `ALLOW_HOSTS`
 *  (yfinance joignable, tout le reste refusé), seatbelt, cwd = scratch/out. */
export async function runRealPython(code: string): Promise<RealPyResult> {
  // seatbelt compare des chemins RÉSOLUS : /var/folders est un symlink de /private/var.
  mkdirSync(MPL_DIR, { recursive: true });
  const scratch = realpathSync(mkdtempSync(join(tmpdir(), "openmasq-eval-py-")));
  const figDir = join(scratch, "fig");
  const outDir = join(scratch, "out");
  const tmpDir = join(scratch, "tmp");
  for (const d of [figDir, outDir, tmpDir]) mkdirSync(d);
  const proxy = await startEgressProxy(ALLOW_HOSTS);
  const proxyUrl = `http://127.0.0.1:${proxy.port}`;
  try {
    writeFileSync(join(scratch, "main.py"), buildScript(code));
    // spawn ASYNCHRONE obligatoire (comme l'app) : le proxy d'egress tourne dans CE
    // process — un spawnSync bloquerait l'event loop et donc le proxy (deadlock 60 s).
    const proc = await new Promise<{ status: number | null; stdout: string; stderr: string }>((done) => {
      const child = spawn(
        "/usr/bin/sandbox-exec",
        ["-p", sbProfile(scratch, proxy.port), PY_BIN, join(scratch, "main.py")],
        {
          cwd: outDir,
          detached: true,
          env: {
            PATH: process.env.PATH ?? "",
            HOME: scratch,
            TMPDIR: tmpDir, TMP: tmpDir, TEMP: tmpDir, SQLITE_TMPDIR: tmpDir,
            OPENMASQ_FIG_DIR: figDir,
            OPENMASQ_FONT_DIR: join(RUNTIME_DIR, "fonts"),
            MPLBACKEND: "Agg",
            MPLCONFIGDIR: MPL_DIR,
            PYTHONDONTWRITEBYTECODE: "1",
            HTTPS_PROXY: proxyUrl, HTTP_PROXY: proxyUrl,
            https_proxy: proxyUrl, http_proxy: proxyUrl,
            ALL_PROXY: proxyUrl, all_proxy: proxyUrl,
            NO_PROXY: "",
          },
        },
      );
      let stdout = "";
      let stderr = "";
      child.stdout?.on("data", (d) => (stdout += d));
      child.stderr?.on("data", (d) => (stderr += d));
      // Kill du GROUPE entier au timeout (child `detached` → son propre pgid).
      const timer = setTimeout(() => {
        try { process.kill(-child.pid!, "SIGKILL"); } catch { /* déjà mort */ }
      }, 60_000);
      child.on("close", (status) => {
        clearTimeout(timer);
        done({ status, stdout, stderr });
      });
      child.on("error", () => {
        clearTimeout(timer);
        done({ status: 1, stdout, stderr: stderr || "spawn error" });
      });
    });
    const images = readdirSync(figDir)
      .filter((f) => f.endsWith(".png"))
      .map((name) => ({ name, base64: readFileSync(join(figDir, name)).toString("base64") }));
    const files = readdirSync(outDir).map((name) => ({
      name,
      base64: readFileSync(join(outDir, name)).toString("base64"),
      mime: "application/octet-stream",
    }));
    const result: RealPyResult = {
      ok: proc.status === 0,
      stdout: (proc.stdout ?? "").slice(0, 20_000),
      stderr: (proc.stderr ?? "").slice(0, 8_000),
      images,
      files,
    };
    lastRealPy.result = result;
    lastRealPy.code = code;
    lastRealPy.all.push(result);
    return result;
  } finally {
    proxy.close();
    rmSync(scratch, { recursive: true, force: true });
  }
}
