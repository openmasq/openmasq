// electron-builder config in JS rather than YAML so every product identifier (appId,
// productName, scheme, update-feed URL) DERIVES from the brand's one home (rule 9).
// Loaded by `scripts/eb.mjs` (`--config`), the ONLY packaging entry point, and
// `require()`d by `scripts/shippedTriples.ts` (the shipped arches have this one home).
const brand = require("../../packages/branding/branding.json");

/**
 * The integrity anchor of every Windows update: the name `NsisUpdater.verifySignature`
 * compares against the certificate that signed the installer. A PUBLIC fact — the string
 * Windows shows the user — so it is committed where a reviewer sees it.
 *
 * ⚠️ ONE STRING, and a PARTIAL DN. Both halves were paid for on 13/09/2026.
 *
 * An ARRAY is refused: the schema types `azureSignOptions.publisherName` as `string` and
 * the validator DOES check that subtree — "publisherName should be a string", build
 * stopped, nothing packaged. The note that used to sit here claimed the opposite; it had
 * only ever been exercised by the preflight, which passes no Azure credential and so never
 * builds that object at all.
 *
 * A partial DN is stronger than either alternative. `verifySignature` parses the configured
 * name and compares ONLY the keys it contains, so `CN=…, O=…` pins the organisation
 * strictly while surviving a reissue that changes L or C. Measured against the real subject
 * `CN=Numa Studio, O=Numa Studio, L=Paris, C=FR`: the full DN matches today but REJECTS
 * every update the day the city changes; the bare CN matches with a warning and pins
 * nothing but the name; this matches strictly, before and after.
 *
 * The subject comes from the IDENTITY VALIDATION (the validated organisation), never from
 * the Azure account name — that one reaches no certificate and no user-facing dialog.
 */
const WIN_PUBLISHER = "CN=Numa Studio, O=Numa Studio";

module.exports = {
  appId: brand.desktopBundleId,
  productName: brand.name,
  copyright: `Copyright © 2025 ${brand.name}`,

  // The app's package.json carries no brand: `name` (NSIS folder + Electron's Windows
  // `userData` fallback), `productName` (macOS CFBundleName ⇒ `userData`) and `author` are
  // set HERE so every packaging path has them.
  extraMetadata: {
    name: brand.slug,
    productName: brand.name,
    author: brand.name,
  },

  // Flips Electron Fuses BEFORE signing (RunAsNode off, --inspect and NODE_OPTIONS off,
  // cookie encryption, asar loading + integrity on). See scripts/afterPack.cjs.
  afterPack: "./scripts/afterPack.cjs",

  // NO `electronVersion` here, on purpose: a literal does not follow the devDependency and
  // nothing fails when it drifts. `scripts/eb.mjs` COMPUTES it from the resolved dependency
  // and passes it on the command line; it also refuses to run outside pnpm. ⚠️ No `--`
  // before its args: pnpm forwards `--` literally and electron-builder then ignores them.

  directories: {
    output: "release",
    buildResources: "build",
  },

  // Deep link: registers the app's URL scheme (branding `protocol`) so the sign-in link
  // redirects back into the app. Main also calls setAsDefaultProtocolClient at runtime (dev).
  protocols: [
    {
      name: brand.name,
      schemes: [brand.protocol],
    },
  ],

  // ⛔ THIS LIST IS AN ALLOWLIST: the app contains ONLY `out/` and `package.json`
  // (node_modules are filtered by the dedicated matcher). Its effect depends on the ABSENCE
  // of `mac.files` / `win.files` — read that block before touching any of the three.
  // An allowlist that stops applying is invisible (green build, bigger app), so
  // `afterPack.cjs` re-reads the produced asar and fails on any entry outside this list.
  files: [
    "out/**",
    "package.json",
    // Sourcemaps embed `sourcesContent` (the original TypeScript): never shipped.
    "!out/**/*.map",
    // Workspace packages are bundled into out/; the pnpm-symlinked copies point outside
    // the app root and break the asar packer.
    "!node_modules/@openmasq/**",
    // Agent guides describe the threat model and its guards: not for the artifact.
    "!**/CLAUDE.md",
    "!**/.turbo/**",
    // transformers.js caches dev-downloaded models in its own package folder. The
    // legitimate models arrive sha256-pinned via extraResources.
    "!**/@huggingface/transformers/.cache/**",
    // Native binaries for platforms we never target. What depends on the BUILT platform
    // lives in `scripts/archPrune.cjs`, not here. ⚠️ TWO names for the ONNX engine: the
    // native one is installed under the alias `ort-native` — a pattern naming only
    // `onnxruntime-node` silently stops matching.
    "!**/onnxruntime-node/bin/napi-v6/linux/**",
    "!**/ort-native/bin/napi-v6/linux/**",
    "!**/@libsql/linux-*/**",
    "!**/@napi-rs/canvas-linux-*/**",
    "!**/@img/sharp-linux*/**",
    "!**/@img/sharp-libvips-linux*/**",
    // onnxruntime-WEB is a dead dependency of transformers.js here (the local NER runs on
    // onnxruntime-NODE in main). The Intel-fallback WASM engine lives under the ALIAS
    // `ort-wasm`, which these patterns must never touch.
    "!**/@huggingface/transformers/node_modules/onnxruntime-web/dist/*.wasm",
    "!**/@huggingface/transformers/**/*.map",
    "!**/onnxruntime-web/dist/*.wasm",
    "!**/onnxruntime-web/**/*.map",
    // pdfjs-dist: main uses `legacy/`, the renderer's worker is Vite-bundled. Keep
    // `legacy/`, `cmaps/`, `standard_fonts/` (runtime loads for CJK / embedded fonts).
    "!**/pdfjs-dist/build/**",
    "!**/pdfjs-dist/web/**",
    "!**/pdfjs-dist/image_decoders/**",
    "!**/pdfjs-dist/types/**",
  ],

  // @libsql/client ships a prebuilt N-API binary: no Electron rebuild.
  npmRebuild: false,
  // ⛔ THIS LIST IS WHAT GIVES THE ASAR INTEGRITY FUSE ITS MEANING. Everything unbundled
  // lives as bare, modifiable files OUTSIDE the hash the fuse verifies. Only what loads BY
  // FILE PATH is unbundled (dlopen, wasm + `.mjs` workers, `worker_threads` entries reached
  // via `__dirname`); all the rest of the JS stays under the seal. A future stdio child
  // spawned as a bare Node would need ITS closure unbundled — a widening to weigh.
  asarUnpack: [
    "**/*.node",
    // Natives + their neighbouring dynamic libraries (dlopen by real path).
    "**/@libsql/**",
    "**/onnxruntime-node/**",
    "**/ort-native/**",
    "**/@napi-rs/**",
    "**/@img/**",
    // The ONNX WASM engine (Intel fallback): `.wasm` + `.mjs` workers loaded by path.
    "**/ort-wasm/**",
    // Lazily `import()`ed asset tree resolving natives/wasm by path (kept external in
    // electron.vite.config.ts for the same reason).
    "**/@huggingface/transformers/**",
    // The vendored OCR: a `worker_threads` Worker started via `__dirname`, which
    // `require()`s the WASM core beside it.
    "**/tesseract2.js/**",
    "**/tesseract.js-core/**",
  ],

  // Bundled Python runtime + local models, baked by `scripts/bake-*.ts` (`pnpm bake`;
  // `dist`/`release` run it). Shipped OUTSIDE the asar (native execs must be spawnable),
  // resolved at runtime via `process.resourcesPath`. No runtime network fetch; every
  // download is sha256-pinned at bake time. mac ships TWO arches, so both runtimes must be
  // baked; a missing one fails the build.
  extraResources: [
    // ⚖️ Apache-2.0 §4(a)/(d): the LICENSE and NOTICE travel with the redistributed code
    // and weights, readable in `Contents/Resources/`.
    { from: "../../LICENSE", to: "LICENSE" },
    { from: "../../NOTICE", to: "NOTICE" },
    { from: "build/ner-models", to: "ner-models" },
    { from: "build/embed-models", to: "embed-models" },
    // OCR traineddata, sha256-verified against the official tessdata_fast at bake time,
    // loaded offline (`src/main/ocrAssets.ts` → OPENMASQ_TESSERACT_LANG_PATH).
    { from: "build/tesseract-langs", to: "tesseract-langs" },
    // docTR models (Latin-script OCR), self-exported from the official weights, sha256-
    // verified at bake time, loaded offline (`src/main/ocrAssets.ts` → OPENMASQ_DOCTR_MODEL_PATH).
    { from: "build/doctr-models", to: "doctr-models" },
  ],

  mac: {
    // `${arch}` is expanded PER BUILT ARCH, so each .app receives the runtime for ITS
    // processor.
    extraResources: [{ from: "build/python-runtime/darwin-${arch}", to: "python-runtime" }],
    // ⛔⛔ NO `files:` HERE, NOR UNDER `win:`. A platform `files` becomes a SEPARATE matcher
    // that electron-builder prefixes with `**/*`, so it rakes ALL of `apps/desktop/` on top
    // of the root allowlist — green build, app that starts, whole working directory inside.
    // The `- filter:` form does not save you. Per-platform pruning lives in
    // `scripts/archPrune.cjs` (afterPack knows platform AND arch, and deletes).
    category: "public.app-category.productivity",
    target: [
      // Both arches from a single Apple Silicon runner: the x64 Python runtime bakes cross,
      // `extraResources` follows `${arch}`, and electron-updater serves two arches from one
      // `latest-mac.yml`. Whether each .app holds the engine for ITS processor is sorted and
      // VERIFIED by `scripts/archPrune.cjs`.
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
      // Electron's default Info.plist allows arbitrary cleartext loads. All first-party
      // traffic is HTTPS; only loopback (OAuth callback, dev API) uses plain HTTP.
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

  // Windows needs a Windows runner for the NSIS installer and the jail launcher
  // (`<slug>-jail.exe`, MSVC). Python runs confined in an AppContainer (`winJail.ts`,
  // proven by `scripts/prove-jail.sh`).
  win: {
    // Authenticode via Azure Trusted Signing, CONDITIONAL on the credentials: with
    // `azureSignOptions` set, electron-builder calls `Invoke-TrustedSigning` on EVERY build,
    // and a fork or a local build has no credential. Absent ⇒ unsigned package, which the
    // release pipeline refuses to publish.
    //
    // `publisherName` is a PUBLIC fact (the string Windows shows) and the integrity anchor
    // `NsisUpdater.verifySignature` compares against the certificate; the three others
    // identify our signing infrastructure and come from the environment (no committed
    // default a fork would inherit — `scripts/checks/check-brand.mjs` enforces it).
    // ⚠️ A `publisherName` mismatch does not fail a build: it makes every installed client
    // REJECT every future update. The value, and why it has the shape it has: `WIN_PUBLISHER`
    // at the top of this file.
    ...(process.env.AZURE_CLIENT_SECRET && process.env.AZURE_CODESIGN_ACCOUNT
      ? {
          azureSignOptions: {
            publisherName: WIN_PUBLISHER,
            endpoint: process.env.AZURE_CODESIGN_ENDPOINT,
            codeSigningAccountName: process.env.AZURE_CODESIGN_ACCOUNT,
            certificateProfileName: process.env.AZURE_CODESIGN_PROFILE,
          },
        }
      : {}),
    // `extraFiles`, NOT `extraResources`: Windows looks for a native module's dependencies
    // in the EXECUTABLE's folder, which covers `@libsql` and `onnxruntime-node` wherever
    // each `.node` is unbundled. Without them a machine lacking the VC++ Redistributable
    // dies at launch (error 126). Origin + tradeoff: `scripts/bake-vcruntime.ts`.
    extraFiles: [{ from: "build/win-vcruntime", to: ".", filter: ["*.dll"] }],
    extraResources: [
      { from: "build/python-runtime/win32-x64", to: "python-runtime" },
      // `<slug>-jail.exe`, built from `native/win-jail/` by `bake:jail`. Absent ⇒
      // `jailAvailability()` reports "none" and the interpreter refuses to run.
      { from: "build/win-jail", to: "win-jail" },
    ],
    // ⛔ NO `files:` here either (see `mac:`). Darwin binaries are removed by
    // `scripts/archPrune.cjs`.
    //
    // x64 only: @libsql publishes no `win32-arm64-msvc` prebuilt, and a self-compiled one
    // has not RUN on real hardware (no Windows ARM64 runner). Windows 11 ARM runs the x64
    // build under emulation; the penalty falls on SIMD, hence on the NER.
    icon: "build/icon.png",
    // NO `zip`, unlike `mac`: on Windows electron-updater applies the NSIS installer
    // (+ its .blockmap); a zip would be uploaded and used by nobody.
    target: [{ target: "nsis", arch: ["x64"] }],
  },

  // Explicit NSIS settings — electron-builder's defaults otherwise decide silently.
  nsis: {
    // No space, and the arch in the name, like the .dmg: the update feed reads the arch
    // from the filename.
    artifactName: "${productName}-${version}-${arch}.${ext}",
    // PER-USER install, no UAC: a per-machine install would require elevation on every
    // automatic update.
    oneClick: true,
    perMachine: false,
    allowToChangeInstallationDirectory: false,
    // Uninstalling destroys neither the conversations, nor the vault, nor the keys.
    deleteAppDataOnUninstall: false,
    shortcutName: brand.name,
  },

  // Update feed. This `publish.url` is baked into app-update.yml as a FALLBACK only: the
  // app overrides it at runtime via autoUpdater.setFeedURL (see src/main/updates), pointing
  // at `<feed>/desktop/<channel>` and, when pinning, `/v/<version>`.
  publish: {
    provider: "generic",
    // `channel: latest` is the electron-updater manifest FILENAME prefix (latest-mac.yml),
    // not the logical update channel.
    url: `https://updates.${brand.domain}/desktop/desktop-stable`,
    channel: "latest",
  },
};
