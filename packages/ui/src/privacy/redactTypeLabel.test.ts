import { describe, expect, it } from "vitest";
import { getMessages, LOCALES } from "@openmasq/i18n";
import { REDACT_TYPES } from "@openmasq/redact";
import { redactTypeLabel } from "./redactTypeLabel";

/**
 * PARITY BETWEEN THE ENGINE AND THE CATALOGUE.
 *
 * `REDACT_TYPES` lives in `@openmasq/redact` (the `token` is the engine's language) and its
 * label is read from `@openmasq/i18n`. No compiler can link the two: the
 * catalogue is a closed interface, the engine's list a `string` array. The fallback
 * to the French `label` is therefore SILENT — a type added to the engine with no
 * translation would display in French in the middle of an English interface, without
 * breaking anything. This test is what refuses that (rule 9: a sync marker names its test).
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
    // The fallback exists because the extension, outside this repo, still reads `label`.
    const orphan = { key: "inconnu", label: "Étiquette du moteur", token: "X" };
    expect(redactTypeLabel(orphan, getMessages("en"))).toBe("Étiquette du moteur");
  });
});
