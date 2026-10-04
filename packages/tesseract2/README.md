# tesseract2.js

[Français](README.fr.md)

**Hardened OCR for Node.js and browser extensions, rewritten in TypeScript from tesseract.js.**

tesseract2.js runs multilingual OCR with the official WASM build
[`tesseract.js-core`](https://www.npmjs.com/package/tesseract.js-core), in a `worker_threads`
thread on Node.js or a Web Worker in the browser. It keeps the tesseract.js API
(`createWorker`, `createScheduler`, `recognize`, `detect`, `OEM`, `PSM`), with strict types,
allow-listed inputs, size caps and typed errors. In OpenMasq, the OCR step of
`@openmasq/redact` runs on it.

> [!NOTE]
> The package is vendored in this monorepo and marked `private`: it is not published to npm.
> Use it from another workspace package with `"tesseract2.js": "workspace:*"`.

## Quick start

```js
const { createWorker, createScheduler, recognize, OEM, PSM } = require('tesseract2.js');

// One-shot
const { data } = await recognize('invoice.png', 'fra');
console.log(data.text);

// Reusable worker
const worker = await createWorker('eng+fra');
const res = await worker.recognize('scan.jpg', { rotateAuto: true }, { text: true, hocr: true });
await worker.terminate();

// Pool of workers
const scheduler = createScheduler();
scheduler.addWorker(await createWorker('eng'));
scheduler.addWorker(await createWorker('eng'));
const results = await Promise.all(images.map((img) => scheduler.addJob('recognize', img)));
await scheduler.terminate();
```

The Node build is CommonJS with `.d.ts` declarations, so `require()` and `import` both work.
`createWorker` uses `OEM.LSTM_ONLY` by default.

**Image inputs**: a local path, a `file:`, `http(s):` or `data:` URL, a `Buffer`, a
`Uint8Array` or an `ArrayBuffer`. The browser build rejects paths and `file:` URLs.

**Orientation and script**: `detect(image)` creates an `osd` worker on the legacy engine for
you. On your own worker, `worker.detect` needs `OEM.TESSERACT_ONLY`.

## Build and test

Requires Node.js 18 or later (native `fetch`, `worker_threads`, `zlib`).

```bash
pnpm --filter tesseract2.js build       # Node build + browser bundle into dist/
pnpm --filter tesseract2.js typecheck
pnpm test                               # from the root: runs src/**/*.test.ts with the rest
```

| Output | Contents |
|---|---|
| `dist/node/` | CommonJS entry and the `worker_threads` script (`tsc -p tsconfig.json`) |
| `dist/browser/index.js` | ESM host facade, bundled by esbuild |
| `dist/browser/worker.js` | Self-contained classic Web Worker, bundled by esbuild |

The package exports pick the build: `tesseract2.js` resolves to the Node build under the
`node` condition and to the browser build under `browser`. `tesseract2.js/node` and
`tesseract2.js/browser` select one explicitly.

## Browser build

The browser build targets a signed extension bundle. The worker script, the core WASM and the
language data must all be served from the same origin as the page that runs them.

```js
import { createWorker, OEM } from 'tesseract2.js/browser';

const worker = await createWorker('eng', OEM.LSTM_ONLY, {
  workerUrl: '/ocr/worker.js',   // your copy of dist/browser/worker.js
  coreUrl: '/ocr/core',          // tesseract-core*.wasm.js and their .wasm files
  langPath: '/ocr/lang',         // eng.traineddata
  gzip: false,
});
```

- **`workerUrl` and `coreUrl`**: required. They are checked against `location.origin` before
  the worker starts, and again inside the worker. A cross-origin URL throws a
  `ValidationError`.
- **Language data**: always read from `langPath`, never from the CDN. There is no on-disk
  cache.
- **Core**: loaded with `importScripts`, fastest variant first (relaxed SIMD, SIMD, plain),
  falling back to whichever files you ship.

> [!IMPORTANT]
> The browser build does not hash the core WASM at runtime. Its integrity comes from being part
> of the signed bundle, the same trust model as the Node build's `node_modules`.

## Language data

On Node, with no `langPath`, each `<lang>.traineddata` is downloaded from jsDelivr
(`@tesseract.js-data`) and cached in `$XDG_CACHE_HOME/tesseract2.js`, or
`~/.cache/tesseract2.js`. To work offline, point `langPath` at a local folder:

```js
const worker = await createWorker('eng', OEM.LSTM_ONLY, {
  langPath: '/opt/tessdata',   // contains eng.traineddata (or eng.traineddata.gz)
  gzip: false,
  cacheMethod: 'none',
  integrity: { eng: 'sha256-<base64>' },   // optional pin; a hex digest works too
});
```

`langPath` must be an existing directory or an `https:` URL. With `integrity`, the
decompressed bytes are checked before they reach the Tesseract parser, whatever their source
(explicit data, cache, folder or download). A mismatch rejects.

> [!TIP]
> The packaged OpenMasq app ships its own traineddata and passes it with SHA-256 pins (see
> [`packages/redact/src/ocr/ocr.ts`](../redact/src/ocr/ocr.ts)). The CDN download only
> happens in development.

## Options

`createWorker(langs, oem, options, config)` rejects unknown options with a `ValidationError`.
The tesseract.js options `workerPath`, `corePath` and `workerBlobURL` are ignored with a
warning.

| Option | Default | Description |
|---|---|---|
| `langPath` | none | Local folder or `https:` URL (Node), same-origin URL (browser) |
| `cachePath` | `~/.cache/tesseract2.js` | On-disk cache folder (Node only) |
| `cacheMethod` | `'write'` | `'write'`, `'readOnly'`, `'refresh'` or `'none'` |
| `gzip` | `true` | Look for `<lang>.traineddata.gz` |
| `integrity` | none | `{ <lang>: "sha256-<base64>" }` or a hex digest |
| `maxImageBytes` | 128 MiB | Larger images are rejected |
| `maxLangDataBytes` | 512 MiB | Caps language data, downloads and gunzip output |
| `fetchTimeout` | 30 s | Per request, in ms; `0` means no timeout |
| `jobTimeout` | `0` (none) | Per job, in ms; rejects with a `TimeoutError` |
| `allowUnknownFormats` | `false` | Skip the image magic-byte check |
| `resourceLimits` | none | Passed to the `worker_threads` `Worker` (Node only) |
| `logger`, `errorHandler` | none | Progress callback, error callback |
| `logging` | `false` | Debug logs for this worker |
| `legacyCore`, `legacyLang` | `false` | Load the full core and the non-LSTM language data |
| `dataPath` | none | Folder inside the in-memory WASM filesystem |
| `workerUrl`, `coreUrl` | none | Required in the browser build, ignored on Node |

## What changes compared with tesseract.js

| Area | tesseract2.js |
|---|---|
| **Worker and core** | Loaded from the installed package on Node, from same-origin URLs in the browser. No caller-supplied script path. |
| **Language codes** | Validated by a strict regex before use in a path or URL. At most 16 languages per worker, loaded 4 at a time. Local reads stay inside `langPath`. |
| **Dispatch** | Worker actions, `FS` methods, scheduler actions and options are allow-lists. Recognize options are copied into null-prototype objects. |
| **Sizes** | `maxImageBytes`, `maxLangDataBytes`, and capped gunzip output. Downloads are streamed and stop at the cap. |
| **Network** | One download path: `fetchTimeout` on every request, redirects followed by hand (5 at most) with the scheme checked on each hop. Language data must be `https:`. |
| **Image formats** | Magic bytes checked before decoding: PNG, JPEG, BMP, GIF, WebP, TIFF, PNM, JP2. |
| **Language data integrity** | Optional SHA-256 pin per language. |
| **Cache** | Written to a temp file then renamed. Defaults to `~/.cache/tesseract2.js`. |
| **Errors** | Typed rejections, all subclasses of `TesseractError` with a `code`: `ValidationError`, `NetworkError`, `WorkerError`, `TimeoutError`. A failure inside the worker comes back as a rejection. |
| **Boot** | If loading or initialization fails, the thread is terminated and `createWorker` rejects. |
| **Job ids** | `crypto.randomUUID()`. |
| **Runtime dependencies** | One: `tesseract.js-core`. |

**Other behaviour**:

- A worker that crashes or exits rejects every pending job at once. The scheduler then drops it
  from its rotation.
- `scheduler.terminate()` waits for every worker to stop.
- A `config` object is written as one `key value` line per parameter, so values containing
  `,`, `:` or `"` survive.
- `rotateAuto` measures the skew in an automatic page-segmentation mode, then re-sets the image
  with that rotation.
- Image buffers are transferred to the worker thread, not copied.
- Custom language data (`{ code, data }`) takes precedence over the cache.

**Not carried over**:

- CDN and blob workers. The browser build loads same-origin files instead.
- BMP re-encoding through `bmp-js`. Common BMPs go straight to Leptonica; convert unusual
  variants to PNG.
- The global `setLogging`. Use the per-worker `logging` option.

## Licence

Apache-2.0. A derivative work of [tesseract.js](https://github.com/naptha/tesseract.js); see
[`LICENSE.md`](LICENSE.md). Before changing the code, read [`CLAUDE.md`](CLAUDE.md): it maps
the architecture and the security rules.
