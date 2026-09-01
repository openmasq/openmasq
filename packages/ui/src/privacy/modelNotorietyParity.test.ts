import { describe, expect, it } from "vitest";
import { MODELS } from "@openmasq/llm";
import { isNotoriousEntity } from "@openmasq/redact";

/**
 * PARITY model registry ⇄ notoriety exemption (the counterpart of
 * `notorietyCatalogParity.test.ts` for the connectors). The two packages cannot import
 * each other (redact stays pure), so a TEST reads both: every catalogue label has to
 * leave IN THE CLEAR toward the model, at every level — redacting « GPT-5.5 » makes the
 * app unable to talk about its own models.
 * A model added tomorrow that does not pass the grammar (`modelNames.ts`) fails HERE,
 * not in a user's conversation.
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
