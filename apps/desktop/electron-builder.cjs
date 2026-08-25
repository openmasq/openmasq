// Config electron-builder — en JS (CJS) et non en YAML, pour UNE raison : la marque n'a
// qu'une maison (`packages/branding/branding.json`, règle 9) et un YAML ne sait pas la
// lire. Tout identifiant de produit (appId, productName, scheme, URL du flux de mise à
// jour) est DÉRIVÉ ci-dessous ; les valeurs produites sont identiques octet pour octet à
// celles expédiées jusqu'ici — parc installé oblige.
//
// ⚠️ Ce fichier est chargé par `scripts/eb.mjs` (`--config`), qui reste le SEUL point
// d'entrée d'empaquetage. `scripts/shippedTriples.ts` le `require()` aussi : la liste des
// arches expédiées n'a que cette maison-ci.
const brand = require("../../packages/branding/branding.json");

module.exports = {
  appId: brand.desktopBundleId,
  productName: brand.name,
  copyright: `Copyright © 2025 ${brand.name}`,

  // Le package.json de l'app n'embarque plus la marque : `name` (dossier NSIS + repli
  // `userData` d'Electron sous Windows — voir le commentaire historique dans `eb.mjs`),
  // `productName` (CFBundleName mac ⇒ `userData`) et `author` sont posés ICI, pour que
  // TOUS les chemins d'empaquetage (`package`, `dist`, `release`, CI) les aient.
  extraMetadata: {
    name: brand.slug,
    productName: brand.name,
    author: brand.name,
  },

  // Flip Electron Fuses on the packaged binary BEFORE signing: disable RunAsNode (all
  // spawns were migrated off ELECTRON_RUN_AS_NODE — audit B1), --inspect and NODE_OPTIONS,
  // encrypt cookies, enforce asar loading + integrity. See scripts/afterPack.cjs.
  afterPack: "./scripts/afterPack.cjs",

  // NO `electronVersion` here, on purpose. pnpm hoists Electron to the workspace root and the
  // devDependency is a range, so electron-builder can't infer it ("Cannot compute electron
  // version") — but a literal pinned in this file is worse: it does NOT follow the
  // devDependency, and NOTHING fails when it drifts. The build just downloads the pinned
  // runtime and ships it. It sat at 31.7.7 against an installed 39.x, so dev ran Node 22 while
  // the SHIPPED app ran Node 20 — eight majors of divergence that existed only in the artifact
  // users got.
  //
  // So the version is COMPUTED from the resolved dependency and passed on the command line by
  // `scripts/eb.mjs` — the single entry point for packaging (`package`, `dist` and `release` all
  // go through it, and so does CI). Use `pnpm run eb <args>`; invoking `electron-builder`
  // directly fails loudly instead of silently shipping a stale runtime. That script also REFUSES
  // to run outside pnpm (electron-builder picks its dependency collector from the RUNNER, and
  // under npm ships an app whose node_modules holds two packages) — a rule that used to be a
  // comment here and is now checked. Why it is a script and not a shell one-liner: `eb.mjs`.
  //
  // ⚠️ NO `--` before those args. pnpm forwards `--` LITERALLY (npm strips it), and
  // electron-builder's parser treats everything after it as positional — so `pnpm run eb --
  // --dir --publish never` silently ignores all three and builds the DEFAULT targets with the
  // DEFAULT publish behaviour. `pnpm run eb --dir` forwards correctly.

  directories: {
    output: "release",
    buildResources: "build",
  },

  // Magic-link deep link: registers the app's URL scheme (branding `protocol`) with the OS
  // so the Supabase sign-in link redirects back into the app (auth callback). The main
  // process also calls setAsDefaultProtocolClient at runtime (covers dev).
  protocols: [
    {
      name: brand.name,
      schemes: [brand.protocol],
    },
  ],

  // electron-vite already bundles main/preload/renderer into out/, and the
  // workspace packages are bundled in too, so we only ship out/ + package.json.
  // electron-builder adds the production node_modules (electron-updater).
  // ⛔ CETTE LISTE EST UNE ALLOWLIST, ET SON EFFET DÉPEND DE LA FORME DE `mac.files` /
  // `win.files` — lisez le bloc `mac.files` AVANT de toucher à l'une des trois.
  //
  // Ce qu'elle garantit : l'app ne contient QUE `out/` et `package.json` (les node_modules
  // sont filtrés à part, par le matcher dédié). Rien du dossier de travail — ni sources, ni
  // tests, ni outillage, ni fichiers d'environnement.
  //
  // ⚠️ Une allowlist qui ne s'applique pas ne se VOIT pas : build vert, app qui démarre,
  // simplement bien plus grosse que sa config ne le dit. D'où `afterPack.cjs`, qui RELIT
  // l'asar produit et casse le build sur toute entrée hors de cette liste
  // (`packageContents.cjs`) : la config est une intention, l'artefact est la preuve.
  files: [
    "out/**",
    "package.json",
    // Les sourcemaps ne sont JAMAIS expédiées : une `.map` embarque `sourcesContent`, donc
    // le TypeScript d'origine, commentaires compris — l'expédier annulerait la minification
    // que `electron.vite.config.ts` vient de faire. ⚠️ Cette ligne filtre POUR DE BON depuis
    // que les maps sont produites en `hidden` pour l'upload Sentry : elles existent dans
    // `out/`, et sans elle les 26 `.map` de nos bundles partent dans l'app.
    "!out/**/*.map",
    // electron-vite bundles every @openmasq/* workspace package into out/, so the
    // pnpm-symlinked copies in node_modules aren't needed at runtime. electron-builder
    // otherwise follows those symlinks and its asar packer errors on their files
    // ("… must be under apps/desktop/") because the symlink targets live outside the
    // app root (packages/*). Exclude the whole scope (+ any stray turbo logs).
    "!node_modules/@openmasq/**",
    // Nos `CLAUDE.md` décrivent le modèle de menace et la garde qui le couvre — c'est le
    // document le plus utile qu'on puisse offrir à qui cherche un trou, et deux partaient
    // encore par `node_modules` (`tesseract2.js`, notre OCR vendoré).
    "!**/CLAUDE.md",
    "!**/.turbo/**",
    // transformers.js (Node) met en cache les modèles TÉLÉCHARGÉS PENDANT LE DEV dans son
    // propre dossier de paquet — 346 Mo de re-uploads Xenova/* non pinnés embarqués tels
    // quels dans l'app (838 Mo de zip au lieu de ~490 : mesuré sur 0.3.3-staging.106.2).
    // Jamais du runtime : les modèles licites arrivent sha256-pinnés par extraResources
    // (ner-models / embed-models). Un poste de dev est le seul à avoir ce cache, donc la
    // CI ne voyait rien — l'exclusion protège les deux.
    "!**/@huggingface/transformers/.cache/**",
    // onnxruntime-node (the local-NER runtime, via @huggingface/transformers) ships
    // native binaries for EVERY platform (~210 MB total). Linux n'est jamais une cible :
    // ça se dit ici, une fois. Ce qui reste dépend de la plateforme QU'ON CONSTRUIT et vit
    // donc dans `mac.files` / `win.files` — un binaire darwin dans l'app Windows (et
    // inversement) n'est pas seulement du poids, c'est une plateforme entière expédiée à
    // l'autre : mesuré à 137 Mo dans le premier essai Windows.
    // ⚠️ DEUX noms, et ce n'est pas une ceinture-bretelles : depuis `@openmasq/ort`, le moteur
    // natif est installé sous l'alias `ort-native` (`npm:onnxruntime-node@…`). Les motifs qui ne
    // nommaient que `onnxruntime-node` ont donc cessé de matcher SANS rien casser — 53 Mo de
    // binaires Linux et Windows repartaient dans chaque .app mac, et dans chaque mise à jour.
    // Un renommage de paquet qui rend une exclusion muette ne se voit qu'à la pesée.
    "!**/onnxruntime-node/bin/napi-v6/linux/**",
    "!**/ort-native/bin/napi-v6/linux/**",
    "!**/@libsql/linux-*/**",
    // Le MÊME oubli, sur les deux autres natifs — et personne ne l'avait vu parce qu'il ne
    // casse rien : `@napi-rs/canvas` et `sharp` publient leurs prébuilts Linux en paquets de
    // plateforme, que `supportedArchitectures` installe, et rien ne les excluait. Mesuré dans
    // l'app arm64 de 0.5.0-staging.149 : 110 Mo de canvas (glibc+musl × x64+arm64) et 65 Mo de
    // libvips. Du code inexécutable sur un Mac, réexpédié à CHAQUE mise à jour.
    "!**/@napi-rs/canvas-linux-*/**",
    "!**/@img/sharp-linux*/**",
    "!**/@img/sharp-libvips-linux*/**",
    // @huggingface/transformers bundles onnxruntime-WEB (~120 MB) as a dep, but the local
    // NER runs via onnxruntime-NODE in the main process (transformers' Node build statically
    // imports onnxruntime-node; onnxruntime-web is only a DYNAMIC import that never fires on
    // Node, and even the web path fetches its wasm from a CDN). So the local wasm (~73 MB)
    // + source maps are dead weight — drop them.
    "!**/@huggingface/transformers/node_modules/onnxruntime-web/dist/*.wasm",
    "!**/@huggingface/transformers/**/*.map",
    // ⚠️ Le motif ci-dessus ne matche PLUS ce qui est réellement expédié. pnpm hisse
    // `onnxruntime-web` à la RACINE de node_modules ; c'est cette copie-là qui part, et le
    // chemin imbriqué sous `transformers` n'existe pas dans l'app. Résultat mesuré :
    // 74 Mo de `.wasm` + 21 Mo de sourcemaps embarqués pour rien. Rien ne les charge — le
    // moteur WASM du repli Intel vit sous l'ALIAS `ort-wasm` (un paquet distinct, trié par
    // arche dans `scripts/archPrune.cjs`), qu'aucun de ces motifs ne touche : les exclure ici
    // priverait un Mac Intel de son SEUL moteur.
    "!**/onnxruntime-web/dist/*.wasm",
    "!**/onnxruntime-web/**/*.map",
    // pdfjs-dist: the MAIN process uses `pdfjs-dist/legacy`; the renderer's pdf.js + worker
    // are Vite-bundled into out/. So the modern `build/`, the viewer `web/`, the standalone
    // `image_decoders/` and `types/` (~16 MB) are unused at runtime. Keep `legacy/`, `cmaps/`
    // and `standard_fonts/` (pdf.js loads those at runtime for CJK / embedded fonts).
    "!**/pdfjs-dist/build/**",
    "!**/pdfjs-dist/web/**",
    "!**/pdfjs-dist/image_decoders/**",
    "!**/pdfjs-dist/types/**",
  ],

  // @libsql/client ships a prebuilt N-API binary (ABI-stable → no Electron rebuild
  // needed). Don't let electron-builder try to recompile it, and keep the native
  // .node files out of the asar archive so they can be loaded at runtime.
  npmRebuild: false,
  // ⛔ CETTE LISTE EST CE QUI DONNE SON SENS AU FUSIBLE D'INTÉGRITÉ ASAR. Tout ce qui est
  // dégroupé vit en fichiers nus, modifiables, HORS du hash que le fusible vérifie — chaque
  // motif ajouté ici agrandit donc la surface qu'un processus local peut réécrire dans
  // l'app signée. On ne dégroupe que ce qui se charge PAR CHEMIN DE FICHIER, pas par le
  // `require` patché : les binaires natifs et leurs dylibs voisines (dlopen ne lit pas
  // l'asar), le wasm et ses workers `.mjs`, et les arbres qu'un `worker_threads` atteint
  // par `__dirname` (un Worker ne sait pas démarrer sur une entrée DANS l'asar — la raison
  // d'être de chaque motif est en face). TOUT LE RESTE du JS reste sous le sceau : un
  // express ou un undici réécrit sur le disque ne se charge plus.
  //
  // L'ancien état — `**/node_modules/**` entier — datait des enfants RUN_AS_NODE, qui ne
  // lisaient pas l'asar. Ce fusible est COUPÉ depuis l'audit B1 et plus rien ne spawn
  // ainsi : @playwright/mcp part en mode APP (asar-aware) et les workers fs/NER/embed/
  // extraction sont des `utilityProcess` — qui chargent depuis l'asar (leur entrée `out/`
  // y a toujours vécu). Un futur serveur stdio par `nodeSpawn.ts` retomberait dans le cas
  // RUN_AS_NODE : il exigerait de dégrouper SA closure — voir le commentaire de ce fichier.
  asarUnpack: [
    "**/*.node",
    // Natifs + leurs bibliothèques dynamiques voisines (dlopen par chemin réel).
    "**/@libsql/**",
    "**/onnxruntime-node/**",
    "**/ort-native/**",
    "**/@napi-rs/**",
    "**/@img/**",
    // Le moteur ONNX WASM (repli Intel) : `.wasm` + workers `.mjs` chargés par chemin.
    "**/ort-wasm/**",
    // `@huggingface/transformers` : arbre d'assets `import()`é paresseusement, qui résout
    // ses natifs/wasm par chemin (electron.vite.config.ts le garde external pour la même
    // raison).
    "**/@huggingface/transformers/**",
    // L'OCR vendoré : son Worker (`worker_threads`) démarre sur `dist/worker/worker.js`
    // résolu par `__dirname`, et le worker `require()`e le core WASM à côté.
    "**/tesseract2.js/**",
    "**/tesseract.js-core/**",
  ],

  // BUNDLED, pruned Python runtime + local BERT NER models — baked by
  // `scripts/bake-python-runtime.ts` / `bake-ner-models.ts` (run `pnpm bake` before packaging;
  // `dist`/`release` do it automatically). Shipped OUTSIDE the asar (native execs must be
  // spawnable + the tree is used read-only in place), landing under
  // `<app>/Contents/Resources/python-runtime` + `.../ner-models`, resolved at runtime via
  // `process.resourcesPath` (see `src/main/python/runtime.ts` + `src/main/localNer.ts`). No
  // runtime network fetch; the CPython tarball is sha256-pinned at bake time.
  // NOTE: mac ships TWO arches (see `mac.target`), donc les deux runtimes doivent avoir été
  // bakés (`BAKE_TARGET=darwin-x64 pnpm bake:runtime` en plus du bake hôte) — `mac.extraResources`
  // ci-dessous prend celui de l'arche construite. Un runtime manquant se voit au build.
  extraResources: [
    { from: "build/ner-models", to: "ner-models" },
    { from: "build/embed-models", to: "embed-models" },
    // BUNDLED OCR traineddata (audit M8): baked + sha256-verified vs official tessdata_fast by
    // `scripts/bake-tesseract-langs.ts`, loaded OFFLINE + integrity-pinned (no TOFU CDN fetch).
    // Resolved via `process.resourcesPath` in `src/main/ocrAssets.ts` → OPENMASQ_TESSERACT_LANG_PATH.
    { from: "build/tesseract-langs", to: "tesseract-langs" },
    // BUNDLED docTR OCR models (LATIN-script engine): self-exported first-party from Mindee's
    // official weights, baked + sha256-verified by `scripts/bake-doctr-models.ts`, loaded OFFLINE
    // + integrity-pinned. Resolved in `src/main/ocrAssets.ts` → OPENMASQ_DOCTR_MODEL_PATH.
    { from: "build/doctr-models", to: "doctr-models" },
  ],

  mac: {
    // Le runtime Python est le SEUL extraResource par triple (les modèles sont des poids,
    // pas des binaires) — il descend donc dans le bloc de sa plateforme.
    //
    // `${arch}` est développé PAR ARCH CONSTRUITE (electron-builder passe `files`, `from` et
    // `to` dans son `macroExpander`), donc une seule ligne sert les deux : chaque .app reçoit
    // le runtime de SON processeur. Un chemin en dur donnait le runtime arm64 à l'app x64 —
    // invisible au build, mortel au premier `import numpy` chez l'utilisateur.
    extraResources: [{ from: "build/python-runtime/darwin-${arch}", to: "python-runtime" }],
    // ⛔⛔ AUCUN `files:` ICI, NI SOUS `win:` — ET CE N'EST PAS NÉGOCIABLE.
    //
    // Un `files` de plateforme devient un matcher À PART, qui walke le dossier de l'app pour
    // son propre compte. Comme il ne contient que des négations, `AppFileWalker` lui préfixe
    // `**/*` (`addAllPatternIfNeed`) — il ratisse donc TOUT `apps/desktop/`, par-dessus
    // l'allowlist racine, qui ne peut RIEN retrancher de ce qu'un autre matcher a déjà pris.
    // Ce n'est pas une hypothèse : l'app se retrouve alors à porter le dossier de travail
    // entier au lieu de sa seule sortie de build, sans que rien ne rougisse — le build reste
    // vert, l'app démarre, et l'écart ne se voit qu'en ouvrant l'asar.
    //
    // ⚠️ La forme `- filter:` NE SAUVE PAS : elle remet bien l'allowlist racine en tête, mais
    // le second matcher garde son `**/*`. Testé, mesuré, toujours fuyant. La seule forme sûre
    // est l'ABSENCE de la clé.
    //
    // Où sont donc passés les prébuilts de l'autre plateforme (que `supportedArchitectures`
    // installe, et qui partiraient sinon) : dans `scripts/archPrune.cjs`, avec le tri par
    // ARCHE qui y vivait déjà pour la même raison de fond — `afterPack` connaît la plateforme
    // ET l'arche construites, tourne avant la signature, et supprime au lieu de filtrer.
    category: "public.app-category.productivity",
    target: [
      // ── LES DEUX ARCHES, depuis UN SEUL runner Apple Silicon ───────────────────────────
      //
      // Ce qui bloquait l'Intel n'était pas l'outillage mais le MOTEUR : `onnxruntime-node` ne
      // publie plus aucun binaire macOS x86_64, son `require` jetait, `@huggingface/transformers`
      // échouait en entier, le NER local ne démarrait pas — et l'app, qui échoue fermé à raison,
      // refusait TOUT envoi. `@openmasq/ort` le lève en choisissant le moteur à l'exécution
      // (natif s'il existe, WASM sinon), local et hors ligne dans les deux cas.
      //
      // Le reste était déjà prêt : le runtime Python x64 se bake depuis un runner Apple Silicon
      // (`bake-python-runtime.ts` mode cross — wheels résolues par tag puis relues octet par
      // octet), `extraResources` suit l'arche (`darwin-${arch}`), les prébuilts des deux arches
      // sont installés (`supportedArchitectures`), et electron-updater sert DEUX arches depuis UN
      // `latest-mac.yml` (`MacUpdater.filterFilesForArch` : arm64 préféré sur arm64/Rosetta,
      // entrées arm64 exclues sur x64) — une seule ligne de manifeste, pas de collision de clé.
      //
      // ⚠️ UN runner, pas deux : `macos-latest` est arm64 et construit les deux (l'install, le
      // build turbo et le bake sont payés UNE fois ; seuls l'empaquetage et la notarisation
      // doublent). Un second leg Intel coûterait ~230 min-eq de plus par release sur une image
      // (`macos-15-intel`) que GitHub retire en août 2027.
      //
      // ⚠️ Ce que ces deux lignes N'assurent PAS : que chaque .app contienne le moteur de SON
      // processeur. C'est `scripts/archPrune.cjs` qui trie et qui VÉRIFIE — un .app sans moteur
      // casse le build au lieu de s'installer chez quelqu'un pour refuser chaque envoi.
      { target: "dmg", arch: ["arm64", "x64"] },
      // zip is required by electron-updater (Squirrel.Mac) to apply updates.
      { target: "zip", arch: ["arm64", "x64"] },
    ],
    hardenedRuntime: true,
    gatekeeperAssess: false,
    entitlements: "build/entitlements.mac.plist",
    entitlementsInherit: "build/entitlements.mac.plist",
    // macOS requires a purpose string to prompt for microphone access (dictation).
    extendInfo: {
      NSMicrophoneUsageDescription: `${brand.name} utilise le micro pour la dictée (votre voix est transcrite en texte).`,
      // SECURITY (external scan #4): don't leave App Transport Security globally open.
      // Electron's default Info.plist ships NSAllowsArbitraryLoads=true (all cleartext
      // HTTP allowed). All first-party traffic is HTTPS (the brand's domain + subdomains);
      // only loopback (the OAuth 127.0.0.1 callback + the dev backend) uses plain HTTP, so
      // keep just those exceptions and disable the blanket allow.
      NSAppTransportSecurity: {
        NSAllowsArbitraryLoads: false,
        NSExceptionDomains: {
          localhost: {
            NSExceptionAllowsInsecureHTTPLoads: true,
            NSIncludesSubdomains: true,
          },
          "127.0.0.1": {
            NSExceptionAllowsInsecureHTTPLoads: true,
          },
        },
      },
    },
    // Notarization reads APPLE_ID / APPLE_APP_SPECIFIC_PASSWORD / APPLE_TEAM_ID.
    notarize: true,
  },

  dmg: {
    artifactName: "${productName}-${version}-${arch}.${ext}",
  },

  // ⚠️ CONSTRUITE ET LANCÉE EN CI, PAS ENCORE PUBLIABLE — et il ne reste QU'UNE raison.
  //
  //  1. Ce bloc se construit sur un runner windows-latest, mais plus pour la raison qui était
  //     écrite ici : le bake N'EXIGE plus l'interpréteur cible (`bake-python-runtime.ts` mode
  //     cross — pip résout par tag, et les octets produits sont relus). Ce qui exige encore
  //     Windows, c'est le RESTE de l'empaquetage : l'installeur NSIS, et le lanceur de jail
  //     (`<slug>-jail.exe`) qui se compile au MSVC. La matrice de `release.yml` s'en charge.
  //  2. ⛔ Publier sur un canal exige la signature Authenticode, et RIEN d'autre désormais.
  //     L'écrasement du manifeste mac par `latest.yml` est CORRIGÉ (migration 0007 : la clé
  //     unique porte la plateforme). Reste que sans certificat, `NsisUpdater.verifySignature`
  //     ne vérifie rien du tout (pas de `publisherName` dans `app-update.yml`) : la mise à
  //     jour Windows n'aurait aucune ancre d'intégrité hors TLS, là où mac s'appuie sur
  //     Developer ID + notarisation. `release.yml` REFUSE donc de publier le leg Windows tant
  //     que `WIN_CSC_LINK` est vide — l'installeur reste récupérable sur le run.
  //
  // L'exécution de code Python, elle, N'est PLUS indisponible ici : `winJail.ts` confine le
  // run dans un AppContainer (preuve positive + négative jouée en CI, `scripts/prove-jail.sh`),
  // donc le runtime embarqué ci-dessous sert vraiment.
  win: {
    // ⚠️ `extraFiles`, PAS `extraResources` : ces DLL doivent atterrir à côté de l'exécutable
    // de l'app. Windows cherche les dépendances d'un module natif dans le dossier de
    // l'EXÉCUTABLE — les y poser couvre donc d'un coup `@libsql` (base, chargée au démarrage)
    // et `onnxruntime-node` (NER local + embeddings), sans dépendre d'où chaque `.node` est
    // dégroupé. Sans elles, une machine sans « Visual C++ Redistributable » tue l'app au
    // lancement sur l'erreur 126. Provenance + arbitrage : `scripts/bake-vcruntime.ts`.
    extraFiles: [{ from: "build/win-vcruntime", to: ".", filter: ["*.dll"] }],
    extraResources: [
      { from: "build/python-runtime/win32-x64", to: "python-runtime" },
      // `<slug>-jail.exe` — le pendant Windows de `sandbox-exec` et de `bwrap`, sauf qu'aucun
      // des deux n'existe ici : il est CONSTRUIT depuis `native/win-jail/` par `bake:jail`.
      // Son absence ne dégrade rien en silence — `jailAvailability()` retombe sur "none" et
      // l'interpréteur refuse de tourner (`src/main/python/sandbox.ts`).
      { from: "build/win-jail", to: "win-jail" },
    ],
    // ⛔ PAS de `files:` ici non plus — la raison est écrite en entier sous `mac:`, et elle
    // vaut à l'identique : un `files` de plateforme ratisse tout `apps/desktop/`. Les
    // binaires darwin sont retirés de l'app Windows par `scripts/archPrune.cjs`.
    //
    // x64 seul — mais la raison a été MESURÉE, et elle n'est plus définitive.
    //
    // @libsql ne PUBLIE pas de `win32-arm64-msvc` (npm : `libsql@0.5.29` déclare neuf
    // paquets de plateforme, ARM sur macOS et Linux, rien pour Windows ; demande amont
    // ouverte depuis février 2025). Sans lui une app Windows arm64 ne peut pas ouvrir sa
    // base — d'où l'exclusion.
    //
    // ⚠️ Ce qui a changé : un spike CI (11/08/2026) a cross-compilé `libsql-js` en
    // `aarch64-pc-windows-msvc` — `cargo build --release` via Neon, cdylib de 12,2 Mo,
    // en-tête PE Machine=0xAA64 vérifié. TOUTES les autres dépendances natives ont déjà
    // leur binaire ARM64 (onnxruntime-node, CPython via un PBS récent, @napi-rs/canvas,
    // sharp, Electron, le lanceur de jail). L'ARM64 natif n'est donc plus fermé : il demande
    // de baker ce prebuilt comme on bake le lanceur (sha256-pinné, extraResources) et de
    // bumper `PBS_TAG` pour le CPython aarch64.
    //
    // Non fait, à dessein : ça compile, ça n'a pas TOURNÉ (aucun runner GitHub Windows
    // ARM64 n'existe, la vérification demande une vraie machine), et ce serait du code
    // amont compilé par nous sur la brique qui détient le coffre. En attendant, Windows 11
    // ARM exécute le x64 en émulation — la pénalité tombe sur le SIMD, donc sur le NER du
    // redaction, qui est sur le chemin de chaque envoi.
    //
    // (Ce tri-là aussi vit dans `archPrune.cjs`, plan `win32` : les prébuilts `win32-arm64`
    // sont installés par `supportedArchitectures` et n'ont rien à faire dans un .exe x64.)
    icon: "build/icon.png",
    // PAS de `zip` ici, contrairement à `mac`. La symétrie était fausse : sur mac
    // electron-updater applique le .zip (Squirrel.Mac ne sait pas ouvrir un .dmg), sur
    // Windows il applique l'INSTALLEUR NSIS (+ son .blockmap pour le différentiel). Un zip
    // Windows n'aurait donc été téléversé et conservé par personne.
    target: [{ target: "nsis", arch: ["x64"] }],
  },

  // Réglages NSIS explicites — les défauts d'electron-builder décident sinon en silence.
  nsis: {
    // Nom sans espace ET portant l'arch, comme le .dmg : le défaut est
    // `<productName> Setup <version>.exe`, dont l'espace se retrouve encodé dans la clé R2
    // et dans le manifeste, et dont l'absence d'arch fait classer l'installeur en x64 par
    // DÉFAUT côté Worker (`getDesktopInstallers.ts` lit l'arch dans le nom de fichier).
    artifactName: "${productName}-${version}-${arch}.${ext}",
    // Installation PAR UTILISATEUR, sans UAC (le choix de VS Code, Slack, Discord) : une
    // install par-machine demanderait l'élévation à CHAQUE mise à jour automatique, ce que
    // l'auto-updater ne sait pas faire sans interrompre l'utilisateur.
    oneClick: true,
    perMachine: false,
    allowToChangeInstallationDirectory: false,
    // Désinstaller ne détruit ni les conversations, ni le coffre, ni les clés : ce sont les
    // données de l'utilisateur, et une réinstallation doit les retrouver.
    deleteAppDataOnUninstall: false,
    shortcutName: brand.name,
  },

  // Update feed: the unified updates Worker (apps/updates), which serves a DYNAMIC
  // latest-mac.yml per channel (server-side rollout / canary / rollback). This
  // `publish.url` is baked into app-update.yml as a FALLBACK only — the app
  // overrides it at runtime via autoUpdater.setFeedURL (see src/main/updates.ts),
  // pointing at `<worker>/desktop/<channel>` and, when pinning, `/v/<version>`.
  // CI publishes the artifacts + registers the manifest via
  // apps/updates/scripts/publish-desktop.sh (see .github/workflows/release.yml).
  publish: {
    provider: "generic",
    // Fallback only (the app overrides via setFeedURL to its baked channel). Points
    // at the prod default; `channel: latest` is the electron-updater manifest
    // FILENAME prefix (latest-mac.yml), not the logical update channel.
    url: `https://updates.${brand.domain}/desktop/desktop-production`,
    channel: "latest",
  },
};
