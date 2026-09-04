import { describe, expect, it } from "vitest";
import { buildKind, sentryEnabled } from "./gate";

describe("buildKind — trois sortes de build, deux faits", () => {
  it("non empaqueté = dev, quel que soit le canal", () => {
    expect(buildKind(false, "desktop-stable")).toBe("dev");
    expect(buildKind(false, "")).toBe("dev");
  });
  it("empaqueté sans canal = local (un `pnpm run eb` hors CI)", () => {
    expect(buildKind(true, "")).toBe("local");
    expect(buildKind(true, undefined)).toBe("local");
    expect(buildKind(true, "  ")).toBe("local");
  });
  it("empaqueté avec un canal bakée par la CI = distribué", () => {
    expect(buildKind(true, "desktop-stable")).toBe("distributed");
  });
});

describe("sentryEnabled — seul un binaire DISTRIBUÉ rapporte", () => {
  it("dev et local : fermés par défaut, ouverts seulement par OPENMASQ_SENTRY_DEV=1", () => {
    for (const kind of ["dev", "local"] as const) {
      expect(sentryEnabled(kind, undefined)).toBe(false);
      expect(sentryEnabled(kind, "0")).toBe(false);
      expect(sentryEnabled(kind, "true")).toBe(false);
      expect(sentryEnabled(kind, "1")).toBe(true);
    }
  });
  it("distribué : ouvert, la vanne ne le ferme pas", () => {
    expect(sentryEnabled("distributed", "0")).toBe(true);
    expect(sentryEnabled("distributed", undefined)).toBe(true);
  });
});
