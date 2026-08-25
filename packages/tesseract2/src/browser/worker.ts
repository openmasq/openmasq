/*
 * Browser worker entry point (bundled by esbuild into dist/browser/worker.js as a
 * CLASSIC worker script — it uses importScripts to load the core). Wires `self` into
 * the shared worker loop with the browser WorkerPlatform.
 */
import { runWorker } from '../core/workerCore';
import { browserWorkerPlatform } from './platform';
import type { PortHandle } from '../platform/types';

interface DedicatedScope {
  postMessage(msg: unknown, transfer?: ArrayBuffer[]): void;
  onmessage: ((e: MessageEvent) => void) | null;
}
const scope = self as unknown as DedicatedScope;

const port: PortHandle = {
  postMessage: (msg, transfer) => scope.postMessage(msg, transfer ?? []),
  onMessage: (cb) => { scope.onmessage = (e: MessageEvent) => cb(e.data); },
};

runWorker(port, browserWorkerPlatform);
