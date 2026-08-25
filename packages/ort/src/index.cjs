// Le moteur ONNX, avec le repli qui rend les Mac Intel utilisables. ⚠️ L'IMPLÉMENTATION est
// ici, et seulement ici : `index.mjs` n'en est qu'une façade ESM (règle 9 — une seule maison).
//
// POURQUOI CE PAQUET EXISTE : `onnxruntime-node` ne livre plus de binding natif pour
// `darwin/x64` — le fichier n'est pas dans le paquet. Son `require` JETTE au chargement, donc
// `import("@huggingface/transformers")` échoue EN ENTIER, donc le NER local ne démarre pas,
// donc l'app — qui échoue FERMÉ, à raison — refuse TOUT envoi. Sur un Mac Intel, l'app ne
// pouvait pas envoyer un seul message.
//
// Ce paquet prend la place de `onnxruntime-node` (override pnpm) et choisit À L'EXÉCUTION :
// le binding natif quand il existe, le WASM (`onnxruntime-web`) sinon. Mesuré sur un mac mini
// Intel 4 cœurs, mBERT q8 (178 Mo) : session en 1,8 s, passe avant de 48 jetons en ~320 ms
// mono-thread — très en deçà du budget de 45 s que le renderer laisse à une détection.
//
// ⚠️ Le repli reste LOCAL et HORS LIGNE : il ne change ni la posture vie privée, ni le
// fail-closed. Rien ne part sur le réseau, et les poids restent ceux que le worker a
// sha256-vérifiés avant de nous appeler.
"use strict";
const { readFileSync } = require("node:fs");
const { dirname } = require("node:path");
const { pathToFileURL } = require("node:url");
const os = require("node:os");

/**
 * Les deux seules différences à gommer entre le natif et le WASM — extrait pour être
 * TESTABLE sans binding natif ni WASM (`index.test.ts` injecte une fausse implémentation) :
 *
 *  • le natif accepte un CHEMIN de fichier, le WASM attend des octets. Une chaîne y serait
 *    comprise comme une URL à aller CHERCHER — exactement ce qu'on n'autorise pas ;
 *  • le fournisseur d'exécution s'appelle `cpu` côté natif, `wasm` ici.
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
 * Combien de fils d'exécution donner au WASM. Sans réglage explicite, onnxruntime-web
 * retombe à UN fil dès qu'un `self` sans `crossOriginIsolated` existe (le cas d'un
 * utilityProcess Electron) — c'est le mono-thread mesuré à ~320 ms la passe. Or ici on
 * n'est PAS dans un navigateur : `SharedArrayBuffer` est disponible sans COOP/COEP, et
 * ort-web honore toujours un réglage utilisateur (mesuré sur cette base : 593 → 237 ms
 * la passe de 128 jetons à 3 fils, sorties identiques). Un environnement qui ne
 * supporterait pas les threads ne CASSE rien : ort-web avertit et retombe à 1 tout seul.
 * Cœurs − 1 (le fil principal reste réactif), plafonné à 4 — au-delà, mesuré en recul.
 */
function nombreDeFils(coeurs, sharedArrayBuffer) {
  if (!sharedArrayBuffer) return 1;
  return Math.min(4, Math.max(1, coeurs - 1));
}

/** Le natif d'abord — chemin rapide, et le seul sur les plateformes qui en ont un. */
function charger() {
  try {
    return { impl: require("ort-native"), moteur: "native" };
  } catch {
    // Pas de binding pour ce couple plateforme/arch : le WASM, lui, n'en demande aucun.
    return { impl: require("ort-wasm"), moteur: "wasm" };
  }
}

const { impl, moteur } = charger();

if (moteur === "wasm") {
  // ⚠️ DEUX raisons, et les deux sont obligatoires.
  //
  // Sécurité (règle 7) : sans chemin explicite, onnxruntime-web va chercher son `.wasm` sur
  // un CDN. Du code exécutable téléchargé dans un process qui manipule de la PII en clair,
  // c'est de l'exécution de code arbitraire. On l'épingle sur les octets installés à côté de
  // nous, et jamais ailleurs.
  //
  // Correction (mesurée) : le process utilitaire d'Electron a rejeté le chargement avec
  // `ERR_UNSUPPORTED_ESM_URL_SCHEME` — ORT importait sa fabrique WASM par un CHEMIN, que
  // l'`import()` de Node refuse. Il faut une URL `file://`, d'où `pathToFileURL`.
  impl.env.wasm.wasmPaths = `${pathToFileURL(dirname(require.resolve("ort-wasm"))).href}/`;
  // Multi-thread (voir `nombreDeFils`). L'artefact `ort-wasm-simd-threaded.*` est déjà
  // celui que `wasmPaths` épingle — le nombre de fils ne change pas d'où vient le code.
  impl.env.wasm.numThreads = nombreDeFils(
    os.availableParallelism?.() ?? os.cpus().length,
    typeof SharedArrayBuffer !== "undefined",
  );
}

const InferenceSession = moteur === "native" ? impl.InferenceSession : envelopperWasm(impl);

module.exports = { ...impl, InferenceSession, OPENMASQ_ORT_BACKEND: moteur, envelopperWasm, nombreDeFils };
module.exports.default = module.exports;
