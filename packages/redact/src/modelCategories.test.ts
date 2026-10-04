import { describe, expect, it } from "vitest";
import { MODEL_CATEGORIES, requiresModel } from "./modelCategories";

describe("requiresModel", () => {
  it("a bare call has every category on, so it needs the model", () => {
    expect(requiresModel()).toBe(true);
  });

  it("is false only when EVERY model category is disabled", () => {
    expect(requiresModel([...MODEL_CATEGORIES])).toBe(false);
    expect(requiresModel([...MODEL_CATEGORIES, "email", "url"])).toBe(false);
  });

  it("one model category left on is enough to need the model", () => {
    for (const kept of MODEL_CATEGORIES) {
      expect(requiresModel(MODEL_CATEGORIES.filter((c) => c !== kept))).toBe(true);
    }
  });

  it("disabling only rule categories does not remove the need", () => {
    expect(requiresModel(["email", "phone", "iban", "apikey"])).toBe(true);
  });
});
