import { Worker } from 'worker_threads';
import path from 'path';
import os from 'os';
import fs from 'fs';
import fsp from 'fs/promises';
import { fileURLToPath } from 'url';

import { ValidationError } from '../core/errors';
import { isHttpsUrl, looksLikeUrl } from '../core/validate';
import type { HostPlatform, WorkerHandle } from '../platform/types';
import type { ResolvedWorkerOptions } from '../core/types';

/*
 * The worker script path is FIXED to our own compiled file. tesseract.js accepted
 * an arbitrary `workerPath`, i.e. an arbitrary-code-execution knob; here it is
 * ignored (with a warning) — the worker loads from node_modules where the file is.
 */
const WORKER_SCRIPT = path.join(__dirname, 'worker.js');

const defaultCachePath = (): string => path.join(
  process.env.XDG_CACHE_HOME || path.join(os.homedir(), '.cache'),
  'tesseract2.js',
);

const readImageFile = async (spec: string, maxImageBytes: number): Promise<Uint8Array> => {
  const filePath = spec.startsWith('file:') ? fileURLToPath(spec) : spec;
  const stat = await fsp.stat(filePath);
  if (!stat.isFile()) throw new ValidationError(`Not a regular file: ${filePath}`);
  if (stat.size === 0) throw new ValidationError(`Image is empty (${filePath}).`);
  if (stat.size > maxImageBytes) {
    throw new ValidationError(`Image exceeds maxImageBytes (${stat.size} > ${maxImageBytes} bytes, ${filePath}). Raise \`maxImageBytes\` if intentional.`);
  }
  return new Uint8Array(await fsp.readFile(filePath));
};

export const nodeHost: HostPlatform = {
  spawnWorker(opts: ResolvedWorkerOptions): WorkerHandle {
    const worker = new Worker(WORKER_SCRIPT, { resourceLimits: opts.resourceLimits });
    return {
      postMessage: (msg, transfer) => worker.postMessage(msg, transfer ?? []),
      onMessage: (cb) => { worker.on('message', cb); },
      onError: (cb) => { worker.on('error', cb); },
      onExit: (cb) => { worker.on('exit', cb); },
      terminate: () => worker.terminate().then(() => undefined),
      raw: worker,
    };
  },
  defaultCachePath,
  // The browser-only `workerUrl`/`coreUrl` are ignored in Node (worker + core load from the
  // installed package); the removed tesseract.js ACE knobs are ignored too.
  legacyIgnoredKeys: ['workerPath', 'corePath', 'workerBlobURL', 'workerUrl', 'coreUrl'],
  validateResolved(opts: ResolvedWorkerOptions): void {
    if (opts.langPath !== null) {
      if (looksLikeUrl(opts.langPath)) {
        if (!isHttpsUrl(opts.langPath)) {
          throw new ValidationError('`langPath` URLs must use https (language data is executable-adjacent; plain http is not allowed).');
        }
      } else if (!fs.existsSync(opts.langPath) || !fs.statSync(opts.langPath).isDirectory()) {
        throw new ValidationError(`\`langPath\` is neither an https URL nor an existing local directory: ${opts.langPath}`);
      }
    }
  },
  readFile: readImageFile,
};
