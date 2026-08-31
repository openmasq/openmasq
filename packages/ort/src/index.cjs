// The ONNX engine, with the fallback that makes Intel Macs usable. ⚠️ The IMPLEMENTATION is
// here, and only here: `index.mjs` is just an ESM facade over it (rule 9 — one home only).
//
// WHY THIS PACKAGE EXISTS: `onnxruntime-node` no longer ships a native binding for
// `darwin/x64` — the file isn't in the package. Its `require` THROWS at load, so
// `import("@huggingface/transformers")` fails ENTIRELY, so the local NER doesn't start,
// so the app — which fails CLOSED, rightly — refuses ANY send. On an Intel Mac, the app
// couldn't send a single message.
//
// This package stands in for `onnxruntime-node` (pnpm override) and chooses AT RUNTIME:
// the native binding when it exists, WASM (`onnxruntime-web`) otherwise. Measured on a mac mini
// Intel 4-core, mBERT q8 (178 MB): session in 1.8 s, forward pass of 48 tokens in ~320 ms
// single-thread — well within the 45 s budget the renderer allows for a detection.
//
// ⚠️ The fallback stays LOCAL and OFFLINE: it changes neither the privacy posture nor the
// fail-closed behavior. Nothing goes over the network, and the weights remain the ones the
// worker sha256-verified before calling us.
"use strict";
const { readFileSync } = require("node:fs");
const { dirname } = require("node:path");
const { pathToFileURL } = require("node:url");
const os = require("node:os");

/**
 * The only two differences to smooth over between native and WASM — extracted to be
 * TESTABLE without a native binding or WASM (`index.test.ts` injects a fake implementation):
 *
 *  • native accepts a file PATH, WASM expects bytes. A string there would be
 *    understood as a URL to go FETCH — exactly what we don't allow;
 *  • the execution provider is called `cpu` on the native side, `wasm` here.
 */
function envelopperWasm(impl, lire = (p) => new Uint8Array(readFileSync(p))) {
  return Object.assign(Object.create(impl.InferenceSession), {
    create(source, options, ...reste) {
      const octets = typeof source === "string" ? lire(source) : source;
      const demandes = (options && options.executionProviders) || [];
      const fournisseurs = demandes.map((p) => (p === "cpu" || (p && p.name === "cpu") ? "wasm" : p));
      return impl.InferenceSession.create(
        octets,
        { ...options, executionProviders: fournisseurs.length ? fournisseurs : ["wasm"] },
        ...reste,
      );
    },
  });
}

/**
 * How many execution threads to give WASM. Without an explicit setting, onnxruntime-web
 * falls back to ONE thread as soon as a `self` without `crossOriginIsolated` exists (the
 * case for an Electron utilityProcess) — that's the single-thread case measured at ~320 ms
 * per pass. But here we are NOT in a browser: `SharedArrayBuffer` is available without
 * COOP/COEP, and ort-web always honors a user setting (measured on this basis: 593 → 237 ms
 * for a 128-token pass at 3 threads, identical outputs). An environment that doesn't
 * support threads doesn't BREAK anything: ort-web warns and falls back to 1 on its own.
 * Cores − 1 (the main thread stays responsive), capped at 4 — beyond that, measured as a regression.
 */
function nombreDeFils(coeurs, sharedArrayBuffer) {
  if (!sharedArrayBuffer) return 1;
  return Math.min(4, Math.max(1, coeurs - 1));
}

/** Native first — the fast path, and the only one on platforms that have it. */
function charger() {
  try {
    return { impl: require("ort-native"), moteur: "native" };
  } catch {
    // No binding for this platform/arch pair: WASM, on the other hand, needs none.
    return { impl: require("ort-wasm"), moteur: "wasm" };
  }
}

const { impl, moteur } = charger();

if (moteur === "wasm") {
  // ⚠️ TWO reasons, and both are mandatory.
  //
  // Security (rule 7): without an explicit path, onnxruntime-web goes looking for its
  // `.wasm` on a CDN. Executable code downloaded into a process that handles PII in the
  // clear is arbitrary code execution. We pin it to the bytes installed next to
  // us, and never elsewhere.
  //
  // Fix (measured): Electron's utility process rejected the load with
  // `ERR_UNSUPPORTED_ESM_URL_SCHEME` — ORT was importing its WASM factory by a PATH, which
  // Node's `import()` refuses. It needs a `file://` URL, hence `pathToFileURL`.
  impl.env.wasm.wasmPaths = `${pathToFileURL(dirname(require.resolve("ort-wasm"))).href}/`;
  // Multi-thread (see `nombreDeFils`). The `ort-wasm-simd-threaded.*` artifact is already
  // the one `wasmPaths` pins — the number of threads doesn't change where the code comes from.
  impl.env.wasm.numThreads = nombreDeFils(
    os.availableParallelism?.() ?? os.cpus().length,
    typeof SharedArrayBuffer !== "undefined",
  );
}

const InferenceSession = moteur === "native" ? impl.InferenceSession : envelopperWasm(impl);

module.exports = { ...impl, InferenceSession, OPENMASQ_ORT_BACKEND: moteur, envelopperWasm, nombreDeFils };
module.exports.default = module.exports;
