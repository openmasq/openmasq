import fsp from 'fs/promises';
import path from 'path';
import zlib from 'zlib';
import { randomUUID, createHash } from 'crypto';

import { ValidationError } from '../core/errors';
import getCore from './getCore';
import type { WorkerPlatform, LangCache, Sha256Digest, LoadCoreOptions } from '../platform/types';

const cacheFilePath = (cachePath: string, lang: string): string => path.join(cachePath, `${lang}.traineddata`);

/*
 * Atomic cache write: temp file + rename, so a crash mid-write can never leave a
 * truncated .traineddata that poisons every later run.
 */
const nodeCache: LangCache = {
  read: async (cachePath, lang) => {
    try {
      return new Uint8Array(await fsp.readFile(cacheFilePath(cachePath, lang)));
    } catch {
      return null;
    }
  },
  write: async (cachePath, lang, data) => {
    await fsp.mkdir(cachePath, { recursive: true });
    const target = cacheFilePath(cachePath, lang);
    const tmp = `${target}.${randomUUID().slice(0, 8)}.tmp`;
    try {
      await fsp.writeFile(tmp, data);
      await fsp.rename(tmp, target);
    } catch (err) {
      await fsp.unlink(tmp).catch(() => {});
      throw err;
    }
  },
  clear: async (cachePath, langCodes) => {
    await Promise.all(langCodes.map((lang) => fsp.unlink(cacheFilePath(cachePath, lang)).catch(() => {})));
  },
};

/*
 * Reads `<lang>.traineddata[.gz]` from a local directory, refusing any resolved
 * path that escapes that directory.
 */
const readLocalLangData = async (baseDir: string, fileName: string): Promise<Uint8Array> => {
  const root = path.resolve(baseDir);
  const resolved = path.resolve(root, fileName);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new ValidationError(`Refusing to read language data outside of langPath: ${fileName}`);
  }
  return new Uint8Array(await fsp.readFile(resolved));
};

export const nodeWorkerPlatform: WorkerPlatform = {
  loadCore: async (opts: LoadCoreOptions) => getCore(opts.lstmOnly),
  gunzip: async (data, maxBytes) => new Uint8Array(zlib.gunzipSync(data, { maxOutputLength: maxBytes })),
  sha256: async (data): Promise<Sha256Digest> => {
    const digest = createHash('sha256').update(data).digest();
    return { hex: digest.toString('hex'), b64: digest.toString('base64') };
  },
  cache: nodeCache,
  readLocalLangData: (base, fileName) => readLocalLangData(base, fileName),
};
