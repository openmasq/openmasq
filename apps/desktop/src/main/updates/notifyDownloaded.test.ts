import { describe, expect, it, vi } from "vitest";

vi.mock("electron", () => ({ Notification: class {} }));

import { shouldNotifyDownloaded } from "./notifyDownloaded";

describe("shouldNotifyDownloaded", () => {
  it("fenêtre pas au premier plan : la version prête s'annonce par le système", () => {
    expect(shouldNotifyDownloaded("1.2.0", false, new Set())).toBe(true);
  });

  it("fenêtre au premier plan : l'annonce de l'app suffit, pas de doublon", () => {
    expect(shouldNotifyDownloaded("1.2.0", true, new Set())).toBe(false);
  });

  it("une seule bannière par version — l'updater re-signale à chaque vérification", () => {
    expect(shouldNotifyDownloaded("1.2.0", false, new Set(["1.2.0"]))).toBe(false);
    expect(shouldNotifyDownloaded("1.3.0", false, new Set(["1.2.0"]))).toBe(true);
  });

  it("sans numéro de version : rien à annoncer", () => {
    expect(shouldNotifyDownloaded(undefined, false, new Set())).toBe(false);
  });
});
