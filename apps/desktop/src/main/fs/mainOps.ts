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
 * A complete extraction rendered for the UI — text AND OCR geometry.
 *
 * ⚠️ **Deliberately without `path`.** The renderer never gets a path from here: it
 * could pass it back to `files:read`, whose gate only opens for a path granted
 * by the NATIVE picker. A renderer XSS would then read the disk at the Files
 * connector's scope. The bytes themselves confer nothing new — the user is already looking at
 * this file. `localFsExtract.test.ts` pins the field's absence.
 */
interface UiExtractedDocument {
  name: string;
  kind: string;
  text: string;
  mime?: string;
  /** The recognised words and their pixel boxes — what lets redaction be PAINTED
   *  onto a scan. This is the field whose absence left a local document without boxes. */
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
   * The SAME extraction, rendered as an OBJECT for the UI instead of flattened into prose.
   *
   * `readDocument` composes a sentence for the MODEL (« [name · N characters] »), which is
   * exactly what must NOT be given to a preview: the UI wants the geometry, and
   * an empty extraction is a fact to display, not an error to retry.
   *
   * It exists mainly so attaching a local file costs only ONE round trip:
   * the old path read the bytes up to the renderer, then sent them back to main as
   * base64 for extraction — the whole file crossed the IPC twice, and the
   * geometry was lost along the way.
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
      // `path` is dropped HERE, not above: this is the only place that knows it, and
      // a field one forgets to strip further down is a field that leaks out.
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
