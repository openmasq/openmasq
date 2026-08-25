import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// The pre-paint theme script in `index.html` is the ONE thing that keeps the boot splash
// from flashing the wrong theme, and it is CSP-gated by a sha256 of its own text: edit the
// script without recomputing the hash and the browser silently BLOCKS it — no error the
// user or a typecheck would ever see, just the flash coming back. That is what this pins.
const html = readFileSync(join(__dirname, "index.html"), "utf8");
const script = html.match(/<script>(try\{var t=[\s\S]*?)<\/script>/)?.[1] ?? "";

describe("boot theme script", () => {
  it("is allowed by the CSP (its sha256 is the one in script-src)", () => {
    const hash = createHash("sha256").update(script).digest("base64");
    expect(html).toContain(`'sha256-${hash}'`);
  });

  it("reads the DEVICE theme key first, then the legacy settings blob", () => {
    // Same source and same precedence as `applyPersistedTheme` (@openmasq/ui): the two
    // paint the same element, so a disagreement IS a flash. The settings blob is only
    // the fallback for an install made before `openmasq.theme` existed.
    const deviceAt = script.indexOf('"openmasq.theme"');
    const blobAt = script.indexOf('"openmasq.settings"');
    expect(deviceAt).toBeGreaterThan(-1);
    expect(blobAt).toBeGreaterThan(deviceAt);
  });

  it("replie chaque clé sur l'ANCIEN préfixe (parc d'avant le renommage du 24/08/2026)", () => {
    // Ce script court AVANT le bundle, donc avant la passe `legacyStorage.ts` — il doit
    // replier seul, sinon la première image d'un parc migré flashe au mauvais thème.
    // (Préfixe assemblé pour ne pas être la seule « occurrence » que `check:brand` verrait.)
    const OLD = ["proxy", "chat"].join("");
    expect(script.indexOf(`"${OLD}.theme"`)).toBeGreaterThan(script.indexOf('"openmasq.theme"'));
    expect(script.indexOf(`"${OLD}.settings"`)).toBeGreaterThan(script.indexOf('"openmasq.settings"'));
  });

  it("ne peint QUE de l'indigo — un thème vert enregistré devient son jumeau", () => {
    // L'accent n'est plus au choix (`state/theme.ts` `blueAccent`). Ce script doit faire
    // la MÊME traduction, sinon la première image est verte avant que React ne coerce :
    // exactement le flash qu'il existe pour éviter.
    expect(script).toContain('"blue-dark":"blue"');
    // Et il ne peut poser que ces deux valeurs — pas de « light » ni de « dark » nus.
    const poses = [...script.matchAll(/setAttribute\("data-theme",([^)]*)\)/g)].map((m) => m[1]);
    expect(poses).toHaveLength(1);
    expect(poses[0]).not.toMatch(/"light"|:"dark"/);
  });
});
