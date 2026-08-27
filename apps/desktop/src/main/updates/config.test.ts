import { describe, expect, it, vi } from "vitest";

// `config.ts` touche Electron et electron-updater au chargement : ce test n'a besoin
// que de la LECTURE de l'adresse du flux, donc les deux sont réduits au strict minimum.
vi.mock("electron", () => ({ app: { getPath: () => "/tmp", isPackaged: false } }));
vi.mock("electron-updater", () => ({ default: { autoUpdater: { setFeedURL: () => {} } } }));

import { UPDATES_CONFIGURED, UPDATES_URL } from "./config";

describe("le flux de mises à jour", () => {
  it("n'a AUCUN défaut committé — sans adresse fournie au build, il n'y a pas de flux", () => {
    // Se mettre à jour depuis le flux d'un autre, c'est remplacer ce binaire par le
    // sien : un dépôt public ne peut pas porter cette adresse en repli (`config.ts`).
    // Le test lit la variable plutôt qu'une URL écrite ici — il vaut dans les deux sens.
    expect(UPDATES_URL).toBe((process.env.VITE_UPDATES_URL || "").replace(/\/+$/, ""));
    expect(UPDATES_CONFIGURED).toBe(!!UPDATES_URL);
  });
});
