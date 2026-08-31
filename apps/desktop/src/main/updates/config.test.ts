import { describe, expect, it, vi } from "vitest";

// `config.ts` touches Electron and electron-updater at load time: this test only needs
// to READ the feed address, so both are reduced to the strict minimum.
vi.mock("electron", () => ({ app: { getPath: () => "/tmp", isPackaged: false } }));
vi.mock("electron-updater", () => ({ default: { autoUpdater: { setFeedURL: () => {} } } }));

import { UPDATES_CONFIGURED, UPDATES_URL } from "./config";

describe("le flux de mises à jour", () => {
  it("n'a AUCUN défaut committé — sans adresse fournie au build, il n'y a pas de flux", () => {
    // Updating from someone else's feed means replacing this binary with
    // theirs: a public repo cannot carry this address as a fallback (`config.ts`).
    // The test reads the variable rather than a URL written here — it holds both ways.
    expect(UPDATES_URL).toBe((process.env.VITE_UPDATES_URL || "").replace(/\/+$/, ""));
    expect(UPDATES_CONFIGURED).toBe(!!UPDATES_URL);
  });
});
