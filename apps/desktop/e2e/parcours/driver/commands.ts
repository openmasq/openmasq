import { appendFileSync, readFileSync, existsSync, rmSync, statSync } from "node:fs";
import { resolve } from "node:path";
import { startApp, type AppSession, type StartOptions } from "./appSession";
import { cliquer, demander, ecrire, toucher } from "./actions";
import { snapshot } from "./snapshot";
import { EXPR_SANTE, appel } from "./inPage";
import { JOURNAL, SHOTS, TOOLCALL_LOG, WIRE_LOG, ensureRunDir } from "./paths";

export interface Requete {
  cmd: string;
  args?: Record<string, unknown>;
}
export type Reponse = Record<string, unknown> & { ok: boolean };

/** The driver's state between two commands — that's what makes it a driver and not a test. */
interface Etat {
  session: AppSession | null;
  /** Read cursors: `errors`/`wire` return what's NEW since the last call. */
  luErreurs: number;
  luMain: number;
  luWire: number;
  /** Offset in BYTES within the wire log — it's on disk, not in memory. */
  luWireLog: number;
  captures: number;
}

const etat: Etat = { session: null, luErreurs: 0, luMain: 0, luWire: 0, luWireLog: 0, captures: 0 };

/**
 * What the provider calls carried since the last call.
 *
 * Two sources, and they don't say the same thing. The JOURNAL (`wire.jsonl`) exists in
 * ALL modes, including against a real provider: it's what the app DECIDED
 * to send. The HTTP BODIES only exist with the local fake destination, but that's what
 * actually went out on the wire. Looking for a leak: the body when it exists, the journal
 * otherwise — and the journal is the only proof available in real mode.
 */
function wireDepuisDernierAppel(): { wire: unknown[]; corpsHttp: string[] } {
  let wire: unknown[] = [];
  if (existsSync(WIRE_LOG)) {
    const brut = readFileSync(WIRE_LOG, "utf8");
    wire = brut
      .slice(etat.luWireLog)
      .split("\n")
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l) as unknown;
        } catch {
          return { illisible: l.slice(0, 200) };
        }
      });
    etat.luWireLog = brut.length;
  }
  const s = etat.session;
  let corpsHttp: string[] = [];
  if (s?.model) {
    corpsHttp = s.model.bodies.slice(etat.luWire);
    etat.luWire = s.model.bodies.length;
  }
  return { wire, corpsHttp };
}

const vivant = (): AppSession => {
  if (!etat.session) throw new Error("aucune session ouverte — lancer `start` d'abord");
  return etat.session;
};

/** One JSON line per command: the trace the agent re-reads to write its report. */
function journaliser(entree: Record<string, unknown>): void {
  try {
    appendFileSync(JOURNAL, JSON.stringify({ t: new Date().toISOString(), ...entree }) + "\n");
  } catch {
    /* worst case we lose a journal line — never the command */
  }
}

const tailleOu0 = (f: string): number => (existsSync(f) ? statSync(f).size : 0);

const COMMANDES: Record<string, (a: Record<string, unknown>) => Promise<Reponse>> = {
  /** Opens the app. Closes the previous one: two instances share the single-instance lock. */
  async start(a) {
    await etat.session?.close();
    etat.luErreurs = etat.luMain = etat.luWire = etat.luWireLog = 0;
    etat.session = await startApp(a as StartOptions);
    if (etat.session.attache) {
      // ⚠️ We don't ERASE the journal of an app we didn't launch: it keeps it
      // open, and deleting the inode would write into the void — not a single proof left,
      // with no error at all. So we skip what precedes it, instead of destroying it.
      etat.luWireLog = tailleOu0(WIRE_LOG);
    } else {
      // The wire journal is CUMULATIVE on disk: without a reset, the first read
      // of a new session would return everything the previous one sent.
      rmSync(WIRE_LOG, { force: true });
      rmSync(TOOLCALL_LOG, { force: true });
    }
    return { ok: true, attache: etat.session.attache, ...(await snapshot(etat.session.page)) };
  },

  /** Look: the digest AND a screenshot. The agent decides on the digest, verifies on the image. */
  async look(a) {
    const s = vivant();
    const nom = String(a.nom ?? "vue");
    const fichier = resolve(SHOTS, `${String(++etat.captures).padStart(3, "0")}-${nom}.png`);
    await s.page.screenshot({ path: fichier });
    return { ok: true, capture: fichier, ...(await snapshot(s.page)) };
  },

  async click(a) {
    await cliquer(vivant().page, String(a.nom), Number(a.n ?? 1));
    return { ok: true, ...(await snapshot(vivant().page)) };
  },

  async type(a) {
    await ecrire(vivant().page, String(a.texte ?? ""), a.champ ? String(a.champ) : undefined);
    return { ok: true, ...(await snapshot(vivant().page)) };
  },

  async key(a) {
    await toucher(vivant().page, String(a.touche));
    return { ok: true, ...(await snapshot(vivant().page)) };
  },

  /** Ask a question and wait for the answer — plus what the recipient ACTUALLY received. */
  async ask(a) {
    const s = vivant();
    const r = await demander(s.page, String(a.prompt), Number(a.timeoutMs ?? 180_000));
    return { ok: true, ...r, ...wireDepuisDernierAppel() };
  },

  /** What the provider calls carried since the last call. */
  async wire() {
    vivant();
    return { ok: true, ...wireDepuisDernierAppel() };
  },

  /** What the app has shouted since the last call: renderer + main process. */
  async errors() {
    const s = vivant();
    const renderer = s.errors.slice(etat.luErreurs);
    const principal = s.mainLog.slice(etat.luMain);
    etat.luErreurs = s.errors.length;
    etat.luMain = s.mainLog.length;
    return { ok: true, renderer, principal };
  },

  /**
   * The REAL arguments received by MCP tools — rule 11 in the outbound direction.
   * FIXTURE connectors write a JSONL; the REAL ones go through the dispatch
   * path and come out as `[mcp:raw]` on the main process's output. Both are
   * returned together: it's the same question, and the agent shouldn't have to know
   * which of the two plumbing paths was in play.
   */
  async toolcalls() {
    const s = vivant();
    const fixtures = existsSync(TOOLCALL_LOG)
      ? readFileSync(TOOLCALL_LOG, "utf8")
          .split("\n")
          .filter(Boolean)
          .map((l) => JSON.parse(l) as unknown)
      : [];
    const reels = s.mainLog.filter((l) => l.includes("[mcp:raw]"));
    return { ok: true, appels: fixtures, reels };
  },

  /**
   * Is real mode ACTUALLY available? Signed-in account, connected connectors, settings.
   *
   * ⚠️ To call right after a `start` in real profile, BEFORE playing anything: a
   * sign-in screen and an empty screen look alike on a screenshot, and "I thought I was
   * signed in" produces a report that makes a simulated session look real —
   * the one lie an autonomous agent has no right to tell.
   */
  async sante() {
    const s = vivant();
    const etatPage = (await s.page.evaluate(appel(EXPR_SANTE))) as Record<string, unknown>;
    const cx = (etatPage.connecteurs ?? []) as { connecte: boolean }[];
    // The mode is returned with the answer: without it, a "connecte: false" reads like a
    // failure when in disposable profile it's the NORMAL state (the seeded session isn't a
    // real account — the Supabase client drops it on the first refresh).
    return {
      ok: true,
      profil: s.opts.profil ?? "jetable",
      modele: s.opts.model ?? "fake",
      ...etatPage,
      modeReelUtilisable: s.opts.profil === "reel" && !!etatPage.connecte,
      connecteursBranches: cx.filter((c) => c.connecte).length,
    };
  },

  /**
   * Attach a REAL file by its DROP-off path — bytes → `File` → `DataTransfer` →
   * `drop` event on the zone. It's the exact user gesture (`DropZone`'s "bytes,
   * never a path" route), and the only one automatable in real profile: the
   * native picker can't be driven, and its stub (`OPENMASQ_E2E_ATTACH`) is only armed
   * in disposable mode — arming it in real mode would give the harness a right the user
   * hasn't granted. The chip appears immediately; extraction/OCR follows (poll `look`).
   */
  async drop(a) {
    const s = vivant();
    const chemin = String(a.chemin ?? "");
    const octets = readFileSync(chemin);
    const nom = chemin.split("/").pop() ?? "fichier";
    const ext = (nom.split(".").pop() ?? "").toLowerCase();
    const mime =
      { pdf: "application/pdf", png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
        docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        csv: "text/csv", tsv: "text/tab-separated-values", txt: "text/plain" }[ext] ?? "application/octet-stream";
    await s.page.evaluate(
      async ({ b64, nom, mime }: { b64: string; nom: string; mime: string }) => {
        const bin = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const dt = new DataTransfer();
        dt.items.add(new File([bytes], nom, { type: mime }));
        // The target can be any child: React listens on the wrapper, and
        // the event BUBBLES. The composer is the stable node closest to the real gesture.
        const cible = document.querySelector(".chat") ?? document.body;
        cible.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
      },
      { b64: octets.toString("base64"), nom, mime },
    );
    return { ok: true, fichier: nom, octets: octets.length, ...(await snapshot(s.page)) };
  },

  /** The emergency exit, when no gesture tells you what you want to know. */
  async eval(a) {
    const valeur = await vivant().page.evaluate(String(a.js));
    return { ok: true, valeur };
  },

  async state() {
    return { ok: true, ouverte: !!etat.session, options: etat.session?.opts ?? null };
  },

  async stop() {
    await etat.session?.close();
    etat.session = null;
    return { ok: true };
  },
};

/** Executes a command and journals it — success as well as failure, never one without the other. */
export async function executer(req: Requete): Promise<Reponse> {
  ensureRunDir();
  const fn = COMMANDES[req.cmd];
  if (!fn) return { ok: false, erreur: `commande inconnue : ${req.cmd}` };
  try {
    const rep = await fn(req.args ?? {});
    journaliser({ cmd: req.cmd, args: req.args, ok: true });
    return rep;
  } catch (err) {
    const erreur = err instanceof Error ? err.message : String(err);
    journaliser({ cmd: req.cmd, args: req.args, ok: false, erreur });
    return { ok: false, erreur };
  }
}

export const estArret = (cmd: string): boolean => cmd === "stop";
