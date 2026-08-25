import { shell } from "electron";
import { extractPaths } from "../files";
import { makeGrant, type Grant } from "./grant";

/**
 * The two folder-browser ops that CANNOT run in the worker: a `utilityProcess` child is
 * plain Node with no Electron API, and both need `shell`. They run in main instead — but
 * they go through the SAME gate, `grant.ts` `makeGrant().resolve()`, built from the SAME
 * roots and deny set the worker was forked with. One gate, two processes; there is no
 * second policy here, only a second caller.
 *
 * Neither is an MCP tool, and that asymmetry is deliberate: the model has no way to send a
 * file to the trash or to hand a path to another application. Adding either to `tools.ts`
 * would hand the model a primitive the user never asked it to have.
 */
/**
 * Une extraction complète rendue à l'INTERFACE — texte ET géométrie OCR.
 *
 * ⚠️ **Sans `path`, délibérément.** Le renderer n'obtient jamais de chemin par ici : il
 * pourrait le repasser à `files:read`, dont la porte ne s'ouvre que pour un chemin accordé
 * par le sélecteur NATIF. Un XSS renderer lirait alors le disque au périmètre du connecteur
 * Fichiers. Les octets, eux, ne confèrent rien de neuf — l'utilisateur regarde déjà ce
 * fichier. `localFsExtract.test.ts` épingle l'absence du champ.
 */
interface UiExtractedDocument {
  name: string;
  kind: string;
  text: string;
  mime?: string;
  /** Les mots reconnus et leurs boîtes en pixels — ce qui permet de PEINDRE le redaction
   *  sur un scan. C'est le champ dont l'absence laissait un document local sans boîtes. */
  words?: unknown;
  ocrPages?: unknown;
  ocrText?: string;
  ocr?: unknown;
  error?: string;
}

export interface MainFsOps {
  /** Extract the TEXT of a document (PDF incl. scans, Word, Excel, PowerPoint) through the
   *  app's own extraction pipeline — the same one attachments use, OCR included. It lives
   *  in main because that pipeline does; the worker is plain Node with no OCR. */
  readDocument(path: string): Promise<string>;
  /**
   * La MÊME extraction, rendue en OBJET pour l'interface au lieu d'être aplatie en prose.
   *
   * `readDocument` compose une phrase pour le MODÈLE (« [nom · N caractères] »), ce qui est
   * exactement ce qu'il ne faut pas donner à un aperçu : l'interface veut la géométrie, et
   * une extraction vide est un fait à afficher, pas une erreur à relancer.
   *
   * Elle existe surtout pour que joindre un fichier local ne coûte QU'UN aller-retour :
   * l'ancien chemin lisait les octets jusqu'au renderer, puis les renvoyait à main en
   * base64 pour l'extraction — le fichier entier traversait l'IPC deux fois, et la
   * géométrie était perdue en route.
   */
  extractDocument(path: string): Promise<UiExtractedDocument>;
  /** Send a file/folder to the OS trash. **Reversible by construction** — never `unlink`.
   *  This is what makes a delete the user clicks safe enough not to demand its own
   *  un-spoofable prompt: the worst case is recoverable from the Corbeille/Trash. */
  trash(path: string): Promise<void>;
  /** Hand the file to the OS default application. */
  open(path: string): Promise<void>;
}

export function makeMainFsOps(roots: string[], deny: string[]): MainFsOps {
  let cached: Grant | null = null;
  // Built lazily and once: `makeGrant` realpath-resolves every root, which is disk work
  // we shouldn't do on connect for a capability the user may never open.
  const gate = (): Grant => (cached ??= makeGrant(roots, deny));

  return {
    async readDocument(path) {
      const real = gate().resolve(path);
      const [extracted] = await extractPaths([real]);
      if (!extracted) throw new Error("ce document n'a pas pu être lu");
      if (extracted.error) throw new Error(extracted.error);
      const text = (extracted.text ?? "").trim();
      // An empty extraction is a REAL answer, not an error: a scanned page with nothing on
      // it, a spreadsheet of formulas. Saying so beats handing the model an empty string it
      // will read as "the document is empty" without knowing why.
      if (!text) return `[${extracted.name} · aucun texte extractible de ce document]`;
      return `[${extracted.name} · ${text.length} caractères extraits]\n${text}`;
    },

    async extractDocument(path) {
      const real = gate().resolve(path);
      const [x] = await extractPaths([real]);
      if (!x) throw new Error("ce document n'a pas pu être lu");
      // `path` est retiré ICI, pas au-dessus : c'est le seul endroit qui le connaisse, et
      // un champ qu'on oublie de retirer plus loin est un champ qui part.
      const { path: _dropped, ...rest } = x;
      return rest;
    },

    async trash(path) {
      const g = gate();
      const real = g.resolve(path);
      // A granted root IS inside the grant, so `resolve` allows it. Trashing the folder
      // the user authorised would revoke the connector's own capability as a side effect
      // of a click in a file list — refuse it and let them do that in their file manager.
      if (g.roots.includes(real)) {
        throw new Error("impossible de mettre à la corbeille un dossier autorisé");
      }
      await shell.trashItem(real);
    },
    async open(path) {
      const err = await shell.openPath(gate().resolve(path));
      if (err) throw new Error(err);
    },
  };
}
