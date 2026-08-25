// Ce que l'app d'UNE arche macOS n'a rien à embarquer de l'AUTRE — et la preuve, au build,
// qu'il lui reste un moteur ONNX.
//
// ⛔ POURQUOI ICI ET PAS DANS `files` DE `electron-builder.cjs`. Les motifs y sont bien
// développés par arche (`FileMatcher.normalizePattern` passe CHAQUE motif au `macroExpander`,
// donc `${arch}` marche), mais il n'existe aucune macro « l'autre arche ». Le contournement
// naturel — exclure les deux, ré-inclure la sienne — est un PIÈGE : pour `node_modules`,
// `getNodeModuleFileMatcher` ne retient que les motifs NÉGATIFS (« grab only excludes », son
// commentaire), donc le motif de rattrapage est silencieusement jeté et l'app part sans AUCUN
// binaire natif. Morte au lancement, build vert.
//
// `afterPack`, lui, reçoit `context.arch` : il sait de quelle machine on parle. Et il tourne
// AVANT la signature (voir `afterPack.cjs`), donc supprimer ici n'invalide aucune signature.
//
// ⚠️ Ce fichier ne fait pas QUE alléger : il vérifie (règle 7, échec FERMÉ). Un .app dont le
// moteur ONNX manque ne redacted pas ; comme le chemin d'envoi échoue fermé, l'app n'enverrait
// RIEN. Ça ne doit pas se découvrir chez l'utilisateur, donc l'absence casse le BUILD.
"use strict";
const { existsSync, readdirSync, rmSync, statSync } = require("node:fs");
const path = require("node:path");

/** L'arche mac qu'on ne construit PAS. */
const OTHER = { arm64: "x64", x64: "arm64" };

/** La plateforme dont les prébuilts n'ont RIEN à faire dans l'app qu'on construit. */
const FOREIGN_PLATFORM = { darwin: "win32", win32: "darwin" };

/**
 * Les familles de prébuilts publiées en paquets « de plateforme », que
 * `supportedArchitectures` (package.json racine) installe TOUTES. Le suffixe varie
 * (`win32-x64-msvc`, `darwin-arm64`, …), donc on coupe par PRÉFIXE de nom.
 */
const PLATFORM_PACKAGES = [
  { parent: "@libsql", prefix: (p) => `${p}-` },
  { parent: "@napi-rs", prefix: (p) => `canvas-${p}-` },
  { parent: "@img", prefix: (p) => `sharp-${p}-` },
  { parent: "@img", prefix: (p) => `sharp-libvips-${p}-` },
];

/** Les deux noms sous lesquels le moteur ONNX natif range ses binaires, par plateforme. */
function engineBins(platform) {
  return [`ort-native/bin/napi-v6/${platform}`, `onnxruntime-node/bin/napi-v6/${platform}`];
}

/**
 * Ce qu'on retire, et ce qui doit rester, pour une plateforme + une arche données.
 *
 * ⚠️ Ce plan porte DEUX tris, et le second n'a rejoint le premier qu'après une fuite :
 *   • l'autre ARCHE (mac livre arm64 ET x64 depuis un seul runner) ;
 *   • l'autre PLATEFORME — ça vivait dans `mac.files`/`win.files` d'electron-builder, et
 *     ces clés-là expédiaient tout `apps/desktop/` dans l'app au passage (le bloc `mac:`
 *     d'`electron-builder.cjs` raconte le mécanisme). Supprimer ici fait le même travail
 *     sans toucher au matcher qui décide du contenu de l'app.
 *
 * Pur (aucun accès disque) pour être épinglé par `archPrune.test.ts` : c'est la table qui
 * décide, et une table fausse est exactement le genre de chose qu'un build ne dit pas.
 *
 * `drop[].rel` est un chemin RELATIF à `node_modules` ; avec `ext`, seuls les fichiers de
 * cette extension sont retirés (le dossier et son JS restent). `drop[].parent` + `prefix`
 * retire tout dossier de `parent` dont le nom commence par `prefix`.
 * `keep[].any` est une LISTE d'emplacements possibles — un seul suffit. Deux noms cohabitent :
 * `ort-native`/`ort-wasm` sont les alias de `@openmasq/ort` (le paquet qui choisit le moteur
 * à l'exécution), `onnxruntime-node` est le nom d'avant ce paquet.
 */
function prunePlan(platform, arch) {
  const foreign = FOREIGN_PLATFORM[platform];
  if (!foreign) throw new Error(`archPrune: plateforme inconnue : ${platform}`);

  // L'AUTRE PLATEFORME, d'abord — même liste des deux côtés, lue en miroir.
  const foreignPlatform = [
    ...PLATFORM_PACKAGES.map(({ parent, prefix }) => ({ parent, prefix: prefix(foreign) })),
    ...engineBins(foreign).map((rel) => ({ rel })),
  ];

  if (platform === "win32") return { drop: [...foreignPlatform, ...winArchDrop()], keep: winKeep() };
  const mac = macPlan(arch);
  return { drop: [...foreignPlatform, ...mac.drop], keep: mac.keep };
}

/**
 * Windows ne livre QUE x64 (`win.target`) : les prébuilts `win32-arm64` installés par
 * `supportedArchitectures` sont du code inexécutable, réexpédié à chaque mise à jour.
 */
function winArchDrop() {
  return [
    { parent: "@libsql", prefix: "win32-arm64-" },
    { parent: "@napi-rs", prefix: "canvas-win32-arm64-" },
    ...["ort-native", "onnxruntime-node"].map((n) => ({ rel: `${n}/bin/napi-v6/win32/arm64` })),
  ];
}

/** ÉCHEC FERMÉ côté Windows : sans ces deux-là, l'app s'installe et ne sert à rien. */
function winKeep() {
  return [
    {
      any: ["ort-native/bin/napi-v6/win32/x64", "onnxruntime-node/bin/napi-v6/win32/x64"],
      ext: ".node",
      why: "le binding natif ONNX — sans lui le NER local ne démarre pas, et l'app refuse tout envoi",
    },
    {
      any: ["@libsql/win32-x64-msvc"],
      ext: ".node",
      why: "la base locale (conversations, coffre) — son absence tue l'app au démarrage",
    },
  ];
}

/** Le plan mac : l'autre ARCHE, et le moteur qui doit rester. */
function macPlan(arch) {
  const other = OTHER[arch];
  if (!other) throw new Error(`archPrune: arche mac inconnue : ${arch}`);

  // Les prébuilts de l'autre arche. `supportedArchitectures` (package.json racine) les
  // installe TOUS les deux — c'est ce qui rend le build croisé possible, et c'est aussi ce
  // qui les ferait partir dans les deux .app si personne ne coupait.
  const drop = [
    { rel: `@libsql/darwin-${other}` },
    { rel: `@napi-rs/canvas-darwin-${other}` },
    { rel: `@img/sharp-darwin-${other}` },
    { rel: `@img/sharp-libvips-darwin-${other}` },
  ];

  if (arch === "arm64") {
    // Le WASM ne sert QUE là où aucun binding natif n'existe. Sur arm64 il y en a un, donc
    // ces ~125 Mo ne seraient jamais chargés — mais ils seraient téléchargés à CHAQUE mise
    // à jour. On ne retire que les binaires : le JS reste, donc un repli hypothétique
    // échouerait bruyamment au lieu de marcher à moitié.
    drop.push({ rel: "ort-wasm/dist", ext: ".wasm" });
  } else {
    // Il n'existe AUCUN binding natif `darwin/x64` (c'est toute la raison de `@openmasq/ort`).
    // Les octets présents sous `bin/` sont donc arm64 : inutilisables ici, et trompeurs.
    drop.push({ rel: "ort-native/bin" }, { rel: "onnxruntime-node/bin" });
  }

  const keep =
    arch === "arm64"
      ? [
          {
            any: ["ort-native/bin/napi-v6/darwin/arm64", "onnxruntime-node/bin/napi-v6/darwin/arm64"],
            ext: ".node",
            why: "le binding natif ONNX — sans lui le NER local ne démarre pas, et l'app refuse tout envoi",
          },
        ]
      : [
          {
            any: ["ort-wasm/dist"],
            ext: ".wasm",
            why: "le moteur WASM — seul moteur ONNX possible sur Intel (aucun binding natif darwin/x64 n'existe)",
          },
        ];
  keep.push({
    any: [`@libsql/darwin-${arch}`],
    ext: ".node",
    why: "la base locale (conversations, coffre) — son absence tue l'app au démarrage",
  });

  return { drop, keep };
}

/** Octets d'un fichier ou d'une arborescence (0 si absent). */
function sizeOf(target) {
  if (!existsSync(target)) return 0;
  const st = statSync(target);
  if (!st.isDirectory()) return st.size;
  let total = 0;
  for (const entry of readdirSync(target, { withFileTypes: true })) {
    total += sizeOf(path.join(target, entry.name));
  }
  return total;
}

/** Vrai si `dir` contient (récursivement) au moins un fichier d'extension `ext`. */
function hasFileWithExt(dir, ext) {
  if (!existsSync(dir)) return false;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const child = path.join(dir, entry.name);
    if (entry.isDirectory() ? hasFileWithExt(child, ext) : entry.name.endsWith(ext)) return true;
  }
  return false;
}

/** Applique le plan à un `node_modules` empaqueté. Retourne les octets libérés. */
function applyPlan(nodeModules, plan) {
  let freed = 0;
  for (const { rel, ext, parent, prefix } of plan.drop) {
    // Coupe par PRÉFIXE : les paquets de plateforme n'ont pas de nom fixe
    // (`win32-x64-msvc`, `darwin-arm64`, `sharp-libvips-win32-ia32`…).
    if (parent) {
      const dir = path.join(nodeModules, parent);
      if (!existsSync(dir)) continue;
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (!entry.isDirectory() || !entry.name.startsWith(prefix)) continue;
        const target = path.join(dir, entry.name);
        freed += sizeOf(target);
        rmSync(target, { recursive: true, force: true });
      }
      continue;
    }
    const target = path.join(nodeModules, rel);
    if (!existsSync(target)) continue;
    if (!ext) {
      freed += sizeOf(target);
      rmSync(target, { recursive: true, force: true });
      continue;
    }
    for (const entry of readdirSync(target, { withFileTypes: true })) {
      if (entry.isDirectory() || !entry.name.endsWith(ext)) continue;
      const file = path.join(target, entry.name);
      freed += sizeOf(file);
      rmSync(file, { force: true });
    }
  }
  return freed;
}

/** ÉCHEC FERMÉ : ce que la cible construite doit encore contenir, sinon le build s'arrête. */
function assertKept(nodeModules, plan, cible) {
  for (const { any, ext, why } of plan.keep) {
    if (any.some((rel) => hasFileWithExt(path.join(nodeModules, rel), ext))) continue;
    throw new Error(
      `archPrune: l'app ${cible} ne contient aucun ${ext} sous ${any.join(" | ")} — ${why}. ` +
        `Build interrompu : un .app sans ça s'installe et ne sert à rien.`,
    );
  }
}

/** Le `node_modules` de l'app empaquetée (dégroupé de l'asar par `asarUnpack`). */
function packagedNodeModules(appOutDir, productFilename, platform = "darwin") {
  const resources =
    platform === "darwin"
      ? path.join(appOutDir, `${productFilename}.app`, "Contents", "Resources")
      : path.join(appOutDir, "resources");
  for (const candidate of ["app.asar.unpacked", "app"]) {
    const dir = path.join(resources, candidate, "node_modules");
    if (existsSync(dir)) return dir;
  }
  throw new Error(
    `archPrune: aucun node_modules empaqueté sous ${resources}. La disposition a changé — ` +
      `ne PAS ignorer : c'est ainsi qu'un garde cesse de garder sans rien dire.`,
  );
}

/**
 * Le point d'entrée d'`afterPack` : retirer l'autre plateforme ET l'autre arche, puis
 * prouver que le moteur de la cible est toujours là.
 */
function pruneForeignArch({ appOutDir, arch, productFilename, platform = "darwin" }) {
  const plan = prunePlan(platform, arch);
  const nodeModules = packagedNodeModules(appOutDir, productFilename, platform);
  const freed = applyPlan(nodeModules, plan);
  assertKept(nodeModules, plan, `${platform}-${arch}`);
  return { freed, nodeModules };
}

module.exports = { prunePlan, applyPlan, assertKept, packagedNodeModules, pruneForeignArch };
