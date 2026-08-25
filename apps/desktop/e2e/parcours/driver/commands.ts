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

/** L'état du pilote entre deux commandes — c'est ce qui en fait un pilote et pas un test. */
interface Etat {
  session: AppSession | null;
  /** Curseurs de lecture : `errors`/`wire` rendent le NOUVEAU depuis le dernier appel. */
  luErreurs: number;
  luMain: number;
  luWire: number;
  /** Offset en OCTETS dans le journal de wire — il est sur disque, pas en mémoire. */
  luWireLog: number;
  captures: number;
}

const etat: Etat = { session: null, luErreurs: 0, luMain: 0, luWire: 0, luWireLog: 0, captures: 0 };

/**
 * Ce que les appels provider ont emporté depuis le dernier appel.
 *
 * Deux sources, et elles ne disent pas la même chose. Le JOURNAL (`wire.jsonl`) existe dans
 * TOUS les modes, y compris contre un vrai fournisseur : c'est ce que l'app a DÉCIDÉ
 * d'envoyer. Les CORPS HTTP n'existent qu'avec le faux destinataire local, mais c'est ce qui
 * est réellement parti sur le fil. Chercher une fuite : le corps quand il existe, le journal
 * sinon — et le journal est la seule preuve disponible en mode réel.
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

/** Une ligne JSON par commande : la trace que l'agent relit pour écrire son rapport. */
function journaliser(entree: Record<string, unknown>): void {
  try {
    appendFileSync(JOURNAL, JSON.stringify({ t: new Date().toISOString(), ...entree }) + "\n");
  } catch {
    /* au pire on perd une ligne de journal — jamais la commande */
  }
}

const tailleOu0 = (f: string): number => (existsSync(f) ? statSync(f).size : 0);

const COMMANDES: Record<string, (a: Record<string, unknown>) => Promise<Reponse>> = {
  /** Ouvre l'app. Ferme la précédente : deux instances partagent le verrou d'instance unique. */
  async start(a) {
    await etat.session?.close();
    etat.luErreurs = etat.luMain = etat.luWire = etat.luWireLog = 0;
    etat.session = await startApp(a as StartOptions);
    if (etat.session.attache) {
      // ⚠️ On n'EFFACE pas le journal d'une app qu'on n'a pas lancée : elle le tient
      // ouvert, et supprimer l'inode ferait écrire dans le vide — plus une seule preuve,
      // sans la moindre erreur. On saute donc ce qui précède, au lieu de le détruire.
      etat.luWireLog = tailleOu0(WIRE_LOG);
    } else {
      // Le journal de wire est CUMULATIF sur disque : sans remise à zéro, la première lecture
      // d'une nouvelle session rendrait tout ce qu'a envoyé la précédente.
      rmSync(WIRE_LOG, { force: true });
      rmSync(TOOLCALL_LOG, { force: true });
    }
    return { ok: true, attache: etat.session.attache, ...(await snapshot(etat.session.page)) };
  },

  /** Regarder : le digest ET une capture. L'agent décide sur le digest, vérifie sur l'image. */
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

  /** Poser une question et attendre la réponse — plus ce que le destinataire a VRAIMENT reçu. */
  async ask(a) {
    const s = vivant();
    const r = await demander(s.page, String(a.prompt), Number(a.timeoutMs ?? 180_000));
    return { ok: true, ...r, ...wireDepuisDernierAppel() };
  },

  /** Ce que les appels provider ont emporté depuis le dernier appel. */
  async wire() {
    vivant();
    return { ok: true, ...wireDepuisDernierAppel() };
  },

  /** Ce que l'app a crié depuis le dernier appel : renderer + process principal. */
  async errors() {
    const s = vivant();
    const renderer = s.errors.slice(etat.luErreurs);
    const principal = s.mainLog.slice(etat.luMain);
    etat.luErreurs = s.errors.length;
    etat.luMain = s.mainLog.length;
    return { ok: true, renderer, principal };
  },

  /**
   * Les arguments RÉELS reçus par les outils MCP — la règle 11 dans le sens sortant.
   * Les connecteurs FIXTURES écrivent un JSONL ; les VRAIS passent par le chemin de
   * dispatch et sortent en `[mcp:raw]` sur la sortie du process principal. Les deux sont
   * rendus ensemble : c'est la même question, et l'agent ne doit pas avoir à savoir
   * laquelle des deux plomberies était en jeu.
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
   * Le mode réel est-il RÉELLEMENT disponible ? Compte signé, connecteurs branchés, réglages.
   *
   * ⚠️ À appeler juste après un `start` en profil réel, AVANT de jouer quoi que ce soit : un
   * écran de connexion et un écran vide se ressemblent sur une capture, et « je croyais être
   * connecté » produit un rapport qui laisse croire au réel une session jouée en simulation —
   * le seul mensonge qu'un agent autonome n'a pas le droit de commettre.
   */
  async sante() {
    const s = vivant();
    const etatPage = (await s.page.evaluate(appel(EXPR_SANTE))) as Record<string, unknown>;
    const cx = (etatPage.connecteurs ?? []) as { connecte: boolean }[];
    // Le mode est rendu avec la réponse : sans lui, un « connecte: false » se lit comme une
    // panne alors qu'en profil jetable c'est l'état NORMAL (la session semée n'est pas un
    // vrai compte — le client Supabase la jette au premier rafraîchissement).
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
   * Joindre un VRAI fichier par le chemin du DÉPÔT — octets → `File` → `DataTransfer` →
   * évènement `drop` sur la zone. C'est le geste utilisateur exact (la route « bytes,
   * jamais un chemin » de `DropZone`), et le seul automatisable en profil réel : le
   * sélecteur natif ne se pilote pas, et son bouchon (`OPENMASQ_E2E_ATTACH`) n'est armé
   * qu'en jetable — l'armer en réel donnerait au harnais un droit que l'utilisateur n'a
   * pas accordé. Le chip paraît immédiatement ; l'extraction/OCR suit (poll `look`).
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
        // La cible peut être n'importe quel enfant : React écoute sur l'enveloppe, et
        // l'évènement BULLE. Le composeur est le nœud stable le plus proche du geste réel.
        const cible = document.querySelector(".chat") ?? document.body;
        cible.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt }));
      },
      { b64: octets.toString("base64"), nom, mime },
    );
    return { ok: true, fichier: nom, octets: octets.length, ...(await snapshot(s.page)) };
  },

  /** L'issue de secours, quand aucun geste ne dit ce qu'on veut savoir. */
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

/** Exécute une commande et la journalise — succès comme échec, jamais l'un sans l'autre. */
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
