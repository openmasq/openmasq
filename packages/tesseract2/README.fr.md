# tesseract2.js

[English](README.md)

**Un OCR durci pour Node.js et les extensions de navigateur, réécrit en TypeScript à partir de tesseract.js.**

tesseract2.js fait de l'OCR multilingue avec le build WASM officiel
[`tesseract.js-core`](https://www.npmjs.com/package/tesseract.js-core), dans un fil
`worker_threads` sous Node.js ou dans un Web Worker dans le navigateur. Il garde l'API de
tesseract.js (`createWorker`, `createScheduler`, `recognize`, `detect`, `OEM`, `PSM`), avec des
types stricts, des entrées sur liste d'autorisation, des plafonds de taille et des erreurs
typées. Dans OpenMasq, l'étape d'OCR de `@openmasq/redact` repose sur lui.

> [!NOTE]
> Le paquet est intégré à ce monorepo et marqué `private` : il n'est pas publié sur npm.
> Utilisez-le depuis un autre paquet de l'espace de travail avec
> `"tesseract2.js": "workspace:*"`.

## Prise en main

```js
const { createWorker, createScheduler, recognize, OEM, PSM } = require('tesseract2.js');

// En une fois
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

Le build Node est en CommonJS avec des déclarations `.d.ts` : `require()` et `import`
fonctionnent tous les deux. `createWorker` utilise `OEM.LSTM_ONLY` par défaut.

**Images acceptées** : un chemin local, une URL `file:`, `http(s):` ou `data:`, un `Buffer`, un
`Uint8Array` ou un `ArrayBuffer`. Le build navigateur refuse les chemins et les URL `file:`.

**Orientation et écriture** : `detect(image)` crée pour vous un worker `osd` sur le moteur
historique. Sur votre propre worker, `worker.detect` exige `OEM.TESSERACT_ONLY`.

## Compiler et tester

Nécessite Node.js 18 ou plus récent (`fetch` natif, `worker_threads`, `zlib`).

```bash
pnpm --filter tesseract2.js build       # build Node + bundle navigateur dans dist/
pnpm --filter tesseract2.js typecheck
pnpm test                               # depuis la racine : exécute src/**/*.test.ts avec le reste
```

| Sortie | Contenu |
|---|---|
| `dist/node/` | Point d'entrée CommonJS et script `worker_threads` (`tsc -p tsconfig.json`) |
| `dist/browser/index.js` | Façade ESM côté page, empaquetée par esbuild |
| `dist/browser/worker.js` | Web Worker classique autonome, empaqueté par esbuild |

Les exports du paquet choisissent le build : `tesseract2.js` pointe vers le build Node sous la
condition `node` et vers le build navigateur sous `browser`. `tesseract2.js/node` et
`tesseract2.js/browser` en désignent un explicitement.

## Build navigateur

Le build navigateur vise une extension signée. Le script du worker, le cœur WASM et les données
de langue doivent tous être servis depuis la même origine que la page qui les exécute.

```js
import { createWorker, OEM } from 'tesseract2.js/browser';

const worker = await createWorker('eng', OEM.LSTM_ONLY, {
  workerUrl: '/ocr/worker.js',   // votre copie de dist/browser/worker.js
  coreUrl: '/ocr/core',          // tesseract-core*.wasm.js et leurs fichiers .wasm
  langPath: '/ocr/lang',         // eng.traineddata
  gzip: false,
});
```

- **`workerUrl` et `coreUrl`** : obligatoires. Ils sont comparés à `location.origin` avant le
  démarrage du worker, puis de nouveau dans le worker. Une URL d'une autre origine lève une
  `ValidationError`.
- **Données de langue** : toujours lues depuis `langPath`, jamais depuis le CDN. Il n'y a pas de
  cache sur disque.
- **Cœur** : chargé par `importScripts`, la variante la plus rapide d'abord (SIMD relâché,
  SIMD, standard), puis celle que vous livrez.

> [!IMPORTANT]
> Le build navigateur ne calcule pas d'empreinte du cœur WASM à l'exécution. Son intégrité
> vient de son appartenance au paquet signé, le même modèle de confiance que le
> `node_modules` du build Node.

## Données de langue

Sous Node, sans `langPath`, chaque `<lang>.traineddata` est téléchargé depuis jsDelivr
(`@tesseract.js-data`) puis mis en cache dans `$XDG_CACHE_HOME/tesseract2.js`, ou à défaut
`~/.cache/tesseract2.js`. Pour travailler hors ligne, pointez `langPath` vers un dossier local :

```js
const worker = await createWorker('eng', OEM.LSTM_ONLY, {
  langPath: '/opt/tessdata',   // contient eng.traineddata (ou eng.traineddata.gz)
  gzip: false,
  cacheMethod: 'none',
  integrity: { eng: 'sha256-<base64>' },   // épinglage facultatif ; une empreinte hexadécimale convient aussi
});
```

`langPath` doit être un dossier existant ou une URL `https:`. Avec `integrity`, les octets
décompressés sont vérifiés avant d'atteindre l'analyseur de Tesseract, quelle que soit leur
source (données explicites, cache, dossier ou téléchargement). Une empreinte qui ne correspond
pas fait échouer le chargement.

> [!TIP]
> L'application OpenMasq empaquetée livre ses propres traineddata et les transmet avec des
> empreintes SHA-256 épinglées (voir
> [`packages/redact/src/ocr/ocr.ts`](../redact/src/ocr/ocr.ts)). Le téléchargement depuis le
> CDN n'a lieu qu'en développement.

## Options

`createWorker(langs, oem, options, config)` refuse les options inconnues avec une
`ValidationError`. Les options de tesseract.js `workerPath`, `corePath` et `workerBlobURL` sont
ignorées avec un avertissement.

| Option | Défaut | Description |
|---|---|---|
| `langPath` | aucun | Dossier local ou URL `https:` (Node), URL de même origine (navigateur) |
| `cachePath` | `~/.cache/tesseract2.js` | Dossier du cache sur disque (Node seulement) |
| `cacheMethod` | `'write'` | `'write'`, `'readOnly'`, `'refresh'` ou `'none'` |
| `gzip` | `true` | Cherche `<lang>.traineddata.gz` |
| `integrity` | aucun | `{ <lang>: "sha256-<base64>" }` ou une empreinte hexadécimale |
| `maxImageBytes` | 128 Mio | Les images plus lourdes sont refusées |
| `maxLangDataBytes` | 512 Mio | Plafonne les données de langue, les téléchargements et la décompression |
| `fetchTimeout` | 30 s | Par requête, en ms ; `0` désactive le délai |
| `jobTimeout` | `0` (aucun) | Par tâche, en ms ; rejette avec une `TimeoutError` |
| `allowUnknownFormats` | `false` | Saute la vérification des octets magiques de l'image |
| `resourceLimits` | aucun | Transmis au `Worker` de `worker_threads` (Node seulement) |
| `logger`, `errorHandler` | aucun | Rappel de progression, rappel d'erreur |
| `logging` | `false` | Journaux de débogage de ce worker |
| `legacyCore`, `legacyLang` | `false` | Charge le cœur complet et les données de langue non LSTM |
| `dataPath` | aucun | Dossier dans le système de fichiers WASM en mémoire |
| `workerUrl`, `coreUrl` | aucun | Obligatoires dans le build navigateur, ignorés sous Node |

## Ce qui change par rapport à tesseract.js

| Domaine | tesseract2.js |
|---|---|
| **Worker et cœur** | Chargés depuis le paquet installé sous Node, depuis des URL de même origine dans le navigateur. Aucun chemin de script fourni par l'appelant. |
| **Codes de langue** | Validés par une expression régulière stricte avant tout usage dans un chemin ou une URL. 16 langues au plus par worker, chargées 4 par 4. Les lectures locales restent dans `langPath`. |
| **Aiguillage** | Les actions du worker, les méthodes `FS`, les actions du scheduler et les options sont sur liste d'autorisation. Les options de reconnaissance sont copiées dans des objets sans prototype. |
| **Tailles** | `maxImageBytes`, `maxLangDataBytes` et décompression plafonnée. Les téléchargements sont lus en flux et s'arrêtent au plafond. |
| **Réseau** | Un seul chemin de téléchargement : `fetchTimeout` sur chaque requête, redirections suivies à la main (5 au plus) avec le schéma vérifié à chaque saut. Les données de langue doivent être en `https:`. |
| **Formats d'image** | Octets magiques vérifiés avant le décodage : PNG, JPEG, BMP, GIF, WebP, TIFF, PNM, JP2. |
| **Intégrité des données de langue** | Épinglage SHA-256 facultatif par langue. |
| **Cache** | Écrit dans un fichier temporaire puis renommé. Par défaut dans `~/.cache/tesseract2.js`. |
| **Erreurs** | Rejets typés, tous sous-classes de `TesseractError` avec un `code` : `ValidationError`, `NetworkError`, `WorkerError`, `TimeoutError`. Un échec dans le worker revient sous forme de rejet. |
| **Démarrage** | Si le chargement ou l'initialisation échoue, le fil est terminé et `createWorker` rejette. |
| **Identifiants de tâche** | `crypto.randomUUID()`. |
| **Dépendances d'exécution** | Une seule : `tesseract.js-core`. |

**Autres comportements** :

- Un worker qui plante ou s'arrête rejette aussitôt toutes ses tâches en attente. Le scheduler
  le retire alors de sa rotation.
- `scheduler.terminate()` attend l'arrêt de chaque worker.
- Un objet `config` est écrit à raison d'une ligne `clé valeur` par paramètre : les valeurs
  contenant `,`, `:` ou `"` restent intactes.
- `rotateAuto` mesure l'inclinaison dans un mode de segmentation automatique, puis recharge
  l'image avec cette rotation.
- Les tampons d'image sont transférés au fil du worker, pas copiés.
- Les données de langue personnalisées (`{ code, data }`) passent avant le cache.

**Non repris** :

- Les workers par CDN et par blob. Le build navigateur charge des fichiers de même origine à
  la place.
- Le réencodage BMP par `bmp-js`. Les BMP courants vont directement à Leptonica ; convertissez
  les variantes inhabituelles en PNG.
- Le `setLogging` global. Utilisez l'option `logging` de chaque worker.

## Licence

Apache-2.0. Œuvre dérivée de [tesseract.js](https://github.com/naptha/tesseract.js) ; voir
[`LICENSE.md`](LICENSE.md). Avant de modifier le code, lisez [`CLAUDE.md`](CLAUDE.md) : il
décrit l'architecture et les règles de sécurité.
