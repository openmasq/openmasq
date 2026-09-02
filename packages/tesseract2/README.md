# tesseract2.js

<sub>**English** · [Français](#tesseract2js--la-réécriture)</sub>

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

---

# tesseract2.js — la réécriture

Une réécriture en **TypeScript** de [tesseract.js](https://github.com/naptha/tesseract.js)
pour Node.js, avec la même API publique côté Node mais un code typé, plus simple et
nettement plus sûr. OCR multilingue via le build WASM officiel
[`tesseract.js-core`](https://www.npmjs.com/package/tesseract.js-core), exécuté dans un fil
`worker_threads`.

**Node ≥ 18 seulement** (utilise le `fetch` natif, `worker_threads`, `zlib`). Pas de support
navigateur.

## Installer et construire

```bash
npm install    # tesseract.js-core (exécution) + typescript (dev) ; compile via "prepare"
npm run build  # recompile src/*.ts -> dist/ (CommonJS + .d.ts)
npm test       # build + tests de fumée (vrai OCR, hors ligne)
```

Les sources sont dans `src/` (TypeScript strict), la sortie compilée dans `dist/` (CommonJS,
donc utilisable en `require()` comme en `import`). Les déclarations `.d.ts` sont générées à la
compilation. L'usage est identique à celui montré plus haut.

Entrées d'image acceptées : chemin local, URL `http(s):`/`file:`/`data:`, `Buffer`,
`Uint8Array`, `ArrayBuffer`.

## Ce qui change par rapport à tesseract.js

### Sécurité

| Problème dans tesseract.js | Correctif dans tesseract2.js |
| --- | --- |
| `workerPath`/`corePath` permettent de charger et d'exécuter du code arbitraire | Le script du worker et le cœur WASM viennent toujours du paquet installé ; les options sont ignorées avec un avertissement |
| Codes de langue interpolés bruts dans des chemins et des URL (`langs: '../../x'` = traversée de chemin) | Codes validés par une expression stricte avant tout usage ; les lectures locales sont confinées au dossier `langPath` |
| Dispatch d'action par recherche non validée (`handlers[packet.action]`) | Une liste d'autorisation gelée (`Object.freeze` + `hasOwnProperty`), de même pour les méthodes `FS` et les actions du scheduler |
| Aucune limite de taille (image, traineddata, gunzip → bombe zip) | `maxImageBytes` (128 Mio), `maxLangDataBytes` (512 Mio), décompression plafonnée par `zlib maxOutputLength` |
| Téléchargements sans délai d'expiration | `fetchTimeout` (30 s par défaut) sur chaque requête |
| Un `langPath` distant en HTTP accepté | HTTPS obligatoire pour les données de langue |
| N'importe quel octet remis au décodeur C/WASM | Vérification des octets magiques (PNG, JPEG, BMP, GIF, WebP, TIFF, PNM, JP2) ; `allowUnknownFormats: true` pour désactiver |
| Écriture de cache non atomique (un traineddata tronqué était possible) | Écriture temporaire + `rename` atomique ; cache par défaut dans `~/.cache/tesseract2.js` plutôt que dans le répertoire courant |
| Un `throw` dans le gestionnaire de messages → plantage du processus sans `errorHandler` | Toute erreur est propagée en rejet de promesse typé (`ValidationError`, `NetworkError`, `WorkerError`, `TimeoutError`) |
| Échec d'init silencieux (`.catch(() => {})`) : une promesse pendante et un fil zombie | Un échec d'init ⇒ le fil est terminé et `createWorker` rejette |
| Identifiants de job issus de `Math.random` | `crypto.randomUUID()` |
| 8 dépendances d'exécution (node-fetch, zlibjs, bmp-js, is-url, idb-keyval…) | Une seule : `tesseract.js-core` |

### Robustesse et corrections

- Un worker qui meurt (plantage, `exit`) rejette immédiatement tous les jobs en attente.
- `scheduler.terminate()` attend vraiment la fin des workers (le `forEach(async …)` d'origine
  ne le faisait pas).
- Une option `jobTimeout` pour borner la durée d'un `recognize`.
- Une option `resourceLimits` passée à `worker_threads` (plafond mémoire du fil OCR).
- Un objet `config` correctement converti en fichier de configuration (l'implémentation
  d'origine cassait sur les valeurs contenant `,` `:` `"`).
- Le test de PSM de `rotateAuto` corrigé (`PSM.OSD` n'existait pas → la comparaison était
  toujours fausse).
- Les buffers d'image sont transférés (et non copiés) vers le fil du worker.
- Données de langue personnalisées (`{ code, data }`) : les données explicites l'emportent sur
  le cache.
- Les options inconnues sont rejetées (détection de faute de frappe) au lieu d'être ignorées.

### Délibérément non repris

- Le support navigateur / CDN / worker par blob.
- Le ré-encodage BMP par `bmp-js` (non maintenu) : les BMP ordinaires vont directement à
  Leptonica ; convertissez les variantes exotiques en PNG.
- Le `setLogging` global → une option `logging` par worker.
- `corePath` : le cœur vient toujours du paquet installé.

## Données de langue

Par défaut, les fichiers `.traineddata` sont téléchargés depuis le CDN jsDelivr officiel
(`@tesseract.js-data`) puis mis en cache dans `~/.cache/tesseract2.js`. Pour un usage hors
ligne, pointez `langPath` vers un dossier local (voir l'exemple plus haut).

## Licence

Apache-2.0. Œuvre dérivée de tesseract.js (© le projet naptha/tesseract.js) — voir
`LICENSE.md`.
