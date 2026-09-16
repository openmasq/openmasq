import { appendFileSync, readFileSync, existsSync, rmSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { startApp, type AppSession, type StartOptions } from "./appSession";
import { clickByName, askModel, typeText, pressKey } from "./actions";
import { snapshot } from "./snapshot";
import { EXPR_HEALTH, call } from "./inPage";
import { LOG_FILE, SHOTS, TOOLCALL_LOG, WIRE_LOG, ensureRunDir } from "./paths";

export interface Request {
  cmd: string;
  args?: Record<string, unknown>;
}
export type Reply = Record<string, unknown> & { ok: boolean };

/** The driver's state between two commands — that's what makes it a driver and not a test. */
interface DaemonState {
  session: AppSession | null;
  /** Read cursors: `errors`/`wire` return what's NEW since the last call. */
  readErrors: number;
  readMain: number;
  readWire: number;
  /** Offset in BYTES within the wire log — it's on disk, not in memory. */
  readWireLog: number;
  shotCount: number;
}

const daemonState: DaemonState = { session: null, readErrors: 0, readMain: 0, readWire: 0, readWireLog: 0, shotCount: 0 };

/**
 * What the provider calls carried since the last call. Two sources: the JOURNAL (all
 * modes, what the app DECIDED to send) and the HTTP BODIES (fake destination only, what
 * actually went out). Looking for a leak: the body when it exists, the journal otherwise.
 */
function wireSinceLastCall(): { wire: unknown[]; corpsHttp: string[] } {
  let wire: unknown[] = [];
  if (existsSync(WIRE_LOG)) {
    const raw = readFileSync(WIRE_LOG, "utf8");
    wire = raw
      .slice(daemonState.readWireLog)
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l) as unknown;
        } catch {
          return { illisible: l.slice(0, 200) };
        }
      });
    daemonState.readWireLog = raw.length;
  }
  const s = daemonState.session;
  let httpBody: string[] = [];
  if (s?.model) {
    httpBody = s.model.bodies.slice(daemonState.readWire);
    daemonState.readWire = s.model.bodies.length;
  }
  return { wire, corpsHttp: httpBody };
}

const alive = (): AppSession => {
  if (!daemonState.session) throw new Error("aucune session ouverte — lancer `start` d'abord");
  return daemonState.session;
};

/** One JSON line per command: the trace the agent re-reads to write its report. */
function logLine(entry: Record<string, unknown>): void {
  try {
    appendFileSync(LOG_FILE, JSON.stringify({ t: new Date().toISOString(), ...entry }) + "\n");
  } catch {
    /* worst case we lose a journal line — never the command */
  }
}

const sizeOr0 = (f: string): number => (existsSync(f) ? statSync(f).size : 0);

const COMMANDS: Record<string, (a: Record<string, unknown>) => Promise<Reply>> = {
  /** Opens the app. Closes the previous one: two instances share the single-instance lock. */
  async start(a) {
    await daemonState.session?.close();
    daemonState.readErrors = daemonState.readMain = daemonState.readWire = daemonState.readWireLog = 0;
    daemonState.session = await startApp(a as StartOptions);
    if (daemonState.session.attache) {
      // Never ERASE the journal of an app we didn't launch (it holds the inode open and
      // would write into the void): skip what precedes.
      daemonState.readWireLog = sizeOr0(WIRE_LOG);
    } else {
      // The wire journal is CUMULATIVE on disk.
      rmSync(WIRE_LOG, { force: true });
      rmSync(TOOLCALL_LOG, { force: true });
    }
    return { ok: true, attache: daemonState.session.attache, ...(await snapshot(daemonState.session.page)) };
  },

  /** Look: the digest AND a screenshot. The agent decides on the digest, verifies on the image. */
  async look(a) {
    const s = alive();
    const name = String(a.nom ?? "vue");
    const file = resolve(SHOTS, `${String(++daemonState.shotCount).padStart(3, "0")}-${name}.png`);
    await s.page.screenshot({ path: file });
    return { ok: true, capture: file, ...(await snapshot(s.page)) };
  },

  async click(a) {
    await clickByName(alive().page, String(a.nom), Number(a.n ?? 1));
    return { ok: true, ...(await snapshot(alive().page)) };
  },

  async type(a) {
    await typeText(alive().page, String(a.texte ?? ""), a.champ ? String(a.champ) : undefined);
    return { ok: true, ...(await snapshot(alive().page)) };
  },

  async key(a) {
    await pressKey(alive().page, String(a.touche));
    return { ok: true, ...(await snapshot(alive().page)) };
  },

  /** Ask a question and wait for the answer — plus what the recipient ACTUALLY received. */
  async ask(a) {
    const s = alive();
    const r = await askModel(s.page, String(a.prompt), Number(a.timeoutMs ?? 180_000));
    return { ok: true, ...r, ...wireSinceLastCall() };
  },

  /** What the provider calls carried since the last call. */
  async wire() {
    alive();
    return { ok: true, ...wireSinceLastCall() };
  },

  /** What the app has shouted since the last call: renderer + main process. */
  async errors() {
    const s = alive();
    const renderer = s.errors.slice(daemonState.readErrors);
    const mainWindow = s.mainLog.slice(daemonState.readMain);
    daemonState.readErrors = s.errors.length;
    daemonState.readMain = s.mainLog.length;
    return { ok: true, renderer, mainWindow };
  },

  /** The REAL arguments received by MCP tools (rule 11 outbound): the fixtures' JSONL and
   *  the real connectors' `[mcp:raw]` lines, together. */
  async toolcalls() {
    const s = alive();
    const fixtures = existsSync(TOOLCALL_LOG)
      ? readFileSync(TOOLCALL_LOG, "utf8")
          .split("\n")
          .filter(Boolean)
          .map((l) => JSON.parse(l) as unknown)
      : [];
    const realCalls = s.mainLog.filter((l) => l.includes("[mcp:raw]"));
    return { ok: true, appels: fixtures, realCalls };
  },

  /** Is real mode ACTUALLY available? Call right after `start` in real profile: a sign-in
   *  screen and an empty screen look alike on a screenshot. */
  async sante() {
    const s = alive();
    const pageState = (await s.page.evaluate(call(EXPR_HEALTH))) as Record<string, unknown>;
    const cx = (pageState.connecteurs ?? []) as { connecte: boolean }[];
    // The mode rides the answer: in disposable profile "connecte: false" is NORMAL.
    return {
      ok: true,
      profil: s.opts.profil ?? "jetable",
      modele: s.opts.model ?? "fake",
      ...pageState,
      modeReelUtilisable: s.opts.profil === "reel" && !!pageState.connecte,
      connecteursBranches: cx.filter((c) => c.connecte).length,
    };
  },

  /** Attach a REAL file as a `drop` event (bytes, never a path): the exact user gesture,
   *  and the only one automatable in real profile (the picker stub is disposable-only). */
  async drop(a) {
    const s = alive();
    const filePath = String(a.chemin ?? "");
    const byteCount = readFileSync(filePath);
    const name = filePath.split("/").pop() ?? "fichier";
    const ext = (name.split(".").pop() ?? "").toLowerCase();
    const mime =
      { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
        docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        csv: "text/csv", tsv: "text/tab-separated-values", txt: "text/plain" }[ext] ?? "application/octet-stream";
    await s.page.evaluate(
      async ({ b64, name, mime }: { b64: string; name: string; mime: string }) => {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const dt = new DataTransfer();
        dt.items.add(new File([bytes], name, { type: mime }));
        // Any child works (the event BUBBLES); the composer is the stable node.
        const target = document.querySelector(".chat") ?? document.body;
        target.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
      },
      { b64: byteCount.toString("base64"), name, mime },
    );
    return { ok: true, fichier: name, octets: byteCount.length, ...(await snapshot(s.page)) };
  },

  /** The emergency exit, when no gesture tells you what you want to know. */
  async eval(a) {
    const value = await alive().page.evaluate(String(a.js));
    return { ok: true, value };
  },

  async state() {
    return { ok: true, ouverte: !!daemonState.session, options: daemonState.session?.opts ?? null };
  },

  async stop() {
    await daemonState.session?.close();
    daemonState.session = null;
    return { ok: true };
  },
};

/** Executes a command and journals it — success as well as failure, never one without the other. */
export async function execute(req: Request): Promise<Reply> {
  ensureRunDir();
  const fn = COMMANDS[req.cmd];
  if (!fn) return { ok: false, erreur: `commande inconnue : ${req.cmd}` };
  try {
    const resp = await fn(req.args ?? {});
    logLine({ cmd: req.cmd, args: req.args, ok: true });
    return resp;
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logLine({ cmd: req.cmd, args: req.args, ok: false, error });
    return { ok: false, error };
  }
}

export const isStop = (cmd: string): boolean => cmd === "stop";
