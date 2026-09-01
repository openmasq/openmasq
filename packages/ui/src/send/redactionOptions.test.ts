import { describe, it, expect } from "vitest";
import {
  effectiveRedactCategories,
  disabledKindsOf,
  convKindsFromSpans,
  avoidBlob,
  sendKeepList,
  sendForcedList,
  shouldRedactSystemPrompt,
} from "./redactionOptions";
import type { CoffreTerm } from "../types";

describe("effectiveRedactCategories", () => {
  it("layers global ⊕ conversation ⊕ org-forced, org winning (forced ON)", () => {
    const eff = effectiveRedactCategories(
      { name: true, email: false, company: true },
      { company: false }, // conversation disables company…
      ["company"], // …but the org MANDATES it → forced back ON
    );
    // toMatchObject, not toEqual: the result also carries the retired categories, forced
    // OFF (see below) — this case is about the global ⊕ conv ⊕ org layering only.
    expect(eff).toMatchObject({ name: true, email: false, company: true });
  });

  it("conversation override wins over global when the org doesn't force it", () => {
    expect(effectiveRedactCategories({ email: true }, { email: false }, [])).toMatchObject({ email: false });
  });

  // `health` is RETIRED: no toggle exists on any surface, so a value persisted before the
  // retirement (or an org row written against the old catalog) must not keep it running —
  // it would redact with no way for anyone to stop it. Retired is applied LAST, so it beats
  // the settings, the conversation override AND the org's mandate.
  it("forces a retired category OFF, over settings, conversation and org alike", () => {
    expect(effectiveRedactCategories({ health: true, email: true }, undefined, undefined)).toMatchObject({
      health: false,
      email: true,
    });
    expect(effectiveRedactCategories({}, { health: true }, ["health"])).toMatchObject({ health: false });
    expect(disabledKindsOf(effectiveRedactCategories({ health: true }, undefined, undefined))).toContain("health");
  });
});

describe("disabledKindsOf", () => {
  it("returns only the OFF categories", () => {
    expect(disabledKindsOf({ name: true, email: false, ip: false })).toEqual(["email", "ip"]);
  });
});

describe("convKindsFromSpans", () => {
  it("maps each spanned value to its kind across messages", () => {
    const conv = {
      messages: [
        { content: "", redactedSpans: [{ value: "Julien", kind: "name" }] },
        { content: "", redactedSpans: [{ value: "x@y.com", kind: "email" }] },
        { content: "" },
      ],
    };
    expect(convKindsFromSpans(conv)).toEqual({ Julien: "name", "x@y.com": "email" });
  });

  it("reads the conversation-level map too — a value that belongs to NO message", () => {
    // The reported bug: a person named only in the injected MÉMOIRE (or found by a
    // document OCR layer) is vaulted by a pass that owns no message, so it has no span.
    // Reading spans alone left it untyped and every consumer fell back to « sensitive »
    // — filed as generic info instead of a person.
    const conv = {
      messages: [{ content: "", redactedSpans: [{ value: "Julien", kind: "name" }] }],
      redactionKinds: { Stephane: "name", "36 AV DU CAPITAINE GLARNER": "address" },
    };
    expect(convKindsFromSpans(conv)).toEqual({
      Julien: "name",
      Stephane: "name",
      "36 AV DU CAPITAINE GLARNER": "address",
    });
  });

  it("a message's own span WINS over the conversation map — it is the specific evidence", () => {
    const conv = {
      messages: [{ content: "", redactedSpans: [{ value: "Stephane", kind: "name" }] }],
      redactionKinds: { Stephane: "sensitive" },
    };
    expect(convKindsFromSpans(conv).Stephane).toBe("name");
  });
});

describe("avoidBlob", () => {
  it("joins non-empty message contents; undefined when there's nothing", () => {
    expect(avoidBlob({ messages: [{ content: "bonjour" }, { content: "" }, { content: "monde" }] })).toEqual([
      "bonjour\nmonde",
    ]);
    expect(avoidBlob({ messages: [{ content: "" }] })).toBeUndefined();
    expect(avoidBlob({ messages: [] })).toBeUndefined();
  });
});

describe("sendKeepList", () => {
  it("concatenates connected names + revealed values + composer keeps", () => {
    expect(sendKeepList(["Stripe"], { revealedValues: ["redonne"] }, ["france"])).toEqual([
      "Stripe",
      "redonne",
      "france",
    ]);
  });
});

describe("sendForcedList", () => {
  const coffre: CoffreTerm[] = [{ id: "1", value: "SecretCorp", token: "ORG", createdAt: 0 }];
  it("merges coffre ⊕ conv ⊕ opts, deduped, kept only if present in modelText", () => {
    const text = "un mail de SecretCorp à Jean, réf ABSENTE ailleurs";
    const out = sendForcedList(
      coffre,
      { forcedRedactions: [{ value: "Jean", category: "NAME" }] },
      [{ value: "Jean", category: "NAME" }], // duplicate → deduped
      text,
    );
    expect(out).toEqual([
      { value: "SecretCorp", category: "ORG" },
      { value: "Jean", category: "NAME" },
    ]);
  });

  it("drops a forced value that is NOT in the outgoing text", () => {
    const out = sendForcedList([], { forcedRedactions: [{ value: "Ghost", category: "NAME" }] }, [], "no match here");
    expect(out).toEqual([]);
  });
});

describe("shouldRedactSystemPrompt (audit #7 — the custom system prompt isn't leaked)", () => {
  const DEFAULT = "You are a helpful assistant.";
  it("redacts a NON-DEFAULT custom prompt", () => {
    expect(shouldRedactSystemPrompt("Je m'appelle Jean Rebour.", DEFAULT)).toBe(true);
  });
  it("skips the shipped default (no PII) and empty/whitespace prompts", () => {
    expect(shouldRedactSystemPrompt(DEFAULT, DEFAULT)).toBe(false);
    expect(shouldRedactSystemPrompt("   ", DEFAULT)).toBe(false);
    expect(shouldRedactSystemPrompt(undefined, DEFAULT)).toBe(false);
  });
});
