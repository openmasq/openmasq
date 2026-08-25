import { describe, expect, it } from "vitest";
import { MODELS } from "@openmasq/llm";
import { isNotoriousEntity } from "@openmasq/redact";

/**
 * PARITÉ registre de modèles ⇄ dispense de notoriété (le pendant de
 * `notorietyCatalogParity.test.ts` pour les connecteurs). Les deux paquets ne peuvent
 * pas s'importer (redact reste pur), donc c'est un TEST qui lit les deux : chaque
 * étiquette du catalogue doit partir EN CLAIR vers le modèle, à tous les niveaux —
 * redact « GPT-5.5 » rend l'app incapable de parler de ses propres modèles.
 * Un modèle ajouté demain qui ne passe pas la grammaire (`modelNames.ts`) échoue ICI,
 * pas dans une conversation d'utilisateur.
 */
describe("parité modèles ⇄ notoriété", () => {
  const std = { commercial: true, people: true };
  const strict = { commercial: false, people: false };

  it("chaque étiquette du registre est dispensée (company), Standard ET Strict", () => {
    const misses = MODELS.map((m) => m.label).filter(
      (label) => !isNotoriousEntity(label, "company", std) || !isNotoriousEntity(label, "company", strict),
    );
    expect(misses, `étiquettes redacted : ${misses.join(", ")}`).toEqual([]);
  });
});
