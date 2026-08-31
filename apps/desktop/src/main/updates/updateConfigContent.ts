/** The rebuilt YAML of `app-update.yml` — PURE (no Electron import), so it's
 *  testable and importable from both sides. Each VALUE has its home at the caller;
 *  the SHAPE reproduces the one electron-builder generates. ⚠️ Deliberate copy of
 *  `scripts/appUpdateYml.cjs` (a CJS build module can't be imported from the
 *  main bundle) — parity held by `appUpdateConfig.test.ts`, which reads BOTH. */
export function rebuiltUpdateConfigContent(url: string, channel: string, productName: string): string {
  return [
    "provider: generic",
    `url: ${url}`,
    `channel: ${channel}`,
    `updaterCacheDirName: ${productName.toLowerCase()}-updater`,
    "",
  ].join("\n");
}
