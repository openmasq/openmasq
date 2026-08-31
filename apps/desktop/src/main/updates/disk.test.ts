import { describe, expect, it, vi } from "vitest";

// disk.ts imports `app` from electron for the free-space helpers; humanizeUpdateError
// itself is pure. Stub electron so the module loads under vitest.
vi.mock("electron", () => ({ app: { getPath: () => "/tmp" } }));

import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

import { humanizeUpdateError, totalUpdateSize, APPLY_SPACE_FACTOR } from "./disk";

describe("humanizeUpdateError — failure taxonomy (drives the PostHog code)", () => {
  const code = (msg: string): string => humanizeUpdateError(new Error(msg)).code;

  // Each class must map to its OWN stable code so PostHog groups them apart — a
  // corrupted release, a dead feed URL and a full disk are different investigations.
  it("classifies each failure class into a distinct code", () => {
    expect(code("ENOSPC: no space left on device")).toBe("no_space");
    expect(code("SQRLInstallerErrorDomain Code=-9 App Still Running")).toBe("app_running");
    expect(code("sha512 checksum mismatch, expected X got Y")).toBe("signature");
    expect(code("Cannot download update, HttpError: 404 Not Found")).toBe("download-404");
    expect(code("unable to download update")).toBe("download");
    expect(code("getaddrinfo ENOTFOUND updates.example.invalid")).toBe("network");
    expect(code("some unrecognised failure")).toBe("generic");
  });

  // Integrity is checked BEFORE download so a checksum error isn't mis-tagged as a
  // transport failure, and the HTTP status rides in the code for at-a-glance triage.
  it("keeps the HTTP status in a download code", () => {
    expect(code("HttpError: 503 status code")).toBe("download-503");
    expect(code("signature verification failed after download")).toBe("signature");
  });

  it("always returns a user-safe FR message (never a raw dump)", () => {
    const { message } = humanizeUpdateError(new Error("ditto: pkzip signature not found"));
    expect(message).not.toMatch(/ditto|pkzip/i);
    expect(message.length).toBeGreaterThan(0);
  });
});

describe("totalUpdateSize — ce que CETTE machine va télécharger", () => {
  // The manifest the feed serves since mac ships two arches: four entries, of which
  // only one will be downloaded. (Real sizes from 0.5.0-staging.149.)
  const info = {
    version: "0.5.0-staging.149",
    files: [
      { url: "Acme-0.5.0-staging.149-mac.zip", size: 741430719 },
      { url: "Acme-0.5.0-staging.149-arm64-mac.zip", size: 719430145 },
      { url: "Acme-0.5.0-staging.149-x64.dmg", size: 743080098 },
      { url: "Acme-0.5.0-staging.149-arm64.dmg", size: 722123456 },
    ],
  };

  // ⚠️ THE REGRESSION THAT BLOCKED AN UPDATE. By summing `files`, the pre-flight
  // announced 2.9 GB and required 6.4 GB of space; the machine was downloading 0.72 and
  // had 3.9 GB free. A fail-closed guard that's off by a factor of three no longer
  // prevents a failure: it prevents the update.
  it("pèse le seul fichier que cette machine téléchargera", () => {
    expect(totalUpdateSize(info, true)).toBe(719430145); // Apple Silicon → the arm64 zip
    expect(totalUpdateSize(info, false)).toBe(741430719); // Intel → the arch-less zip
    // And above all: never again the sum of the four.
    expect(totalUpdateSize(info, true)).toBeLessThan(1e9);
    expect(Math.ceil(totalUpdateSize(info, true) * APPLY_SPACE_FACTOR)).toBeLessThan(2.6e9);
  });

  it("ignore le .dmg — Squirrel.Mac applique le .zip", () => {
    const dmgOnly = { files: [{ url: "Acme-1.0.0-arm64.dmg", size: 900 }] };
    // No zip: we upper-bound with what's advertised rather than return 0 (a silent guard).
    expect(totalUpdateSize(dmgOnly, true)).toBe(900);
  });

  it("retombe sur l'Intel quand aucune entrée arm64 n'existe", () => {
    const x64Only = { files: [{ url: "Acme-1.0.0-mac.zip", size: 500 }] };
    expect(totalUpdateSize(x64Only, true)).toBe(500);
  });

  it("ne rend pas 0 sur un manifeste sans url exploitable", () => {
    expect(totalUpdateSize({ files: [{ size: 1234 }] }, true)).toBe(1234);
    expect(totalUpdateSize(undefined, true)).toBe(0);
  });

  // PARITY with the source of truth. Our selection copies electron-updater's rule
  // (`MacUpdater.filterFilesForArch`: « does the name contain arm64 »). Neither can
  // import the other without loading all of electron, so this test READS the installed module:
  // a version bump that changed the rule fails here, instead of making us weigh a
  // file the client won't download.
  it("garde la même définition d'arche qu'electron-updater", () => {
    const req = createRequire(import.meta.url);
    const src = readFileSync(req.resolve("electron-updater/out/MacUpdater.js"), "utf8");
    expect(src).toContain("filterFilesForArch");
    expect(src).toMatch(/includes\(["']arm64["']\)/);
  });
});

// A network timeout must not disguise itself as an unknown failure: macOS localises its
// errors, so a French Mac says « La requête a expiré. » — five reports under
// `updater-generic`, with « La mise à jour a échoué » shown instead of the one useful piece
// of advice. The code (`ETIMEDOUT`) and the localised wordings count as much as the text.
describe("humanizeUpdateError — un réseau qui lâche reste un réseau qui lâche", () => {
  it("reconnaît le timeout localisé de macOS", () => {
    const { code, message } = humanizeUpdateError(new Error("La requête a expiré."));
    expect(code).toBe("network");
    expect(message).toMatch(/réseau/i);
  });

  it("reconnaît le code même quand le message ne dit rien", () => {
    const err = Object.assign(new Error("Une erreur est survenue"), { code: "ETIMEDOUT" });
    expect(humanizeUpdateError(err).code).toBe("network");
  });

  it("ne requalifie pas un manque d'espace en problème réseau", () => {
    expect(humanizeUpdateError(new Error("ditto: No space left on device")).code).toBe("no_space");
  });

  // The case measured in prod (5 users, 27 times): the app is running from the .dmg. This
  // isn't a bug — the message must say to MOVE it, not to « retry », and
  // `index.ts` does NOT surface it as an exception (skipped on that code).
  it("classe le volume en lecture seule à part, avec la bonne action", () => {
    const real =
      "Cannot update while running on a read-only volume. The application is on a read-only volume. " +
      "Please move the application and try again.";
    const { code, message } = humanizeUpdateError(new Error(real));
    expect(code).toBe("read_only_volume");
    expect(message).toMatch(/Applications/);
    expect(message).not.toMatch(/[Rr]éessayez plus tard/); // especially NOT the generic advice
  });
});
