import { describe, expect, it } from "vitest";
import { getMessages, LOCALES } from "@openmasq/i18n";
import { REDACT_TYPES } from "@openmasq/redact";
import { redactTypeLabel } from "./redactTypeLabel";

/**
 * LA PARITÉ ENTRE LE MOTEUR ET LE CATALOGUE.
 *
 * `REDACT_TYPES` vit dans `@openmasq/redact` (le `token` est la langue du moteur) et son
 * étiquette lue dans `@openmasq/i18n`. Aucun compilateur ne peut lier les deux : le
 * catalogue est une interface fermée, la liste du moteur un tableau de `string`. Le repli
 * sur le `label` français est donc SILENCIEUX — un type ajouté au moteur sans sa
 * traduction s'afficherait en français au milieu d'une interface anglaise, sans rien
 * casser. C'est ce test qui le refuse (règle 9 : un marqueur de synchro nomme son test).
 */
describe("redactTypeLabel — le moteur et le catalogue nomment les mêmes types", () => {
  it.each(LOCALES)("[%s] chaque type du moteur a son étiquette traduite", (locale) => {
    const t = getMessages(locale);
    for (const type of REDACT_TYPES) {
      expect(Object.keys(t.redactTypes), `type « ${type.key} » absent du catalogue`).toContain(
        type.key,
      );
      expect(redactTypeLabel(type, t).trim(), type.key).not.toBe("");
    }
  });

  it("le catalogue ne nomme pas un type que le moteur n'offre plus", () => {
    const engine = new Set(REDACT_TYPES.map((r) => r.key));
    for (const key of Object.keys(getMessages("fr").redactTypes)) {
      expect(engine.has(key), `« ${key} » traduit mais absent de REDACT_TYPES`).toBe(true);
    }
  });

  it("retombe sur l'étiquette du moteur pour une clé inconnue — jamais un vide", () => {
    // Le repli existe parce que l'extension, hors de ce dépôt, lit encore `label`.
    const orphan = { key: "inconnu", label: "Étiquette du moteur", token: "X" };
    expect(redactTypeLabel(orphan, getMessages("en"))).toBe("Étiquette du moteur");
  });
});
