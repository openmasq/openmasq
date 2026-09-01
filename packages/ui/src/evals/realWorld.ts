import { spawn } from "node:child_process";
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
// The REAL product modules (pure, zero electron) — the same HTML→text parsing as
// `web_fetch_many` in prod, the same Python PREAMBLE (brand theme + `*_prices` +
// figure collection) and the same yfinance egress proxy as the app's jail. What
// the model reads and executes here is EXACTLY what it would get in the app.
import { htmlToText, HTML_TEXT_MAX } from "../../../../apps/desktop/src/main/net/htmlText";
import { extractArticle } from "../../../../apps/desktop/src/main/net/articleExtract";
import { ALLOW_HOSTS, buildScript } from "../../../../apps/desktop/src/main/python/wheels";
import { startEgressProxy } from "../../../../apps/desktop/src/main/python/egressProxy";

// The eval harness's "real world" branches — OPT-IN via env, EVAL-ONLY:
//   OPENMASQ_EVAL_REAL_WEB=1 → `web_fetch_many` does REAL GETs (product-sanitised).
//   OPENMASQ_EVAL_REAL_PY=1  → `run_python` REALLY executes the model's code,
//     JUST LIKE IN THE APP: baked CPython runtime, product `buildScript` (brand theme,
//     `*_prices`, figure collection — so what the system prompt PROMISES really does
//     exist), `ALLOW_HOSTS` egress proxy (yfinance reachable, every other
//     host refused), seatbelt (scratch-only writes, DNS refused to the child), a
//     hard timeout + group kill. This is NOT the app's full jail (no masking
//     of userData secrets nor rlimits) — same FUNCTIONAL surface, real confinement.

export const realWebEnabled = (): boolean => process.env.OPENMASQ_EVAL_REAL_WEB === "1";
export const realPyEnabled = (): boolean => process.env.OPENMASQ_EVAL_REAL_PY === "1";

/** Real GETs, sanitised by the product pipeline. Public http(s) only, timeout,
 *  byte cap — fail-closed per URL like `webFetchMany`. */
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

/** Real executions — inspectable by a scenario's asserts. `all` accumulates
 *  EVERY execution of the current run (reset by the host on its creation): the model
 *  may succeed at its figure THEN emit a failed call — the last one doesn't summarise the run. */
export const lastRealPy: { result?: RealPyResult; code?: string; all: RealPyResult[] } = { all: [] };

const RUNTIME_DIR = resolve(process.cwd(), "apps/desktop/build/python-runtime/darwin-arm64");
const PY_BIN = join(RUNTIME_DIR, "python", "bin", "python3");
/** matplotlib cache PERSISTENT across runs (like the app's `mplConfigDir()`): without
 *  it, every run redoes the font scan (~seconds) and the first one blows the timeout. */
const MPL_DIR = join(tmpdir(), "openmasq-eval-mpl");

/** Eval seatbelt profile — same network rules as the product jail (`sandbox.ts`):
 *  everything DENY; scratch+mpl-cache-only writes; network ONLY to the loopback
 *  egress proxy (yfinance allow-list); DNS refused to the child (the proxy resolves). */
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

/** Executes the model's code as the APP would: product `buildScript` (brand
 *  theme + `*_prices` + figure saving), `ALLOW_HOSTS` egress proxy
 *  (yfinance reachable, everything else refused), seatbelt, cwd = scratch/out. */
export async function runRealPython(code: string): Promise<RealPyResult> {
  // seatbelt compares RESOLVED paths: /var/folders is a symlink to /private/var.
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
    // ASYNCHRONOUS spawn is mandatory (like the app): the egress proxy runs in THIS
    // process — a spawnSync would block the event loop and thus the proxy (60s deadlock).
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
      // Kill the WHOLE group on timeout (child `detached` → its own pgid).
      const timer = setTimeout(() => {
        try { process.kill(-child.pid!, "SIGKILL"); } catch { /* already dead */ }
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
