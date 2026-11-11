import { existsSync } from "node:fs";
import { join } from "node:path";
import { app, utilityProcess } from "electron";
import { BRAND } from "@openmasq/branding";
import { devOnly } from "../security/devOnly";
import { sandboxedWorker, sandboxMissing, type WorkerChild } from "./extractSandbox";

/**
 * HOW the extraction worker is born (`extractClient.ts` only relays to it), and the one rule it
 * holds (rule 7, fail closed):
 *
 * ⛔ A PACKAGED APP READS A DOCUMENT INSIDE THE SYSTEM'S WALL OR NOT AT ALL. The worker parses
 * hostile bytes with native code (the canvas, the inference runtime); outside the jail it is a
 * process with the user's rights, held back by a JavaScript-level network cut alone. So when the
 * jail is not there (no launcher, no Node beside the app, a bundle that does not match its sealed
 * digest) or did not start, the document is REFUSED with a sentence saying so
 * (`WorkerUnbornError` → `inWorkerOnly`), and the next document tries the jail again: nothing is
 * remembered that would downgrade the session.
 *
 * The utilityProcess (a process apart, no system wall) stays for UNPACKAGED runs only
 * (`devOnly`: development and the unit tests, where no Node is baked beside the app and the
 * documents are the developer's own). No launch-environment switch opens it in a packaged build.
 */

/** The worker could not be born: the document is refused, never read elsewhere. */
export class WorkerUnbornError extends Error {
  constructor(cause: string) {
    super(`worker d'extraction indisponible (${cause})`);
    this.name = "WorkerUnbornError";
  }
}

/** Whether this run may read a document outside the system's wall: an unpackaged one only. */
export const unwalledAllowed = (): boolean => devOnly("1") === "1";

/**
 * A worker, and whether the system shuts it in. `skipJail`: the jail already failed to start in
 * this UNPACKAGED session (ignored when packaged: there, every document tries the jail).
 */
export function bornWorker(skipJail: boolean): { child: WorkerChild; shut: boolean } {
  const unwalled = unwalledAllowed();
  let shut: WorkerChild | null;
  try {
    shut = skipJail && unwalled ? null : sandboxedWorker();
  } catch (e) {
    if (!unwalled) throw new WorkerUnbornError(e instanceof Error ? e.message : String(e));
    shut = null;
  }
  if (shut) return { child: shut, shut: true };
  if (!unwalled) throw new WorkerUnbornError(`bac à sable indisponible : ${sandboxMissing() ?? "non démarré"}`);
  const worker = join(__dirname, "extractWorker.js"); // emitted by electron-vite (main entry)
  if (!existsSync(worker)) throw new WorkerUnbornError("bundle absent");
  try {
    return { child: forkWorker(worker), shut: false };
  } catch (e) {
    throw new WorkerUnbornError(e instanceof Error ? e.message : String(e));
  }
}

function forkWorker(worker: string): WorkerChild {
  const proc = utilityProcess.fork(worker, [], {
    serviceName: `${BRAND.slug}-extract`,
    // MINIMAL env: only the OCR asset paths/pins that `runtime/ocrAssets.ts` set
    // on process.env at whenReady — NEVER the whole env (secrets). Absent (dev without
    // a bake) ⇒ the worker follows the same fallbacks as main (dev CDN / Tesseract-only).
    env: Object.fromEntries(
      ["OPENMASQ_TESSERACT_LANG_PATH", "OPENMASQ_DOCTR_MODEL_PATH", "OPENMASQ_DOCTR_INTEGRITY", "OPENMASQ_DOCTR_REQUIRE_PIN"]
        .filter((k) => process.env[k])
        .map((k) => [k, process.env[k] as string]),
    ),
    // Same contract as the NER worker: the worker NEVER writes the extracted text to
    // stdout/stderr — the bounded ring is only read back in the report of an abnormal death.
    stdio: app.isPackaged ? "pipe" : "inherit",
  });
  return proc as unknown as WorkerChild;
}
