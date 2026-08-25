// electron-builder `afterPack` hook — flip Electron Fuses on the packaged binary.
//
// Runs AFTER packing but BEFORE electron-builder's code-signing step, so the flipped
// binary is what gets signed (flipping invalidates any prior signature — it must
// happen pre-sign). See electron-builder.cjs `afterPack`.
//
// RunAsNode is now DISABLED (audit B1). It used to be kept ON because three things ran
// via `ELECTRON_RUN_AS_NODE=1`, but each was migrated off it:
//   • Filesystem MCP server → in-process `utilityProcess` worker (fs/*), grant-gated;
//   • @playwright/mcp (agent browser) → spawned in Electron APP mode (playwrightMcpSpawn
//     drops the run-as-node flag), stdio transport unchanged;
//   • broker sidecar → `utilityProcess.fork` (broker.ts).
// No process is spawned run-as-node anymore, so the packaged binary can refuse
// `ELECTRON_RUN_AS_NODE` — closing the LOLBin / signed-identity-borrow vector.
// ⚠️ Footgun: `mcp/index.ts connectStdioServer` still has a dead nodeSpawn+run-as-node
// path for a hypothetical FUTURE stdio catalog server (none exist today). With the fuse
// off it would NOT work — a new stdio server must use app-mode or utilityProcess.
//
// Il fait AUSSI le tri par arche sur mac (`archPrune.cjs`) : c'est le seul endroit qui
// connaisse `context.arch`, et le seul moment où le tri est encore gratuit (avant signature).
const path = require("node:path");
const { existsSync, writeFileSync } = require("node:fs");
const { flipFuses, FuseVersion, FuseV1Options } = require("@electron/fuses");
const { Arch } = require("builder-util");
const { pruneForeignArch } = require("./archPrune.cjs");
const { appUpdateYmlContent } = require("./appUpdateYml.cjs");
const { assertPackagedContents } = require("./packageContents.cjs");
const { listPackage } = require("@electron/asar");

/** L'asar de l'app empaquetée, quelle que soit la plateforme. */
function asarPath(appOutDir, electronPlatformName, name) {
  return electronPlatformName === "darwin"
    ? path.join(appOutDir, `${name}.app`, "Contents", "Resources", "app.asar")
    : path.join(appOutDir, "resources", "app.asar");
}

exports.default = async function afterPack(context) {
  const { appOutDir, electronPlatformName, packager } = context;
  const name = packager.appInfo.productFilename; // branding `name`

  // ── L'app contient-elle ce qu'elle DIT contenir ? ────────────────────────────────────
  // Avant tout le reste : inutile de trier par arche, de poser les fusibles et de payer
  // 20 minutes de notarisation sur un artefact qui embarque `src/` et un `.env`. Un
  // `files` d'electron-builder est une intention ; l'asar est la preuve — pourquoi cette
  // distinction a coûté une fuite : `packageContents.cjs`.
  const asar = asarPath(appOutDir, electronPlatformName, name);
  if (existsSync(asar)) {
    assertPackagedContents(listPackage(asar));
    console.log(`[contenu] app.asar conforme à l'allowlist de electron-builder.cjs`);
  }

  // Chaque app ne porte que SES binaires natifs : ni ceux de l'autre plateforme (mac et
  // Windows installent les deux jeux, cf. `supportedArchitectures`), ni ceux de l'autre
  // arche (macOS livre arm64 ET x64 depuis un seul runner). Avant les fusibles : ce qu'on
  // supprime n'a pas à être signé.
  const arch = Arch[context.arch];
  if (electronPlatformName === "darwin" || electronPlatformName === "win32") {
    const { freed } = pruneForeignArch({
      appOutDir,
      arch,
      productFilename: name,
      platform: electronPlatformName,
    });
    const mo = (freed / 1e6).toFixed(0);
    console.log(`[arch] ${electronPlatformName}-${arch} — ${mo} Mo retirés (autre plateforme + autre arche), moteur ONNX vérifié`);
  }

  if (electronPlatformName === "darwin") {
    // `app-update.yml` : electron-builder ne l'écrit que pour une cible distribuable,
    // donc le pipeline mac scindé (`--dir` puis `--prepackaged`, mac-release.ts) livrait
    // des .app SANS lui — plus aucune mise à jour automatique (la 0.6.0). On l'écrit
    // ICI parce que c'est le dernier moment gratuit : après, l'app est signée et tout
    // ajout invalide le sceau. « Si absent » seulement — le chemin normal garde le sien.
    const updateYml = path.join(appOutDir, `${name}.app`, "Contents", "Resources", "app-update.yml");
    if (!existsSync(updateYml)) {
      writeFileSync(updateYml, appUpdateYmlContent(packager.config.publish, name));
      console.log(`[update-yml] app-update.yml écrit (absent de l'empaquetage --dir)`);
    }
  }

  const bin = {
    darwin: path.join(appOutDir, `${name}.app`, "Contents", "MacOS", name),
    win32: path.join(appOutDir, `${name}.exe`),
    linux: path.join(appOutDir, name.toLowerCase()),
  }[electronPlatformName];
  if (!bin) return;

  await flipFuses(bin, {
    version: FuseVersion.V1,
    // macOS: re-sign ad-hoc after the flip so the binary still launches even for an
    // unsigned local build; electron-builder's real Developer-ID signing (afterSign)
    // then re-signs over it for a distributable build.
    resetAdHocDarwinSignature: electronPlatformName === "darwin",

    // DISABLED (audit B1): no process is spawned run-as-node anymore (see note above),
    // so refuse ELECTRON_RUN_AS_NODE to close the signed-identity-borrow / LOLBin vector.
    [FuseV1Options.RunAsNode]: false,

    // Safe hardening — the app uses none of these; the RUN_AS_NODE children don't either.
    [FuseV1Options.EnableNodeOptionsEnvironmentVariable]: false, // no NODE_OPTIONS injection
    [FuseV1Options.EnableNodeCliInspectArguments]: false, // no --inspect on the packaged app
    [FuseV1Options.OnlyLoadAppFromAsar]: true, // only load the app entry from app.asar
    [FuseV1Options.EnableCookieEncryption]: true, // encrypt the cookie store at rest

    // asar integrity validation — macOS/Windows only (Linux has no support). electron-
    // builder injects the asar integrity hashes; a tampered asar then fails to load.
    ...(electronPlatformName !== "linux"
      ? { [FuseV1Options.EnableEmbeddedAsarIntegrityValidation]: true }
      : {}),
  });

  console.log(`[fuses] flipped on ${electronPlatformName} (RunAsNode DISABLED — see afterPack.cjs)`);
};
