// The CONTENT of `app-update.yml` — the BUILD-side home of this shape.
//
// electron-builder only writes this file when it produces a distributable target:
// a `--dir` packaging doesn't produce it, and `--prepackaged` reuses the app as-is.
// The split mac pipeline (`mac-release.ts`, which notarizes both arches IN
// parallel) chains exactly these two steps — the 0.6.0 therefore shipped WITHOUT the
// file, and electron-updater fails with ENOENT on every check: no more automatic
// update, on the very release whose note announced that it installs itself. `afterPack.cjs`
// now writes it itself, BEFORE
// signing (adding it afterward would invalidate the seal).
//
// The shape reproduces byte-for-byte what electron-builder generates (verified against a
// build of the normal path). `updaterCacheDirName` is the load-bearing field: it's the one
// electron-updater reads even when `setFeedURL` has replaced the URL.
//
// ⚠️ A COPY of this shape lives on the runtime side (`src/main/updates/appUpdateConfig.ts`,
// the auto-repair): a build-side CJS module can't be imported from the main bundle.
// Parity between the two is held by `src/main/updates/appUpdateConfig.test.ts`, which READS
// both implementations and compares their outputs.

/**
 * @param {unknown} publish The `publish` config from electron-builder.cjs (object or list).
 * @param {string} productFilename The product name (branding `name`).
 * @returns {string} The complete YAML, trailing LF included.
 */
function appUpdateYmlContent(publish, productFilename) {
  const p = Array.isArray(publish) ? publish[0] : publish;
  if (!p || p.provider !== "generic" || typeof p.url !== "string" || !p.url) {
    // No silent fallback: a feed we can't describe is a feed we must not
    // invent — the caller fails and packaging stops.
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
