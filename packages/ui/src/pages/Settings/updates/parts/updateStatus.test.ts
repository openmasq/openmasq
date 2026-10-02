import { getMessages } from "@openmasq/i18n";
import { describe, expect, it } from "vitest";
import { updateErrorText } from "./updateStatus";

const fr = getMessages("fr");
const en = getMessages("en");

describe("updateErrorText — la ligne d'échec suit le code, dans la langue de l'utilisateur", () => {
  it("une erreur 5xx du flux accuse le serveur, pas la connexion de l'utilisateur", () => {
    for (const code of ["download-500", "download-502", "download-503"]) {
      expect(updateErrorText({ code }, fr)).toBe(fr.versionsTab.status.errors.server);
      expect(updateErrorText({ code }, en)).toBe(en.versionsTab.status.errors.server);
    }
    expect(fr.versionsTab.status.errors.server).not.toMatch(/connexion/i);
    expect(en.versionsTab.status.errors.server).not.toMatch(/connection/i);
  });

  it("un 4xx ou un téléchargement sans statut reste un échec de téléchargement", () => {
    expect(updateErrorText({ code: "download-404" }, fr)).toBe(fr.versionsTab.status.errors.download);
    expect(updateErrorText({ code: "download" }, fr)).toBe(fr.versionsTab.status.errors.download);
  });

  it("le texte vient du catalogue, jamais du message français de main", () => {
    const message = "La mise à jour a échoué. Réessayez plus tard.";
    expect(updateErrorText({ code: "generic", message }, en)).toBe(en.versionsTab.status.errors.generic);
    expect(updateErrorText({ code: "no_space", message }, en)).toBe(en.versionsTab.status.errors.noSpace);
  });

  it("un code inconnu retombe sur le message de main, puis sur l'erreur inconnue", () => {
    expect(updateErrorText({ code: "shipit-x", message: "détail" }, fr)).toBe("détail");
    expect(updateErrorText({}, fr)).toBe(fr.versionsTab.status.unknownError);
  });
});
