import { resolve } from "path";
import { readFileSync } from "fs";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { workspaceSrcAlias } from "../../scripts/vitest.workspaceAlias";
import { brandIndexHtml } from "./scripts/brandIndexHtml";
import { mainDefines, rendererDefines } from "./scripts/buildDefines";

/**
 * DEV ONLY (`apply: "serve"`): resolve the workspace packages from their SOURCE.
 *
 * The app BUILD keeps consuming `dist/` — that is the packaging contract, and changing
 * what ships is not a dev-ergonomics decision. But in dev, reading `dist/` means every
 * edit inside `packages/*` needs a manual `pnpm --filter … build` before it is visible,
 * so HMR silently shows stale code and the loop is ~30 s instead of instant.
 *
 * The alias table is the SAME object the test runner uses
 * (`scripts/vitest.workspaceAlias.ts`) — one table, or dev and the tests would resolve
 * differently (rule 9). The third copy, `apps/desktop/tsconfig.json` `paths`, cannot
 * import a `.ts` module; it is held by `scripts/check-alias-parity.mjs`.
 */
function workspaceSrcInDev() {
  return {
    name: "openmasq-workspace-src-in-dev",
    apply: "serve" as const,
    config: () => ({ resolve: { alias: workspaceSrcAlias } }),
  };
}

/**
 * Ce qui vaut pour les TROIS bundles expédiés (main, preload, renderer).
 *
 * Un `.asar` n'est pas du chiffrement (c'est un tar avec un index) : tout ce qui est ici
 * se lit chez l'utilisateur. Le bundle partait NON minifié, commentaires intacts — or les
 * commentaires de cette app décrivent le modèle de menace et la garde qui le couvre,
 * c'est-à-dire le document le plus utile qu'on puisse offrir à qui cherche un trou. La
 * minification ne « protège » rien (elle est réversible), elle cesse simplement de FOURNIR
 * l'explication avec le code.
 *
 * Sourcemaps en `"hidden"` : produites dans `out/` SANS `sourceMappingURL` — le bundle
 * livré ne réfère jamais sa map. Elles existent pour UN destinataire : l'upload Sentry de
 * `release.yml` (symbolication des stacks ; sans elles, chaque frame que
 * `sentry/policy.ts` préserve résout vers `index.js:1:184232` et le groupement casse à
 * chaque release — audit 13/08). Ce qui garantit qu'elles ne PARTENT pas chez
 * l'utilisateur : `electron-builder.yml` exclut les `.map` du dossier `out` de l'app
 * (motif « !out/⋯.map », deux étoiles — écrit ainsi ici parce que la séquence réelle
 * fermerait CE commentaire), et `scripts/check-shipped-bundles.mjs` VÉRIFIE cette
 * exclusion : une map dans `out/` est un artefact d'upload ; une map dans le `.app`
 * serait la livraison de l'explication.
 */
const shipped = { minify: true as const, sourcemap: "hidden" as const };

/**
 * `VITE_BACKEND_BYPASS` est le secret d'automation-bypass Vercel, et un bundle est lisible
 * chez l'utilisateur : **toute build qui le porte publie ce secret**.
 *
 * Depuis l'artefact unique, AUCUN build à canal (= un build de CI, candidat ou stable) n'a
 * le droit de l'embarquer : le même binaire sert les candidats et le parc, donc « accepté
 * pour staging » n'existe plus — il n'y a plus de build qui ne soit que de staging. La
 * variable ne survit que pour le DEV local (`.env.development.local`, jamais empaqueté),
 * le temps que la protection Vercel de staging soit retirée au profit d'une autorisation
 * par compte (voir `infra/` + apps/desktop/CLAUDE.md).
 *
 * Une garde, pas un ternaire de workflow : elle tient dans TOUS les chemins de build (CI,
 * release locale) et fait ÉCHOUER l'empaquetage au lieu d'expédier le secret.
 */
function assertNoBakedBypass() {
  const channel = process.env.VITE_UPDATES_CHANNEL ?? "";
  const bypass = process.env.VITE_BACKEND_BYPASS ?? "";
  if (bypass && channel) {
    throw new Error(
      `VITE_BACKEND_BYPASS est non vide sur un build de CI (VITE_UPDATES_CHANNEL="${channel}"). ` +
        "Depuis l'artefact unique, ce build sert TOUS les canaux : le secret Vercel serait " +
        "lisible dans chaque bundle expédié. Le bypass n'existe plus qu'en dev local.",
    );
  }
}
assertNoBakedBypass();

// The app version, baked into the renderer as import.meta.env.VITE_APP_VERSION so the
// analytics sink can stamp it on every event (a CI `VITE_APP_VERSION` override wins).
const pkgVersion = (JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf8")) as { version: string }).version;
// La marque n'a qu'une maison (règle 9) : les valeurs par défaut brandées en dérivent.
const BRAND = JSON.parse(readFileSync(resolve(__dirname, "../../packages/branding/branding.json"), "utf8")) as { name: string; domain: string };

// Dev-only: the renderer's static CSP (src/renderer/index.html) whitelists prod
// origins only. Under `electron-vite dev` (apply:"serve") we also allow localhost
// so the app can reach a locally-run backend (:3003) + redact-fn (:8080) — see
// apps/desktop/.env.development. Never runs on a build, so the packaged CSP is
// unchanged.
function devLocalhostCsp() {
  return {
    name: "dev-localhost-csp",
    apply: "serve" as const,
    transformIndexHtml(html: string) {
      return html.replace(
        "connect-src 'self'",
        "connect-src 'self' http://localhost:* http://127.0.0.1:*",
      );
    },
  };
}

export default defineConfig({
  main: {
    resolve: {
      alias: {
        // Le pair OPTIONNEL de linkedom : gardé par un try/catch à l'exécution, mais
        // vite remplace un pair optionnel absent par un module qui JETTE au chargement
        // (hissé hors du try) — le build passait, l'app mourait au boot. L'alias résout
        // vers un stub qui reproduit le repli de linkedom ; `scripts/check-bundle.mjs`
        // (branché sur `build`) interdit le retour de cette classe entière.
        canvas: resolve(__dirname, "src/main/net/canvasStub.ts"),
      },
    },
    // Workspace @openmasq/* packages are devDependencies, so they are bundled
    // into out/main (not shipped as node_modules). Real runtime deps like
    // electron-updater stay external and are packaged by electron-builder.
    //
    // `tesseract2.js` (the vendored, hardened OCR engine that replaced `tesseract.js`)
    // MUST stay external: its `worker_threads` Worker is spawned from a FILE path computed
    // via `__dirname` (→ `dist/worker/worker.js`). Bundled, `__dirname` is `out/main`, so
    // that path doesn't exist and the worker thread crashes. Kept external, it loads from
    // node_modules where the worker file is present. `tesseract.js-core` (its bundled WASM
    // core — the H6 fix: no CDN fetch of executable WASM) is likewise external: the worker
    // `require()`s the right SIMD variant at runtime from node_modules. (pdfjs/canvas bundle
    // fine — they don't spawn file workers.)
    //
    // `@huggingface/transformers` (offline local-NER inference for `src/main/
    // localNer.ts`) is likewise external: `@openmasq/redact/ner` only ever
    // `import()`s it lazily, and it ships its own onnxruntime-node native binary +
    // wasm assets that must load from node_modules (not be bundled). electron-builder
    // then packages it like the other native deps.
    //
    // ⚠️ EXTERNAL IS NOT FREE — the packaged node_modules is a FLATTENED tree, so a dep
    // that needs a NON-hoisted version of something is broken ONLY in the packaged app.
    // electron-builder collects node_modules by walking the pnpm workspace ROOT and keeps
    // ONE version per package NAME: a nested `node_modules/<pkg>/node_modules/<dep>` slot
    // gets the ROOT-hoisted version copied into it, whatever the declared range says. Dev
    // resolves the real tree and never sees it. `linkedom` is therefore a devDependency
    // (= BUNDLED by rollup, which resolves the real tree at build time): shipped external
    // it got `entities@4.5.0` under `htmlparser2@10` (needs ^7), and `require("entities/
    // decode")` threw ERR_PACKAGE_PATH_NOT_EXPORTED at module load — a boot crash before
    // any window, so the app was DEAD on launch. Its three siblings were mangled the same
    // way (`css-select`→domhandler/domutils, `linkedom`→html-escaper).
    // ⇒ A new runtime dep belongs in `dependencies` ONLY when it MUST load from disk (a
    // native binary, a file-path worker, a lazily-`import()`ed asset tree). Anything else
    // goes in devDependencies and gets bundled. If you must ship one external, check that
    // the flattened tree satisfies its whole closure — `pnpm check:pkgtree` (see
    // `scripts/check-packaged-tree.mjs`) does exactly that against a built app.
    plugins: [
      workspaceSrcInDev(),
      externalizeDepsPlugin({
        // `onnxruntime-node` + `@napi-rs/canvas` ship prebuilt native binaries and are
        // lazy-`import()`ed by the docTR OCR engine (`@openmasq/redact` `src/doctr`) — kept
        // external so electron-builder packages them from node_modules (not bundled).
        include: ["tesseract2.js", "tesseract.js-core", "@huggingface/transformers", "onnxruntime-node", "@napi-rs/canvas"],
      }),
    ],
    // The CJS main bundle has no import.meta, so bake the update feed base + the
    // env-bound update CHANNEL as literal process.env replacements at build time
    // (src/main/updates.ts reads them). Unset → "" → the code's own defaults win.
    // VITE_UPDATES_CHANNEL is what ties a build to its environment: a staging
    // build ships defaulting to `desktop-staging`, a prod build to `desktop-production`.
    // Identifiants + canaux bakés au build — AUCUN défaut lié à un compte (voir scripts/buildDefines.ts).
    define: mainDefines(),
    build: {
      ...shipped,
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/main/index.ts"),
          // The in-process filesystem tool's utilityProcess worker → out/main/fsWorker.js
          // (LocalFsConnection forks it). Self-contained (node builtins + fs/grant only).
          fsWorker: resolve(__dirname, "src/main/fs/worker.ts"),
          // Le worker d'EXTRACTION (pdf.js + OCR + parseurs) → out/main/extractWorker.js
          // (ocr/extractClient.ts le forke) — l'extraction ne bloque plus l'IPC de main.
          extractWorker: resolve(__dirname, "src/main/ocr/extractWorker.ts"),
          // The offline NER inference worker → out/main/nerWorker.js (localNer.ts forks it),
          // so a seconds-long BERT inference runs OFF the main event loop.
          nerWorker: resolve(__dirname, "src/main/ner/worker.ts"),
          // The on-device MÉMOIRE embedder → out/main/embedWorker.js (embed/client.ts
          // forks it) — same rationale as the NER worker.
          embedWorker: resolve(__dirname, "src/main/embed/worker.ts"),
        },
      },
    },
  },
  preload: {
    plugins: [workspaceSrcInDev(), externalizeDepsPlugin()],
    build: {
      ...shipped,
      // ⛔ NE PAS activer `esbuild.keepNames` ici. `browserStealth.ts` SÉRIALISE
      // `applyStealthPatches` (`.toString()`) pour l'évaluer dans le MONDE PRINCIPAL de la
      // page — un autre realm, où seul le texte de la fonction arrive. `keepNames` fait
      // injecter à esbuild un appel d'assistant `__name(fn, "…")` À L'INTÉRIEUR du corps,
      // pour restaurer `.name` ; cet assistant est une liaison de MODULE. Sérialisé, le
      // corps référence donc un identifiant qui n'existe pas dans la page, et jette — dans
      // un `try/catch {}` qui l'avale : les patches ne s'appliquent simplement plus, sans
      // un mot. Mesuré à l'essai (`c(u,"applyStealthPatches")` dans le bundle), et c'est
      // `preload/browserStealth.bundle.test.ts` qui tient la règle, sur le bundle CONSTRUIT.
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/preload/index.ts"),
          login: resolve(__dirname, "src/preload/login.ts"),
          browserStealth: resolve(__dirname, "src/preload/browserStealth.ts"),
        },
      },
    },
  },
  renderer: {
    root: resolve(__dirname, "src/renderer"),
    define: rendererDefines(pkgVersion),
    resolve: {
      alias: {
        "@renderer": resolve(__dirname, "src/renderer/src"),
      },
      // One React + one copy of each workspace package, so React context (e.g.
      // the UI's HostProvider) isn't split across duplicate module instances.
      dedupe: ["react", "react-dom"],
    },
    // Don't pre-bundle the linked workspace packages: serving them straight from
    // their build keeps a single module identity (and reliable HMR) instead of
    // vite sometimes loading both an optimized copy and a source copy.
    optimizeDeps: {
      exclude: [
        "@openmasq/ui",
        "@openmasq/llm",
        "@openmasq/redact",
      ],
    },
    build: {
      ...shipped,
      rollupOptions: {
        input: { index: resolve(__dirname, "src/renderer/index.html") },
      },
    },
    plugins: [
      workspaceSrcInDev(),
      react(),
      tailwindcss(),
      // La CSP n'autorise que le projet Supabase du BUILD (env), plus aucun committé.
      brandIndexHtml(BRAND, process.env.OPENMASQ_SUPABASE_URL),
      devLocalhostCsp(),
    ],
  },
});
