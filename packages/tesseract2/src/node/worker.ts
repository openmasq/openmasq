/*
 * Node worker-thread entry point. Wires `worker_threads.parentPort` into the shared
 * worker loop with the Node WorkerPlatform. This is the FIXED file `nodeHost.spawnWorker`
 * spawns (compiled to dist/node/worker.js).
 */
import { parentPort } from 'worker_threads';

import { runWorker } from '../core/workerCore';
import { nodeWorkerPlatform } from './platform';
import type { PortHandle } from '../platform/types';

if (!parentPort) throw Error('This file must run inside a worker_threads Worker.');
const parent = parentPort;

const port: PortHandle = {
  postMessage: (msg, transfer) => parent.postMessage(msg, transfer ?? []),
  onMessage: (cb) => { parent.on('message', cb); },
};

runWorker(port, nodeWorkerPlatform);
