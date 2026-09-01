import { resolve } from "path";
import { readFileSync } from "fs";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { workspaceSrcAlias } from "../../scripts/vitest/vitest.workspaceAlias";
import { brandIndexHtml } from "./scripts/brandIndexHtml";
import { mainDefines, rendererDefines } from "./scripts/buildDefines";
import { applyPublicServiceDefaults } from "./scripts/publicServices";

/**
 * DEV ONLY (`apply: "serve"`): resolve the workspace packages from their SOURCE.
 *
 * The app BUILD keeps consuming `dist/` — that is the packaging contract, and changing
 * what ships is not a dev-ergonomics decision. But in dev, reading `dist/` means every
 * edit inside `packages/*` needs a manual `pnpm --filter … build` before it is visible,
 * so HMR silently shows stale code and the loop is ~30 s instead of instant.
 *
 * The alias table is the SAME object the test runner uses
 * (`scripts/vitest/vitest.workspaceAlias.ts`) — one table, or dev and the tests would resolve
 * differently (rule 9). The third copy, `apps/desktop/tsconfig.json` `paths`, cannot
 * import a `.ts` module; it is held by `scripts/checks/check-alias-parity.mjs`.
 */
function workspaceSrcInDev() {
  return {
    name: "openmasq-workspace-src-in-dev",
    apply: "serve" as const,
    config: () => ({ resolve: { alias: workspaceSrcAlias } }),
  };
}

/**
 * What applies to the THREE shipped bundles (main, preload, renderer).
 *
 * A `.asar` is not encryption (it's a tar with an index): everything here
 * is readable at the user's. The bundle used to ship NOT minified, comments intact — yet this
 * app's comments describe the threat model and the guard that covers it,
 * i.e. the most useful document we could hand someone looking for a hole. Minification
 * doesn't "protect" anything (it's reversible), it simply stops SUPPLYING
 * the explanation along with the code.
 *
 * Sourcemaps in `"hidden"` mode: produced in `out/` WITHOUT a `sourceMappingURL` — the
 * shipped bundle never references its map. They exist for ONE recipient: `release.yml`'s
 * Sentry upload (stack symbolication; without them, every frame
 * `sentry/policy.ts` preserves resolves to `index.js:1:184232` and grouping breaks on
 * every release — audit 13/08). What guarantees they don't SHIP to
 * the user: `electron-builder.yml` excludes the `.map` files from the app's `out`
 * folder (pattern "!out/⋯.map", two stars — written this way here because the real
 * sequence would close THIS comment), and `scripts/checks/check-shipped-bundles.mjs` VERIFIES
 * this exclusion: a map in `out/` is an upload artifact; a map in the `.app`
 * would be delivering the explanation.
 */
const shipped = { minify: true as const, sourcemap: "hidden" as const };

/**
 * `VITE_BACKEND_BYPASS` is the Vercel automation-bypass secret, and a bundle is readable
 * at the user's: **any build carrying it publishes that secret**.
 *
 * Since the single artifact, NO channeled build (= a CI, candidate, or stable build) is
 * allowed to embed it: the same binary serves the candidates and the fleet, so "accepted
 * for staging" no longer exists — there is no longer a build that is staging-only. The
 * variable only survives for local DEV (`.env.development.local`, never packaged),
 * until staging's Vercel protection is removed in favor of per-account
 * authorization (see `infra/` + apps/desktop/CLAUDE.md).
 *
 * A guard, not a workflow ternary: it holds across ALL build paths (CI,
 * local release) and makes packaging FAIL instead of shipping the secret.
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
// The brand has only one home (rule 9): the branded defaults derive from it.
const BRAND = JSON.parse(readFileSync(resolve(__dirname, "../../packages/branding/branding.json"), "utf8")) as { name: string; domain: string };

// The public services a build reaches BY DEFAULT (sign-in, Slack relay, analytics relay,
// releases feed, Sentry) — filled BEFORE the defines below read `process.env`, in dev as in
// a build, never over a variable the CI or a fork set, even empty. Why these and no other:
// `scripts/publicServices.ts`.
applyPublicServiceDefaults(process.env, { brandDomain: BRAND.domain });

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
        // linkedom's OPTIONAL peer: guarded by a runtime try/catch, but
        // vite replaces a missing optional peer with a module that THROWS on load
        // (hoisted out of the try) — the build used to pass, the app died at boot. The alias resolves
        // to a stub that reproduces linkedom's fallback; `scripts/check-bundle.mjs`
        // (wired into `build`) forbids the return of this entire class of bug.
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
    // `scripts/checks/check-packaged-tree.mjs`) does exactly that against a built app.
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
    // Identifiers + channels baked at build time — NO default tied to an account (see scripts/buildDefines.ts).
    define: mainDefines(),
    build: {
      ...shipped,
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/main/index.ts"),
          // The in-process filesystem tool's utilityProcess worker → out/main/fsWorker.js
          // (LocalFsConnection forks it). Self-contained (node builtins + fs/grant only).
          fsWorker: resolve(__dirname, "src/main/fs/worker.ts"),
          // The EXTRACTION worker (pdf.js + OCR + parsers) → out/main/extractWorker.js
          // (ocr/extractClient.ts forks it) — extraction no longer blocks main's IPC.
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
      // ⛔ DO NOT enable `esbuild.keepNames` here. `browserStealth.ts` SERIALIZES
      // `applyStealthPatches` (`.toString()`) to evaluate it in the page's MAIN
      // WORLD — a different realm, where only the function's text arrives. `keepNames` makes
      // esbuild inject a helper call `__name(fn, "…")` INSIDE the body,
      // to restore `.name`; that helper is a MODULE binding. Serialized, the
      // body then references an identifier that doesn't exist in the page, and throws — inside
      // a `try/catch {}` that swallows it: the patches simply stop applying, without
      // a word. Measured by testing it (`c(u,"applyStealthPatches")` in the bundle), and it's
      // `preload/browserStealth.bundle.test.ts` that enforces the rule, on the BUILT bundle.
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
      // The CSP only allows the BUILD's Supabase project (env), no longer any committed one.
      brandIndexHtml(BRAND, process.env.OPENMASQ_SUPABASE_URL),
      devLocalhostCsp(),
    ],
  },
});
