# tesseract2.js

Réécriture **TypeScript** de [tesseract.js](https://github.com/naptha/tesseract.js) pour Node.js, avec la même API publique côté Node mais un code typé, plus simple et nettement plus sûr. OCR multilingue via le build WASM officiel [`tesseract.js-core`](https://www.npmjs.com/package/tesseract.js-core), exécuté dans un `worker_threads`.

**Node ≥ 18 uniquement** (utilise `fetch` natif, `worker_threads`, `zlib`). Pas de support navigateur.

## Installation & build

```bash
npm install    # tesseract.js-core (runtime) + typescript (dev) ; compile automatiquement via "prepare"
npm run build  # recompile src/*.ts -> dist/ (CommonJS + .d.ts)
npm test       # build + tests de fumée (OCR réel, hors-ligne)
```

Sources dans `src/` (TypeScript strict), sortie compilée dans `dist/` (CommonJS, donc utilisable en `require()` comme en `import`). Les déclarations `.d.ts` sont générées à la compilation.

## Usage

```js
const { createWorker, createScheduler, recognize, OEM, PSM } = require('tesseract2.js');

// One-shot
const { data } = await recognize('facture.png', 'fra');
console.log(data.text);

// Worker réutilisable
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

Les entrées image acceptées : chemin local, URL `http(s):`/`file:`/`data:`, `Buffer`, `Uint8Array`, `ArrayBuffer`.

## Ce qui change par rapport à tesseract.js

### Sécurité

| Problème dans tesseract.js | Correctif dans tesseract2.js |
| --- | --- |
| `workerPath`/`corePath` permettent de charger et exécuter du code arbitraire | Script worker et core WASM toujours chargés depuis le package installé ; options ignorées avec avertissement |
| Codes langue interpolés bruts dans chemins disque et URLs (`langs: '../../x'` = traversée de chemin) | Codes validés par regex stricte avant tout usage ; lecture locale confinée au dossier `langPath` |
| Dispatch d'action par lookup non validé (`handlers[packet.action]`) | Allowlist figée (`Object.freeze` + `hasOwnProperty`), idem pour les méthodes `FS` et les actions du scheduler |
| Aucune limite de taille (image, traineddata, gunzip → zip bomb) | `maxImageBytes` (128 Mio), `maxLangDataBytes` (512 Mio), décompression plafonnée via `zlib maxOutputLength` |
| Téléchargements sans timeout | `fetchTimeout` (30 s par défaut) sur toutes les requêtes |
| `langPath` distant en HTTP accepté | HTTPS obligatoire pour les données de langue |
| N'importe quel octet transmis au décodeur C/WASM | Vérification des magic bytes (PNG, JPEG, BMP, GIF, WebP, TIFF, PNM, JP2) ; `allowUnknownFormats: true` pour désactiver |
| Écriture du cache non atomique (traineddata tronqué possible) | Écriture temp + `rename` atomique ; cache par défaut dans `~/.cache/tesseract2.js` au lieu du CWD |
| `throw` dans le handler de message → crash du process si pas d'`errorHandler` | Toute erreur est propagée en rejet de promesse typé (`ValidationError`, `NetworkError`, `WorkerError`, `TimeoutError`) |
| Échec d'init silencieux (`.catch(() => {})`) : promesse pendante + thread zombie | Échec d'init ⇒ thread terminé + rejet de `createWorker` |
| IDs de jobs via `Math.random` | `crypto.randomUUID()` |
| 8 dépendances runtime (node-fetch, zlibjs, bmp-js, is-url, idb-keyval…) | 1 seule : `tesseract.js-core` |

### Robustesse / corrections

- Le worker qui meurt (crash, `exit`) rejette immédiatement tous les jobs en attente.
- `scheduler.terminate()` attend réellement la fin des workers (le `forEach(async …)` d'origine ne le faisait pas).
- Option `jobTimeout` pour borner la durée d'un `recognize`.
- Option `resourceLimits` transmise à `worker_threads` (plafond mémoire du thread OCR).
- `config` objet converti proprement en fichier de config (l'implémentation d'origine cassait les valeurs contenant `,` `:` `"`).
- Correction du test PSM de `rotateAuto` (`PSM.OSD` n'existait pas → comparaison toujours fausse).
- Les buffers d'image sont transférés (pas copiés) vers le thread worker.
- Données de langue custom (`{ code, data }`) : la donnée explicite prime sur le cache.
- Options inconnues rejetées (détection de typos) au lieu d'être ignorées.

### Non repris (volontairement)

- Support navigateur / CDN / blob workers.
- Ré-encodage BMP via `bmp-js` (non maintenu) : les BMP courants passent tels quels à Leptonica ; convertissez les variantes exotiques en PNG.
- `setLogging` global → option `logging` par worker.
- `corePath` : le core vient toujours du package installé.

## Données de langue

Par défaut, les `.traineddata` sont téléchargés depuis le CDN jsDelivr officiel (`@tesseract.js-data`) puis mis en cache dans `~/.cache/tesseract2.js`. Pour un usage hors-ligne, pointez `langPath` vers un dossier local :

```js
const worker = await createWorker('eng', OEM.LSTM_ONLY, {
  langPath: '/opt/tessdata',   // contient eng.traineddata (ou .gz)
  gzip: false,
  cacheMethod: 'none',
});
```

## Licence

Apache-2.0. Œuvre dérivée de tesseract.js (© projet naptha/tesseract.js) — voir `LICENSE.md`.
