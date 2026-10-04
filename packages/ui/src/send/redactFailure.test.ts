import { getMessages } from "@openmasq/i18n";
import { describe, expect, it } from "vitest";
import {
  classifyRedactFailure,
  describeRedactFailure,
  redactFailureIsUserFixable,
} from "./redactFailure";

const fr = getMessages("fr");
const en = getMessages("en");

describe("classifyRedactFailure", () => {
  it("treats missing/invalid keys as auth", () => {
    expect(classifyRedactFailure("GPTOSS_API_KEY is not set")).toBe("auth");
    expect(classifyRedactFailure("GPT-OSS inference failed: HTTP 401 invalid key")).toBe("auth");
    expect(classifyRedactFailure("HTTP 403 forbidden")).toBe("auth");
    expect(classifyRedactFailure("clé API manquante")).toBe("auth");
  });

  it("treats reachability problems as network", () => {
    expect(classifyRedactFailure("fetch failed")).toBe("network");
    expect(classifyRedactFailure("HTTP 503 unavailable")).toBe("network");
    expect(classifyRedactFailure("ECONNREFUSED")).toBe("network");
  });

  it("tells a pass that ran out of time from an unreachable service", () => {
    expect(classifyRedactFailure("timed out after 45s")).toBe("timeout");
    expect(classifyRedactFailure("remote redaction timed out")).toBe("timeout");
    expect(classifyRedactFailure("détection locale : délai dépassé")).toBe("timeout");
  });

  it("falls back to unknown", () => {
    expect(classifyRedactFailure("something weird happened")).toBe("unknown");
  });
});

describe("describeRedactFailure — cloud (remote) engine", () => {
  it("does NOT tell the user to set a key for a server-side auth failure", () => {
    const msg = describeRedactFailure("GPTOSS_API_KEY is not set", fr, "remote");
    // The failure is attributed to OUR side ("erreur de notre côté") — the wording
    // may evolve, but it must keep the support path and never blame the user's setup.
    expect(msg).toContain("notre côté");
    expect(msg).toContain("contactez le support");
    // The cloud key is server-side — never point the user at their settings.
    expect(msg).not.toContain("Réglages → Confidentialité");
  });

  it("phrases a network failure as a reachability problem", () => {
    const msg = describeRedactFailure("fetch failed", fr, "remote");
    // "en ligne", not "cloud": it's the same engine, said in French — and that is what
    // opposes it to "hors ligne" in the other messages of this family.
    expect(msg).toContain("en ligne");
    expect(msg).toContain("injoignable");
    expect(msg).not.toContain("Réglages → Confidentialité");
  });
});

describe("describeRedactFailure — local model engine", () => {
  it("points the user at their own key for an auth failure", () => {
    const msg = describeRedactFailure("HTTP 401 unauthorized", fr, "model");
    expect(msg).toContain("Réglages → Confidentialité");
  });

  it("keeps the local-model phrasing when no engine is given (fallback)", () => {
    const msg = describeRedactFailure("api key missing", fr);
    expect(msg).toContain("Réglages → Confidentialité");
  });
});

describe("describeRedactFailure — never shows the raw error, speaks the UI language", () => {
  it("keeps the technical reason out of the sentence", () => {
    expect(describeRedactFailure("weird ENGINE_PANIC 0x1f", fr, "model")).not.toContain("ENGINE_PANIC");
    expect(describeRedactFailure("weird ENGINE_PANIC 0x1f", fr, "remote")).not.toContain("ENGINE_PANIC");
  });

  it("says nothing was sent, in English too", () => {
    const msg = describeRedactFailure("fetch failed", en, "remote");
    expect(msg).toContain("Nothing was sent");
    expect(msg).not.toMatch(/redact/i);
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
