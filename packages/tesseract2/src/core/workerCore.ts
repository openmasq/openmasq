/*
 * The worker-thread event loop, platform-agnostic. Receives { id, action, payload }
 * packets through a PortHandle (worker_threads.parentPort in Node, `self` in the
 * browser) and answers with { id, status: resolve|reject|progress, data }.
 *
 * Actions are dispatched through a FROZEN allowlist (no arbitrary property lookup),
 * and every handler failure is serialized back as a rejection — nothing is ever
 * thrown out of the message handler (which killed the whole worker in tesseract.js).
 */
import {
  createState, load, loadLanguage, initialize, setParameters, FS, terminate,
  type Res, type WorkerState,
} from './workerHandlers';
import { recognize, detect } from './workerRecognize';
import type { JobPacket, SerializedError, ResponseStatus } from './types';
import type { PortHandle, WorkerPlatform } from '../platform/types';

type Handler = (state: WorkerState, payload: never, res: Res) => Promise<void>;

const HANDLERS: Readonly<Record<string, Handler>> = Object.freeze({
  load, loadLanguage, initialize, setParameters, recognize, detect, FS, terminate,
});

const serializeError = (err: unknown): SerializedError => (
  err instanceof Error
    ? { message: err.message, code: (err as { code?: string }).code ?? 'ERR_TESSERACT' }
    : { message: String(err), code: 'ERR_TESSERACT' }
);

/** Wire a PortHandle + WorkerPlatform into the tesseract2 worker loop. Called by the
 *  Node (`worker_threads`) and browser (`self`) worker entry points. */
export function runWorker(port: PortHandle, platform: WorkerPlatform): void {
  const state = createState(platform);

  port.onMessage((raw: unknown) => {
    const packet = raw as JobPacket;
    if (!packet || typeof packet !== 'object' || typeof packet.id !== 'string') return;
    const { id, action, payload } = packet;

    let settled = false;
    const send = (status: ResponseStatus, data: unknown): void => {
      if (status !== 'progress') {
        if (settled) return;
        settled = true;
      }
      port.postMessage({ id, status, data });
    };
    const res: Res = {
      resolve: (data) => send('resolve', data),
      reject: (err) => send('reject', serializeError(err)),
      progress: (data) => send('progress', data),
    };

    if (typeof action !== 'string' || !Object.prototype.hasOwnProperty.call(HANDLERS, action)) {
      res.reject(Error(`Unknown action: ${String(action).slice(0, 60)}`));
      return;
    }

    Promise.resolve()
      .then(() => HANDLERS[action](state, payload as never, res))
      .catch((err) => res.reject(err));
  });
}
