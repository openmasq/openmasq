import { describe, expect, it } from "vitest";
import {
  classifyRedactFailure,
  describeRedactFailure,
  redactFailureIsUserFixable,
} from "./redactFailure";

describe("classifyRedactFailure", () => {
  it("treats missing/invalid keys as auth", () => {
    expect(classifyRedactFailure("GPTOSS_API_KEY is not set")).toBe("auth");
    expect(classifyRedactFailure("GPT-OSS inference failed: HTTP 401 invalid key")).toBe("auth");
    expect(classifyRedactFailure("HTTP 403 forbidden")).toBe("auth");
    expect(classifyRedactFailure("clé API manquante")).toBe("auth");
  });

  it("treats reachability problems as network", () => {
    expect(classifyRedactFailure("fetch failed")).toBe("network");
    expect(classifyRedactFailure("remote redaction timed out")).toBe("network");
    expect(classifyRedactFailure("HTTP 503 unavailable")).toBe("network");
    expect(classifyRedactFailure("ECONNREFUSED")).toBe("network");
  });

  it("falls back to unknown", () => {
    expect(classifyRedactFailure("something weird happened")).toBe("unknown");
  });
});

describe("describeRedactFailure — cloud (remote) engine", () => {
  it("does NOT tell the user to set a key for a server-side auth failure", () => {
    const msg = describeRedactFailure("GPTOSS_API_KEY is not set", "remote");
    // The failure is attributed to OUR side ("un souci de notre côté") — the wording
    // may evolve, but it must keep the support path and never blame the user's setup.
    expect(msg).toContain("notre côté");
    expect(msg).toContain("contactez le support");
    // The cloud key is server-side — never point the user at their settings.
    expect(msg).not.toContain("Réglages → Confidentialité");
  });

  it("phrases a network failure as a reachability problem", () => {
    const msg = describeRedactFailure("fetch failed", "remote");
    // "en ligne", not "cloud": it's the same engine, said in French — and that is what
    // opposes it to "hors ligne" in the other messages of this family.
    expect(msg).toContain("en ligne");
    expect(msg).toContain("injoignable");
    expect(msg).not.toContain("Réglages → Confidentialité");
  });
});

describe("describeRedactFailure — local model engine", () => {
  it("points the user at their own key for an auth failure", () => {
    const msg = describeRedactFailure("HTTP 401 unauthorized", "model");
    expect(msg).toContain("Réglages → Confidentialité");
  });

  it("keeps the local-model phrasing when no engine is given (fallback)", () => {
    const msg = describeRedactFailure("api key missing");
    expect(msg).toContain("Réglages → Confidentialité");
  });
});

describe("redactFailureIsUserFixable", () => {
  it("is false only for the cloud engine", () => {
    expect(redactFailureIsUserFixable("remote")).toBe(false);
    expect(redactFailureIsUserFixable("model")).toBe(true);
    expect(redactFailureIsUserFixable("patterns")).toBe(true);
    expect(redactFailureIsUserFixable(undefined)).toBe(true);
  });
});
