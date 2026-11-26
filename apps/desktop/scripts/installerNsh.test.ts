import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * `build/installer.nsh` — a setup run BY HAND refuses to install over a NEWER version.
 *
 * NSIS is not run here (no makensis on the CI's Linux leg); the Windows release build
 * compiles it. What this pins is the CONTRACT the script relies on, the part a refactor or
 * a dependency bump would break silently:
 * - the config includes it (otherwise the guard simply does not exist);
 * - the WHOLE check sits behind `${isUpdated}`: an update, including a deliberate
 *   downgrade (`updates:pin`), is the updater's business and has its gate in main;
 * - electron-updater still launches the installer with `--updated` (if it ever stopped,
 *   the guard would block every in-app rollback);
 * - the refusal quits WITHOUT touching anything, and only when the installed version is
 *   the NEWER one.
 */
const appDir = join(__dirname, "..");
const nsh = readFileSync(join(appDir, "build/installer.nsh"), "utf8");
const code = nsh
  .split("\n")
  .filter((l) => !l.trim().startsWith(";"))
  .join("\n");

describe("build/installer.nsh", () => {
  it("est inclus par la config NSIS", () => {
    const config = require(join(appDir, "electron-builder.cjs"));
    const resolved = typeof config === "function" ? config() : config;
    expect(resolved.nsis.include).toBe("build/installer.nsh");
    expect(existsSync(join(appDir, resolved.nsis.include))).toBe(true);
  });

  it("toute la vérification est derrière ${isUpdated} : une mise à jour n'est jamais bloquée", () => {
    const body = code.slice(code.indexOf("!macro customInit"), code.indexOf("!macroend"));
    const lines = body.split("\n").map((l) => l.trim()).filter(Boolean);
    expect(lines[1]).toBe("${IfNot} ${isUpdated}");
    // the guard's ${IfNot} closes on the macro's LAST statement: nothing runs outside it
    expect(lines[lines.length - 1]).toBe("${EndIf}");
    const quit = body.indexOf("Quit");
    expect(quit).toBeGreaterThan(body.indexOf("${IfNot} ${isUpdated}"));
  });

  it("electron-updater lance toujours l'installeur avec --updated", () => {
    const src = readFileSync(require.resolve("electron-updater/out/NsisUpdater.js"), "utf8");
    expect(src).toMatch(/\[\s*"--updated"\s*\]/);
  });

  it("ne quitte que si la version installée est PLUS RÉCENTE, sans rien installer", () => {
    expect(code).toMatch(/ReadRegStr \$R0 SHELL_CONTEXT "\$\{UNINSTALL_REGISTRY_KEY\}" "DisplayVersion"/);
    // compared on x.y.z, suffix cut on both sides
    expect(code).toMatch(/\$\{WordFind\} "\$R0" "-" "\+1\{" \$R1/);
    expect(code).toMatch(/\$\{WordFind\} "\$\{VERSION\}" "-" "\+1\{" \$R2/);
    expect(code).toMatch(/\$\{VersionCompare\} "\$R1" "\$R2" \$R3/);
    const refuse = code.indexOf('${If} $R3 == "1"');
    expect(refuse).toBeGreaterThan(-1);
    expect(code.indexOf("Quit")).toBeGreaterThan(refuse);
    expect(code).toMatch(/SetErrorLevel 2\s+Quit/);
  });

  it("garde une porte de sortie explicite pour le support (--allow-downgrade)", () => {
    expect(code).toMatch(/\$\{StdUtils\.TestParameter\} \$R8 "allow-downgrade"/);
  });

  it("explique le refus en français et en anglais, sans bloquer une installation silencieuse", () => {
    const boxes = code.match(/MessageBox [^\n]+/g) ?? [];
    expect(boxes).toHaveLength(2);
    expect(boxes[0]).toContain("déjà installé");
    expect(boxes[1]).toContain("already installed");
    for (const b of boxes) expect(b).toMatch(/\/SD IDOK$/);
  });
});
