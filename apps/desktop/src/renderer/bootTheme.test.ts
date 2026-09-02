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

  it("lit « blue-dark », le nom d'une version antérieure, comme le fond sombre", () => {
    // Same tolerance as `state/settings/theme.ts` `readTheme`: an install that saved the
    // dark ground under its old name must not flash light before React reads the key.
    expect(script).toContain('t==="dark"||t==="blue-dark"');
    // And the only value it can stamp is "dark" — light is the bare :root, no attribute.
    const poses = [...script.matchAll(/setAttribute\("data-theme",([^)]*)\)/g)].map((m) => m[1]);
    expect(poses).toEqual(['"dark"']);
  });
});
