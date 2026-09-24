import { resolve } from "path";
import { readFileSync } from "fs";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { workspaceSrcAlias } from "../../scripts/vitest/vitest.workspaceAlias";
import { brandIndexHtml } from "./scripts/brandIndexHtml";
import { mainDefines, rendererDefines } from "./scripts/buildDefines";
import { applyDevEnvFiles, isDevCommand } from "./scripts/devEnv";
import { applyPublicServiceDefaults } from "./scripts/publicServices";

/**
 * DEV ONLY (`apply: "serve"`): resolve the workspace packages from their SOURCE, so an
 * edit in `packages/*` reaches HMR without a rebuild. The BUILD keeps consuming `dist/`
 * (the packaging contract). The alias table is the SAME object the test runner uses
 * (rule 9); the tsconfig `paths` copy is held by `scripts/checks/check-alias-parity.mjs`.
 */
function workspaceSrcInDev() {
  return {
    name: "openmasq-workspace-src-in-dev",
    apply: "serve" as const,
    config: () => ({ resolve: { alias: workspaceSrcAlias } }),
  };
}

/**
 * The THREE shipped bundles. A `.asar` is readable at the user's, and this app's comments
 * describe the threat model and its guards: minification doesn't protect anything, it
 * stops SUPPLYING the explanation with the code. Sourcemaps are `"hidden"` (no
 * `sourceMappingURL`), exist only for the crash-report symbolication upload, and are
 * excluded from the app by `electron-builder.cjs`; `scripts/checks/check-shipped-bundles.mjs`
 * verifies that exclusion.
 */
const shipped = { minify: true as const, sourcemap: "hidden" as const };

/**
 * `VITE_BACKEND_BYPASS` is a deployment-protection secret, and a bundle is readable at the
 * user's: **any build carrying it publishes it**. The same binary serves every channel, so
 * NO channeled build may embed it; it survives for local DEV only (`.env.development.local`).
 * A guard rather than a workflow ternary: it holds across ALL build paths.
 */
function assertNoBakedBypass() {
  const channel = process.env.VITE_UPDATES_CHANNEL ?? "";
  const bypass = process.env.VITE_BACKEND_BYPASS ?? "";
  if (bypass && channel) {
    throw new Error(
      `VITE_BACKEND_BYPASS est non vide sur un build de CI (VITE_UPDATES_CHANNEL="${channel}"). ` +
        "Depuis l'artefact unique, ce build sert TOUS les canaux : le secret serait " +
        "lisible dans chaque bundle expédié. Le bypass n'existe plus qu'en dev local.",
    );
  }
}
assertNoBakedBypass();

// Baked as import.meta.env.VITE_APP_VERSION (a CI override wins).
const pkgVersion = (JSON.parse(readFileSync(resolve(__dirname, "package.json"), "utf8")) as { version: string }).version;
// The brand has only one home (rule 9): the branded defaults derive from it.
const BRAND = JSON.parse(readFileSync(resolve(__dirname, "../../packages/branding/branding.json"), "utf8")) as { name: string; domain: string };

// Dev only: `.env.development(.local)` must reach the defines below, which read the
// BUILDER's `process.env` (Vite's own loading stops at `import.meta.env`). Never under
// `build`/`preview`. Shell > `.local` > `.env.development` > the defaults.
if (isDevCommand(process.argv)) {
  applyDevEnvFiles(process.env, [
    resolve(__dirname, ".env.development.local"),
    resolve(__dirname, ".env.development"),
  ]);
}

// The public services a build reaches BY DEFAULT, filled BEFORE the defines read
// `process.env`, never over a variable CI or a fork set. Why these: `scripts/publicServices.ts`.
applyPublicServiceDefaults(process.env, { brandDomain: BRAND.domain });

// Dev-only: the static CSP (src/renderer/index.html) allows prod origins only; under
// `electron-vite dev` also allow localhost for a locally-run API. Never on a build.
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
        // linkedom's OPTIONAL peer: vite replaces a missing optional peer with a module
        // that THROWS on load, hoisted out of linkedom's try/catch. The stub reproduces
        // its fallback; `scripts/check-bundle.mjs` guards the class of bug.
        canvas: resolve(__dirname, "src/main/net/canvasStub.ts"),
      },
    },
    // Workspace packages are devDependencies, hence BUNDLED into out/main; real runtime
    // deps stay external and are packaged from node_modules.
    //
    // What MUST stay external: anything that loads FROM DISK BY PATH. `tesseract2.js`
    // spawns its `worker_threads` Worker via `__dirname` (bundled, that path doesn't
    // exist); `tesseract.js-core` is the WASM the worker `require()`s at runtime;
    // `@huggingface/transformers` is lazily `import()`ed and ships its own native + wasm.
    //
    // ⚠️ EXTERNAL IS NOT FREE: the packaged node_modules is a FLATTENED tree (ONE version
    // per package NAME, the root-hoisted one), so a dep needing a NON-hoisted version of
    // something is broken ONLY in the packaged app, as a boot crash dev never sees.
    // ⇒ A new runtime dep goes in `dependencies` ONLY when it must load from disk; anything
    // else is a devDependency and gets bundled. `pnpm check:pkgtree` verifies the flattened
    // tree satisfies every external's closure against a built app.
    plugins: [
      workspaceSrcInDev(),
      externalizeDepsPlugin({
        // `onnxruntime-node` + `@napi-rs/canvas`: prebuilt natives, lazily `import()`ed
        // by the docTR OCR engine.
        include: ["tesseract2.js", "tesseract.js-core", "@huggingface/transformers", "onnxruntime-node", "@napi-rs/canvas"],
      }),
    ],
    // The CJS main bundle has no import.meta: the update feed + channel are baked as
    // literal process.env replacements. NO default tied to an account (scripts/buildDefines.ts).
    define: mainDefines(),
    build: {
      ...shipped,
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/main/index.ts"),
          // utilityProcess workers, each forked by its client so heavy work runs OFF
          // main's event loop: filesystem tool, extraction (pdf.js + OCR), NER, embedder.
          fsWorker: resolve(__dirname, "src/main/fs/worker.ts"),
          extractWorker: resolve(__dirname, "src/main/ocr/extractWorker.ts"),
          nerWorker: resolve(__dirname, "src/main/ner/worker.ts"),
          embedWorker: resolve(__dirname, "src/main/embed/worker.ts"),
        },
      },
    },
  },
  preload: {
    plugins: [workspaceSrcInDev(), externalizeDepsPlugin()],
    build: {
      ...shipped,
      // ⛔ DO NOT enable `esbuild.keepNames`: `browserStealth.ts` SERIALIZES a function
      // (`.toString()`) into the page's main world, and `keepNames` injects a module-bound
      // `__name(…)` helper into its body that doesn't exist there — the patches silently
      // stop applying. Enforced on the BUILT bundle by `preload/browserStealth.bundle.test.ts`.
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
      // One React, so context isn't split across duplicate module instances.
      dedupe: ["react", "react-dom"],
    },
    // Don't pre-bundle the workspace packages: one module identity, reliable HMR.
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
      // The CSP only allows the BUILD's auth origin (env), never a committed one.
      brandIndexHtml(BRAND, process.env.OPENMASQ_SUPABASE_URL),
      devLocalhostCsp(),
    ],
  },
});
