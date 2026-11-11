import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import { existsSync, mkdirSync, readFileSync, realpathSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { basename, dirname, join, sep } from "node:path";
import { app } from "electron";
import { frame, TOO_LARGE, Unframer } from "../runtime/frames";
import { watchProcess, type Over } from "../runtime/processWatch";
import { windowsSystemEnv } from "../python/jailEnv";
import { winJailExe } from "../python/winJail";
import { SANDBOX_EXEC, workerCommand, type WorkerWay } from "./workerJail";

/**
 * The extraction worker SHUT IN BY THE SYSTEM: the Node shipped beside the app
 * (`scripts/bake-node.ts`) running the worker's self-contained bundle
 * (`scripts/build-extract-sandbox.mjs`) under `sandbox-exec` on macOS or the AppContainer
 * launcher on Windows (`workerJail.ts`), Node's permissions on top. A file that takes over
 * pdf.js, an office parser, the canvas or the OCR engine finds a process that reads none of
 * the user's files, reaches no network, starts no program and writes only to its own folder.
 *
 * The bundle sits outside the asar (a plain Node cannot read inside it), so its SHA-256 is kept
 * INSIDE the sealed asar (`out/main/extractSandbox.sha256`) and checked before every start: a
 * bundle that does not match is never run.
 *
 * `null` means « not available here », and `sandboxMissing()` says why (no jail, no Node beside
 * the app, no bundle, a bundle that does not match). What happens then is `extractWall.ts`'s
 * rule: a packaged app REFUSES the document; only an unpackaged run forks the utilityProcess.
 *
 * Its memory and its folder are capped by main's measure (`../runtime/processWatch.ts`), the
 * Windows Job Object apart: past a cap the worker is killed and `stopped()` says which.
 */

/** A worker the system's jail could not start, in an unpackaged run: `extractClient.ts` tries the utilityProcess next. */
export class SandboxUnbornError extends Error {}

/** What `extractClient.ts` uses of a worker process, the utilityProcess's own surface. */
export interface WorkerChild {
  postMessage(msg: unknown): void;
  kill(): boolean;
  on(ev: "message", cb: (msg: never) => void): this;
  on(ev: "exit", cb: (code: number | null) => void): this;
  stderr?: NodeJS.ReadableStream | null;
  /** why main stopped it itself (over its memory, its folder, an answer too large), if it did */
  stopped?: () => Over | "answer" | null;
}

/** the externals the bundle loads from disk: natives and WASM, by path */
const EXTERNALS = ["tesseract2.js", "tesseract.js-core", "onnxruntime-node", "@napi-rs/canvas"];
const MEMORY_MB = 4096;
/** V8's own heap, inside that: the rest is the natives' (the canvas, the inference runtime, WASM) */
const HEAP_MB = 3072;
/** what its folder may weigh: scratch for the OCR engines, never a document's size many times over */
const DISK_MB = 2048;
/** the largest answer main reads from it: a document's text and geometry fit well under it */
const ANSWER_MAX_BYTES = 256 * 1024 * 1024;

const real = (p: string): string => {
  try {
    return realpathSync(p);
  } catch {
    return p;
  }
};
const unpacked = (p: string) => p.replace(/([\\/])app\.asar([\\/])/, "$1app.asar.unpacked$2");

function way(): WorkerWay | null {
  if (process.platform === "darwin") return existsSync(SANDBOX_EXEC) ? "seatbelt" : null;
  if (process.platform === "win32") return existsSync(winJailExe()) ? "jail" : null;
  return null;
}

/** The Node to run and the environment it needs: the one beside the app, or Electron as Node in development. */
function nodeCommand(): { path: string; env: Record<string, string>; folder: string } | null {
  if (!app.isPackaged) return { path: process.execPath, env: { ELECTRON_RUN_AS_NODE: "1" }, folder: dirname(dirname(real(process.execPath))) };
  const path = join(process.resourcesPath, "node", process.platform === "win32" ? "node.exe" : "node");
  return existsSync(path) ? { path, env: {}, folder: dirname(real(path)) } : null;
}

const bundlePath = () => unpacked(join(app.getAppPath(), "out", "sandboxed", "extractWorker.mjs"));

/** Every file of the bundle's folder listed in the asar's sealed digest matches it, and there is one. */
export function bundleIntact(bundle: string, sealed = join(__dirname, "extractSandbox.sha256")): boolean {
  try {
    const lines = readFileSync(sealed, "utf8").trim().split("\n").map((l) => l.split(/\s+/));
    if (!lines.some(([, name]) => name === basename(bundle))) return false;
    return lines.every(([want, name]) => !!want && !!name && createHash("sha256").update(readFileSync(join(dirname(bundle), name))).digest("hex") === want);
  } catch {
    return false;
  }
}

/** A package's folder, and the node_modules folder that holds it, where they really are. */
function packageFolders(name: string, from: string): string[] {
  try {
    const dir = dirname(createRequire(from).resolve(`${name}/package.json`));
    const cut = dir.lastIndexOf(`${sep}node_modules${sep}`);
    return [real(dir), ...(cut === -1 ? [] : [dir.slice(0, cut + `${sep}node_modules`.length)])];
  } catch {
    return [];
  }
}

/** The files and folders the worker reads: nothing else is granted. */
function grants(bundle: string, node: string, tmp: string): string[] {
  const modules = EXTERNALS.flatMap((n) => packageFolders(n, bundle));
  // Node reads the package.json above each node_modules folder to know how its files load
  const manifests = modules.filter((m) => m.endsWith(`${sep}node_modules`)).map((m) => join(dirname(m), "package.json")).filter((f) => existsSync(f));
  const ocr = [process.env.OPENMASQ_TESSERACT_LANG_PATH, process.env.OPENMASQ_DOCTR_MODEL_PATH].filter((d): d is string => !!d && existsSync(d));
  const all = [dirname(bundle), node, tmp, ...modules, ...manifests, ...ocr];
  // each as given and as it really is: the sandbox sees the real one, Node's permissions the one read by
  return [...new Set(all.flatMap((p) => [p, real(p)]))];
}

/** Why the jail is not available here, or null when it is: said in the refusal and in its report. */
export function sandboxMissing(): string | null {
  if (!way()) return "no jail on this system";
  if (!nodeCommand()) return "no Node beside the app";
  const bundle = bundlePath();
  if (!existsSync(bundle)) return "no sandboxed bundle";
  return bundleIntact(bundle) ? null : "sandboxed bundle does not match its sealed digest";
}

/** The worker started under the system's jail, or null when this machine has none for it (`sandboxMissing`). */
export function sandboxedWorker(): WorkerChild | null {
  const jail = way();
  const node = nodeCommand();
  const bundle = bundlePath();
  if (!jail || !node || !existsSync(bundle) || !bundleIntact(bundle)) return null;
  const tmp = join(app.getPath("userData"), "extract-tmp");
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true, mode: 0o700 });
  const tmpReal = real(tmp);
  const command = workerCommand({
    way: jail,
    node: node.path,
    nodeReal: real(node.path),
    jail: jail === "jail" ? winJailExe() : undefined,
    script: bundle,
    read: grants(bundle, node.folder, tmp),
    write: [...new Set([tmp, tmpReal])],
    memoryMb: MEMORY_MB,
    heapMb: HEAP_MB,
  });
  const ocrEnv = Object.fromEntries(
    ["OPENMASQ_TESSERACT_LANG_PATH", "OPENMASQ_DOCTR_MODEL_PATH", "OPENMASQ_DOCTR_INTEGRITY", "OPENMASQ_DOCTR_REQUIRE_PIN"].flatMap((k) => (process.env[k] ? [[k, process.env[k] as string]] : [])),
  );
  const child = spawn(command.cmd, command.args, {
    env: { ...windowsSystemEnv(process.platform, process.env), ...node.env, ...ocrEnv, OPENMASQ_OFFLINE: "1", OPENMASQ_WORKER_STDIO: "1", TMPDIR: tmpReal, TMP: tmpReal, TEMP: tmpReal },
    stdio: ["pipe", "pipe", "pipe"],
    cwd: tmpReal,
    windowsHide: true,
  });
  return framed(child, tmpReal);
}

/** A spawned worker that speaks in frames, behind the utilityProcess's surface, its memory and folder measured. */
function framed(child: ChildProcess, folder: string): WorkerChild {
  const events = new EventEmitter();
  const reader = new Unframer(ANSWER_MAX_BYTES);
  let stopped: Over | "answer" | null = null;
  const stop = (why: Over | "answer") => {
    stopped ??= why;
    child.kill("SIGKILL");
  };
  const unwatch = watchProcess(child.pid, { memoryMb: MEMORY_MB, folder, diskMb: DISK_MB }, stop);
  child.stdout?.on("data", (chunk: Buffer) => {
    for (const m of reader.push(chunk)) {
      // an answer larger than main reads is never kept: the worker that sent it is stopped
      if (m === TOO_LARGE) stop("answer");
      else events.emit("message", m);
    }
  });
  // a program that cannot start, or a pipe that breaks, is an exit before `ready`
  let exited = false;
  const exit = (code: number | null) => {
    if (exited) return;
    exited = true;
    unwatch();
    events.emit("exit", code);
  };
  child.on("exit", (code) => exit(code));
  child.on("error", () => exit(127));
  child.stdin?.on("error", () => exit(127));
  const worker = {
    postMessage: (msg: unknown) => void child.stdin?.write(frame(msg)),
    kill: () => {
      unwatch();
      return child.kill("SIGKILL");
    },
    on: (ev: string, cb: (...args: never[]) => void) => {
      events.on(ev, cb as (...args: unknown[]) => void);
      return worker;
    },
    stderr: child.stderr,
    stopped: () => stopped,
  };
  return worker as WorkerChild;
}
