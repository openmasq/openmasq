// Le CONTENU d'`app-update.yml` — la maison côté BUILD de cette forme.
//
// electron-builder n'écrit ce fichier que lorsqu'il fabrique une cible distribuable :
// un empaquetage `--dir` ne le produit pas, et `--prepackaged` reprend l'app telle
// quelle. Le pipeline mac scindé (`mac-release.ts`, qui notarise les deux arches en
// parallèle) enchaîne exactement ces deux étapes — la 0.6.0 est donc partie SANS le
// fichier, et electron-updater échoue en ENOENT à chaque vérification : plus aucune
// mise à jour automatique, sur la release dont la note annonçait justement qu'elle
// s'installe toute seule. `afterPack.cjs` l'écrit désormais lui-même, AVANT la
// signature (l'ajouter après invaliderait le sceau).
//
// La forme reproduit l'octet près ce qu'electron-builder génère (vérifié contre un
// build du chemin normal). `updaterCacheDirName` est le champ porteur : c'est lui que
// electron-updater lit même quand `setFeedURL` a remplacé l'URL.
//
// ⚠️ Une COPIE de cette forme vit côté exécution (`src/main/updates/appUpdateConfig.ts`,
// l'auto-réparation) : un module CJS de build ne s'importe pas depuis le bundle main.
// La parité des deux est tenue par `src/main/updates/appUpdateConfig.test.ts`, qui LIT
// les deux implémentations et compare leurs sorties.

/**
 * @param {unknown} publish La config `publish` d'electron-builder.cjs (objet ou liste).
 * @param {string} productFilename Le nom produit (branding `name`).
 * @returns {string} Le YAML complet, LF final compris.
 */
function appUpdateYmlContent(publish, productFilename) {
  const p = Array.isArray(publish) ? publish[0] : publish;
  if (!p || p.provider !== "generic" || typeof p.url !== "string" || !p.url) {
    // Pas de repli silencieux : un feed qu'on ne sait pas décrire est un feed qu'on
    // ne doit pas inventer — l'appelant échoue et l'empaquetage s'arrête.
    throw new Error("appUpdateYml: config publish inattendue (provider generic + url requis)");
  }
  const channel = typeof p.channel === "string" && p.channel ? p.channel : "latest";
  return [
    "provider: generic",
    `url: ${p.url}`,
    `channel: ${channel}`,
    `updaterCacheDirName: ${productFilename.toLowerCase()}-updater`,
    "",
  ].join("\n");
}

module.exports = { appUpdateYmlContent };
