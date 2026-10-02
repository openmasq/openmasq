import { describe, expect, it } from "vitest";
import { pseudonymize } from "../../index";
import { detectAddresses } from "./index";

/** A street NAME (letters and spaces, up to 38 chars) ran on into the sentence after it when
 *  nothing punctuated it: the clause was vaulted with the address and never reached the model. */
describe("an address stops where the sentence or the next field begins", () => {
  const address = (t: string) => detectAddresses(t).find((d) => d.category === "ADDRESS")?.value;

  it.each([
    ["Il habite au 12 rue des Lilas depuis 2019 avec sa femme.", "12 rue des Lilas"],
    ["Rendez-vous 8 place du Marché demain matin", "8 place du Marché"],
    ["la Résidence 27 RUE DES ORMEAUX convoqués par le syndic", "27 RUE DES ORMEAUX"],
    ["42 Avenue Noemie Moulin Messagerie : contact@exemple.fr", "42 Avenue Noemie Moulin"],
    ["She moved to 14 Juniper Crescent since the spring.", "14 Juniper Crescent"],
  ])("%s", (text, expected) => {
    expect(address(text)).toBe(expected);
  });

  it("the sentence after the street reaches the model", async () => {
    const r = await pseudonymize("Il habite au 12 rue des Lilas depuis 2019 avec sa femme.", {
      vault: {},
      numbers: false,
    });
    expect(r.text).toContain("depuis 2019 avec sa femme.");
    expect(r.text).not.toContain("rue des Lilas");
  });

  it("leaves real street names whole", () => {
    expect(address("Siège : 3 passage des Panoramas – 75002 Senlis")).toBe(
      "3 passage des Panoramas – 75002 Senlis",
    );
    expect(address("Adresse : 18 rue de la verrerie, 38000 Grenoble")).toBe(
      "18 rue de la verrerie, 38000 Grenoble",
    );
    expect(address("au 5 rue Pierre et Marie Curie à Lyon")).toContain(
      "5 rue Pierre et Marie Curie",
    );
    expect(address("au 9 rue du Matin Calme, 75011 Paris")).toBe(
      "9 rue du Matin Calme, 75011 Paris",
    );
  });
});
