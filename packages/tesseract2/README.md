# tesseract2.js

A **TypeScript** rewrite of [tesseract.js](https://github.com/naptha/tesseract.js) for Node.js, with the same public API on the Node side but typed, simpler and markedly safer code. Multilingual OCR through the official WASM build [`tesseract.js-core`](https://www.npmjs.com/package/tesseract.js-core), run inside a `worker_threads` thread.

**Node ≥ 18 only** (uses native `fetch`, `worker_threads`, `zlib`). No browser support.

## Install & build

```bash
npm install    # tesseract.js-core (runtime) + typescript (dev); compiles automatically through "prepare"
npm run build  # recompile src/*.ts -> dist/ (CommonJS + .d.ts)
npm test       # build + smoke tests (real OCR, offline)
```

Sources in `src/` (strict TypeScript), compiled output in `dist/` (CommonJS, hence usable with `require()` as well as `import`). The `.d.ts` declarations are generated at compile time.

## Usage

```js
const { createWorker, createScheduler, recognize, OEM, PSM } = require('tesseract2.js');

// One-shot
const { data } = await recognize('facture.png', 'fra');
console.log(data.text);

// Reusable worker
const worker = await createWorker('eng+fra');
const res = await worker.recognize('scan.jpg', { rotateAuto: true }, { text: true, hocr: true });
await worker.terminate();

// Pool de workers
const scheduler = createScheduler();
scheduler.addWorker(await createWorker('eng'));
scheduler.addWorker(await createWorker('eng'));
const results = await Promise.all(images.map((img) => scheduler.addJob('recognize', img)));
await scheduler.terminate();
```

Accepted image inputs: local path, `http(s):`/`file:`/`data:` URL, `Buffer`, `Uint8Array`, `ArrayBuffer`.

## What changes compared with tesseract.js

### Security

| Problem in tesseract.js | Fix in tesseract2.js |
| --- | --- |
| `workerPath`/`corePath` allow arbitrary code to be loaded and run | Worker script and WASM core always loaded from the installed package; the options are ignored with a warning |
| Language codes interpolated raw into disk paths and URLs (`langs: '../../x'` = path traversal) | Codes validated by a strict regex before any use; local reads confined to the `langPath` folder |
| Action dispatch by unvalidated lookup (`handlers[packet.action]`) | A frozen allow-list (`Object.freeze` + `hasOwnProperty`), likewise for the `FS` methods and the scheduler's actions |
| No size limit at all (image, traineddata, gunzip → zip bomb) | `maxImageBytes` (128 MiB), `maxLangDataBytes` (512 MiB), decompression capped through `zlib maxOutputLength` |
| Downloads with no timeout | `fetchTimeout` (30 s by default) on every request |
| A remote `langPath` over HTTP accepted | HTTPS mandatory for language data |
| Any byte handed to the C/WASM decoder | Magic-byte verification (PNG, JPEG, BMP, GIF, WebP, TIFF, PNM, JP2); `allowUnknownFormats: true` to disable |
| Non-atomic cache write (a truncated traineddata was possible) | Temp write + atomic `rename`; cache by default in `~/.cache/tesseract2.js` instead of the CWD |
| A `throw` in the message handler → process crash without an `errorHandler` | Every error is propagated as a typed promise rejection (`ValidationError`, `NetworkError`, `WorkerError`, `TimeoutError`) |
| Silent init failure (`.catch(() => {})`): a pending promise + a zombie thread | An init failure ⇒ the thread is terminated + `createWorker` rejects |
| Job ids from `Math.random` | `crypto.randomUUID()` |
| 8 runtime dependencies (node-fetch, zlibjs, bmp-js, is-url, idb-keyval…) | Just one: `tesseract.js-core` |

### Robustness / fixes

- A worker that dies (crash, `exit`) immediately rejects every pending job.
- `scheduler.terminate()` really waits for the workers to finish (the original `forEach(async …)` did not).
- A `jobTimeout` option to bound the duration of a `recognize`.
- A `resourceLimits` option passed to `worker_threads` (memory ceiling of the OCR thread).
- A `config` object converted properly into a config file (the original implementation broke values containing `,` `:` `"`).
- Fixed `rotateAuto`'s PSM test (`PSM.OSD` did not exist → the comparison was always false).
- Image buffers are transferred (not copied) to the worker thread.
- Custom language data (`{ code, data }`): the explicit data wins over the cache.
- Unknown options are rejected (typo detection) instead of being ignored.

### Deliberately not carried over

- Browser / CDN / blob-worker support.
- BMP re-encoding through `bmp-js` (unmaintained): ordinary BMPs go straight to Leptonica; convert exotic variants to PNG.
- The global `setLogging` → a per-worker `logging` option.
- `corePath`: the core always comes from the installed package.

## Language data

By default, the `.traineddata` files are downloaded from the official jsDelivr CDN (`@tesseract.js-data`) then cached in `~/.cache/tesseract2.js`. For offline use, point `langPath` at a local folder:

```js
const worker = await createWorker('eng', OEM.LSTM_ONLY, {
  langPath: '/opt/tessdata',   // contains eng.traineddata (or .gz)
  gzip: false,
  cacheMethod: 'none',
});
```

## Licence

Apache-2.0. A derivative work of tesseract.js (© the naptha/tesseract.js project) — see `LICENSE.md`.
