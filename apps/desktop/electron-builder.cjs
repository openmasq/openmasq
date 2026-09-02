// electron-builder config — in JS (CJS) rather than YAML, for ONE reason: the brand has
// only one home (`packages/branding/branding.json`, rule 9) and YAML cannot read
// it. Every product identifier (appId, productName, scheme, update-feed URL)
// is DERIVED below; the values produced are byte-for-byte identical to
// those shipped so far — the installed base demands it.
//
// ⚠️ This file is loaded by `scripts/eb.mjs` (`--config`), which remains the ONLY packaging
// entry point. `scripts/shippedTriples.ts` also `require()`s it: the list of shipped
// arches has only this one home.
const brand = require("../../packages/branding/branding.json");

module.exports = {
  appId: brand.desktopBundleId,
  productName: brand.name,
  copyright: `Copyright © 2025 ${brand.name}`,

  // The app's package.json no longer embeds the brand: `name` (NSIS folder + Electron's
  // Windows `userData` fallback — see the historical comment in `eb.mjs`),
  // `productName` (macOS CFBundleName ⇒ `userData`) and `author` are set HERE, so that
  // EVERY packaging path (`package`, `dist`, `release`, CI) has them.
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
  // ⛔ THIS LIST IS AN ALLOWLIST, AND ITS EFFECT DEPENDS ON THE SHAPE OF `mac.files` /
  // `win.files` — read the `mac.files` block BEFORE touching any of the three.
  //
  // What it guarantees: the app contains ONLY `out/` and `package.json` (node_modules
  // are filtered separately, by the dedicated matcher). Nothing from the working directory — no sources, no
  // tests, no tooling, no environment files.
  //
  // ⚠️ An allowlist that doesn't apply is NOT VISIBLE: green build, app that starts,
  // simply much bigger than its config says. Hence `afterPack.cjs`, which RE-READS
  // the produced asar and breaks the build on any entry outside this list
  // (`packageContents.cjs`): the config is an intention, the artifact is the proof.
  files: [
    "out/**",
    "package.json",
    // Sourcemaps are NEVER shipped: a `.map` embeds `sourcesContent`, i.e.
    // the original TypeScript, comments included — shipping it would undo the minification
    // `electron.vite.config.ts` just did. ⚠️ This line has actually been filtering something since
    // the maps started being produced in `hidden` mode for the Sentry upload: they exist in
    // `out/`, and without it our bundles' 26 `.map` files would go into the app.
    "!out/**/*.map",
    // electron-vite bundles every @openmasq/* workspace package into out/, so the
    // pnpm-symlinked copies in node_modules aren't needed at runtime. electron-builder
    // otherwise follows those symlinks and its asar packer errors on their files
    // ("… must be under apps/desktop/") because the symlink targets live outside the
    // app root (packages/*). Exclude the whole scope (+ any stray turbo logs).
    "!node_modules/@openmasq/**",
    // Our `CLAUDE.md` files describe the threat model and the guard that covers it — it's the
    // most useful document we could hand someone looking for a hole, and two were still
    // shipping via `node_modules` (`tesseract2.js`, our vendored OCR).
    "!**/CLAUDE.md",
    "!**/.turbo/**",
    // transformers.js (Node) caches the models DOWNLOADED DURING DEV in its
    // own package folder — 346 MB of unpinned Xenova/* re-uploads embedded as-is
    // in the app (838 MB zip instead of ~490: measured on 0.3.3-staging.106.2).
    // Never at runtime: the legitimate models arrive sha256-pinned via extraResources
    // (ner-models / embed-models). A dev machine is the only one with this cache, so
    // CI saw nothing — the exclusion protects both.
    "!**/@huggingface/transformers/.cache/**",
    // onnxruntime-node (the local-NER runtime, via @huggingface/transformers) ships
    // native binaries for EVERY platform (~210 MB total). Linux is never a target:
    // that's said here, once. What remains depends on the platform WE ARE BUILDING and so lives
    // in `mac.files` / `win.files` — a darwin binary in the Windows app (and
    // vice versa) isn't just weight, it's a whole platform shipped to
    // the other: measured at 137 MB in the first Windows attempt.
    // ⚠️ TWO names, and this isn't belt-and-suspenders: since `@openmasq/ort`, the
    // native engine is installed under the alias `ort-native` (`npm:onnxruntime-node@…`). Patterns that
    // only named `onnxruntime-node` therefore stopped matching WITHOUT breaking anything — 53 MB of
    // Linux and Windows binaries kept shipping in every mac .app, and in every update.
    // A package rename that silences an exclusion only shows up on the scale.
    "!**/onnxruntime-node/bin/napi-v6/linux/**",
    "!**/ort-native/bin/napi-v6/linux/**",
    "!**/@libsql/linux-*/**",
    // The SAME oversight, on the two other natives — and nobody had seen it because it
    // breaks nothing: `@napi-rs/canvas` and `sharp` publish their Linux prebuilts as platform
    // packages, which `supportedArchitectures` installs, and nothing excluded them. Measured in
    // the arm64 app of 0.5.0-staging.149: 110 MB of canvas (glibc+musl × x64+arm64) and 65 MB of
    // libvips. Code that can't run on a Mac, re-shipped on EVERY update.
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
    // ⚠️ The pattern above no longer matches what's actually shipped. pnpm hoists
    // `onnxruntime-web` to the ROOT of node_modules; it's that copy that ships, and the
    // path nested under `transformers` doesn't exist in the app. Measured result:
    // 74 MB of `.wasm` + 21 MB of sourcemaps embedded for nothing. Nothing loads them — the
    // Intel-fallback WASM engine lives under the ALIAS `ort-wasm` (a separate package, sorted by
    // arch in `scripts/archPrune.cjs`), which none of these patterns touch: excluding them here
    // would deprive an Intel Mac of its ONLY engine.
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
  // ⛔ THIS LIST IS WHAT GIVES THE ASAR INTEGRITY FUSE ITS MEANING. Everything that is
  // unbundled lives as bare, modifiable files, OUTSIDE the hash the fuse verifies — each
  // pattern added here therefore widens the surface a local process can rewrite inside
  // the signed app. Only what loads BY FILE PATH is unbundled, not through the
  // patched `require`: native binaries and their neighboring dylibs (dlopen does not read
  // the asar), the wasm and its `.mjs` workers, and the trees a `worker_threads` reaches
  // via `__dirname` (a Worker cannot start on an entry POINT INSIDE the asar — the reason
  // for each pattern is right beside it). ALL THE REST of the JS stays under the seal: an
  // express or an undici rewritten to disk no longer loads.
  //
  // The old state — the WHOLE `**/node_modules/**` — dated back to the RUN_AS_NODE children, which did not
  // read the asar. This fuse has been CUT since audit B1 and nothing spawns
  // that way anymore: @playwright/mcp launches in APP mode (asar-aware) and the fs/NER/embed/
  // extraction workers are `utilityProcess`es — which load from the asar (their `out/` entry
  // has always lived there). A future stdio server via `nodeSpawn.ts` would fall back into the
  // RUN_AS_NODE case: it would require unbundling ITS closure — see this file's comment.
  asarUnpack: [
    "**/*.node",
    // Natives + their neighboring dynamic libraries (dlopen by real path).
    "**/@libsql/**",
    "**/onnxruntime-node/**",
    "**/ort-native/**",
    "**/@napi-rs/**",
    "**/@img/**",
    // The ONNX WASM engine (Intel fallback): `.wasm` + `.mjs` workers loaded by path.
    "**/ort-wasm/**",
    // `@huggingface/transformers`: a lazily-`import()`ed asset tree, which resolves
    // its natives/wasm by path (electron.vite.config.ts keeps it external for the same
    // reason).
    "**/@huggingface/transformers/**",
    // The vendored OCR: its Worker (`worker_threads`) starts on `dist/worker/worker.js`
    // resolved via `__dirname`, and the worker `require()`s the WASM core beside it.
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
  // NOTE: mac ships TWO arches (see `mac.target`), so both runtimes must have been
  // baked (`BAKE_TARGET=darwin-x64 pnpm bake:runtime` in addition to the host bake) — `mac.extraResources`
  // below takes the one for the arch being built. A missing runtime shows up at build time.
  extraResources: [
    // ⚖️ The LICENSE and the NOTICE travel WITH the binary: the app redistributes code and
    // weights under Apache-2.0 (SheetJS/xlsx and tesseract2 in the bundles, tessdata_fast,
    // docTR and the NER weights in the resources), and §4(a)/(d) of the license require that
    // the recipient receive a copy. They are OUTSIDE the asar (`packageContents`'s allowlist
    // only admits out/ + node_modules + package.json), so readable in
    // `Contents/Resources/`.
    { from: "../../LICENSE", to: "LICENSE" },
    { from: "../../NOTICE", to: "NOTICE" },
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
    // The Python runtime is the ONLY extraResource per triple (the models are weights,
    // not binaries) — so it goes down into its platform's block.
    //
    // `${arch}` is expanded PER BUILT ARCH (electron-builder passes `files`, `from` and
    // `to` through its `macroExpander`), so a single line serves both: each .app receives
    // the runtime for ITS processor. A hardcoded path used to give the arm64 runtime to the x64 app —
    // invisible at build time, fatal at the user's first `import numpy`.
    extraResources: [{ from: "build/python-runtime/darwin-${arch}", to: "python-runtime" }],
    // ⛔⛔ NO `files:` HERE, NOR UNDER `win:` — AND THIS IS NOT NEGOTIABLE.
    //
    // A platform `files` becomes a SEPARATE matcher, which walks the app's folder on
    // its own account. Since it contains only negations, `AppFileWalker` prefixes it with
    // `**/*` (`addAllPatternIfNeed`) — so it rakes ALL of `apps/desktop/`, on top of
    // the root allowlist, which cannot subtract ANYTHING another matcher has already taken.
    // This is not a hypothesis: the app then ends up carrying the whole working
    // directory instead of just its build output, with nothing turning red — the build stays
    // green, the app starts, and the gap only shows up when opening the asar.
    //
    // ⚠️ The `- filter:` form does NOT SAVE YOU: it does put the root allowlist back on top, but
    // the second matcher keeps its `**/*`. Tested, measured, still leaking. The only safe form
    // is the ABSENCE of the key.
    //
    // So where did the other platform's prebuilts go (which `supportedArchitectures`
    // installs, and which would otherwise ship): into `scripts/archPrune.cjs`, with the
    // per-ARCH sort that already lived there for the same underlying reason — `afterPack` knows the
    // built platform AND arch, runs before signing, and deletes rather than filters.
    category: "public.app-category.productivity",
    target: [
      // ── BOTH ARCHES, FROM A SINGLE Apple Silicon runner ───────────────────────────
      //
      // What was blocking Intel wasn't the tooling but the ENGINE: `onnxruntime-node` no
      // longer publishes any macOS x86_64 binary, its `require` used to throw, `@huggingface/transformers`
      // failed entirely, the local NER wouldn't start — and the app, which fails closed for good reason,
      // refused EVERY send. `@openmasq/ort` lifts this by choosing the engine at runtime
      // (native if it exists, WASM otherwise), local and offline either way.
      //
      // The rest was already ready: the x64 Python runtime bakes from an Apple Silicon runner
      // (`bake-python-runtime.ts` cross mode — wheels resolved by tag then re-read byte by
      // byte), `extraResources` follows the arch (`darwin-${arch}`), both arches' prebuilts
      // are installed (`supportedArchitectures`), and electron-updater serves TWO arches from ONE
      // `latest-mac.yml` (`MacUpdater.filterFilesForArch`: arm64 preferred on arm64/Rosetta,
      // arm64 entries excluded on x64) — a single manifest line, no key collision.
      //
      // ⚠️ ONE runner, not two: `macos-latest` is arm64 and builds both (the install, the
      // turbo build and the bake are paid for ONCE; only packaging and notarization
      // double up). A second Intel leg would cost ~230 min-eq more per release on an image
      // (`macos-15-intel`) GitHub retires in August 2027.
      //
      // ⚠️ What these two lines do NOT ensure: that each .app contains the engine for ITS
      // processor. That's what `scripts/archPrune.cjs` sorts and VERIFIES — a .app without an engine
      // breaks the build instead of installing on someone's machine to refuse every send.
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

  // ⚠️ BUILT AND LAUNCHED IN CI, NOT PUBLISHABLE YET — and only ONE reason remains.
  //
  //  1. This block builds on a windows-latest runner, but no longer for the reason that was
  //     written here: the bake no longer REQUIRES the target interpreter (`bake-python-runtime.ts` cross
  //     mode — pip resolves by tag, and the resulting bytes are re-read). What still requires
  //     Windows is the REST of packaging: the NSIS installer, and the jail launcher
  //     (`<slug>-jail.exe`) which compiles under MSVC. `release.yml`'s matrix handles that.
  //  2. ⛔ Publishing to a channel requires Authenticode signing, and NOTHING else now.
  //     The mac manifest being overwritten by `latest.yml` is FIXED (migration 0007: the
  //     unique key carries the platform). What remains is that without a certificate,
  //     `NsisUpdater.verifySignature` verifies nothing at all (no `publisherName` in
  //     `app-update.yml`): the Windows update would have no integrity anchor besides TLS,
  //     whereas mac relies on Developer ID + notarization. `release.yml` therefore REFUSES
  //     to publish the Windows leg as long as `WIN_CSC_LINK` is empty — the installer stays retrievable on the run.
  //
  // Running Python code, on the other hand, is NO LONGER unavailable here: `winJail.ts` confines the
  // run inside an AppContainer (positive + negative proof run in CI, `scripts/prove-jail.sh`),
  // so the runtime bundled below actually serves a purpose.
  win: {
    // ⚠️ `extraFiles`, NOT `extraResources`: these DLLs must land right beside the app's
    // executable. Windows looks for a native module's dependencies in the
    // EXECUTABLE's folder — putting them there therefore covers, in one shot, `@libsql` (database, loaded at startup)
    // and `onnxruntime-node` (local NER + embeddings), regardless of where each `.node` is
    // unbundled. Without them, a machine without "Visual C++ Redistributable" kills the app at
    // launch on error 126. Origin + tradeoff: `scripts/bake-vcruntime.ts`.
    extraFiles: [{ from: "build/win-vcruntime", to: ".", filter: ["*.dll"] }],
    extraResources: [
      { from: "build/python-runtime/win32-x64", to: "python-runtime" },
      // `<slug>-jail.exe` — the Windows counterpart of `sandbox-exec` and `bwrap`, except that neither
      // of the two exists here: it is BUILT from `native/win-jail/` by `bake:jail`.
      // Its absence doesn't silently degrade anything — `jailAvailability()` falls back to "none" and
      // the interpreter refuses to run (`src/main/python/sandbox.ts`).
      { from: "build/win-jail", to: "win-jail" },
    ],
    // ⛔ NO `files:` here either — the reason is written in full under `mac:`, and it
    // holds identically: a platform `files` rakes all of `apps/desktop/`. The
    // darwin binaries are removed from the Windows app by `scripts/archPrune.cjs`.
    //
    // x64 only — but the reason has been MEASURED, and it's no longer final.
    //
    // @libsql does NOT publish a `win32-arm64-msvc` (npm: `libsql@0.5.29` declares nine
    // platform packages, ARM on macOS and Linux, nothing for Windows; upstream request
    // open since February 2025). Without it a Windows arm64 app cannot open its
    // database — hence the exclusion.
    //
    // ⚠️ What changed: a CI spike (11/08/2026) cross-compiled `libsql-js` to
    // `aarch64-pc-windows-msvc` — `cargo build --release` via Neon, a 12.2 MB cdylib,
    // PE header Machine=0xAA64 verified. ALL the other native dependencies already have
    // their ARM64 binary (onnxruntime-node, CPython via a recent PBS, @napi-rs/canvas,
    // sharp, Electron, the jail launcher). Native ARM64 is therefore no longer closed off: it requires
    // baking this prebuilt the way the launcher is baked (sha256-pinned, extraResources) and
    // bumping `PBS_TAG` for aarch64 CPython.
    //
    // Not done, on purpose: it compiles, it hasn't RUN (no GitHub Windows
    // ARM64 runner exists, verification requires a real machine), and it would be
    // upstream code we compiled ourselves onto the brick that holds the vault. In the meantime, Windows 11
    // ARM runs the x64 build under emulation — the penalty falls on SIMD, hence on the redaction's
    // NER, which is on the path of every send.
    //
    // (That sort also lives in `archPrune.cjs`, `win32` plan: the `win32-arm64` prebuilts
    // are installed by `supportedArchitectures` and have no business in an x64 .exe.)
    icon: "build/icon.png",
    // NO `zip` here, unlike `mac`. The symmetry was misleading: on mac
    // electron-updater applies the .zip (Squirrel.Mac cannot open a .dmg), on
    // Windows it applies the NSIS INSTALLER (+ its .blockmap for the diff). A Windows
    // zip would therefore have been uploaded and kept by nobody.
    target: [{ target: "nsis", arch: ["x64"] }],
  },

  // Explicit NSIS settings — electron-builder's defaults otherwise decide silently.
  nsis: {
    // A name with no space AND carrying the arch, like the .dmg: the default is
    // `<productName> Setup <version>.exe`, whose space ends up encoded in the R2 key
    // and in the manifest, and whose lack of an arch makes the Worker classify the installer as x64
    // by DEFAULT (`getDesktopInstallers.ts` reads the arch from the filename).
    artifactName: "${productName}-${version}-${arch}.${ext}",
    // PER-USER install, no UAC (the choice made by VS Code, Slack, Discord): a
    // per-machine install would require elevation on EVERY automatic update, which
    // the auto-updater cannot do without interrupting the user.
    oneClick: true,
    perMachine: false,
    allowToChangeInstallationDirectory: false,
    // Uninstalling destroys neither the conversations, nor the vault, nor the keys: these are the
    // user's data, and a reinstall must find them again.
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
    // at the stable default; `channel: latest` is the electron-updater manifest
    // FILENAME prefix (latest-mac.yml), not the logical update channel.
    url: `https://updates.${brand.domain}/desktop/desktop-stable`,
    channel: "latest",
  },
};
