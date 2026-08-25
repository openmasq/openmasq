import { describe, it, expect } from "vitest";
import type { RedactionMatch } from "@openmasq/redact";
import { deriveRedactedSpans, buildSendAnalyticsEvents } from "./sendAnalytics";

const m = (over: Record<string, unknown>): RedactionMatch =>
  ({ value: "v", type: "email", placeholder: "p", ...over }) as unknown as RedactionMatch;

describe("deriveRedactedSpans", () => {
  it("maps each match to {value, fine-kind}, preferring category over type", () => {
    const spans = deriveRedactedSpans([
      m({ value: "a@b.com", category: "email", type: "email" }),
      m({ value: "Marc", category: undefined, type: "name" }),
    ]);
    expect(spans[0]).toEqual({ value: "a@b.com", kind: "email" });
    expect(spans[1].value).toBe("Marc");
    // kind is derived from `type` when `category` is absent (fine-category resolution).
    expect(typeof spans[1].kind).toBe("string");
  });
});

describe("buildSendAnalyticsEvents", () => {
  const base = {
    textLength: 12,
    matchCount: 0,
    useAiDetect: false,
    useRemote: false,
    modelError: false,
    spanKinds: [] as string[],
  };

  it("no matches ⇒ send_message + engine_used (no redaction_applied)", () => {
    const ev = buildSendAnalyticsEvents(base);
    expect(ev.map((e) => e.name)).toEqual(["send_message", "engine_used"]);
    expect(ev[0]).toEqual({ name: "send_message", chars: 12, redactions: 0 });
    expect(ev[1]).toEqual({ name: "engine_used", engine: "patterns" });
  });

  it("AI or remote engine ⇒ engine_used 'model'; regex ⇒ 'patterns'", () => {
    expect(buildSendAnalyticsEvents({ ...base, useAiDetect: true })[1]).toEqual({
      name: "engine_used",
      engine: "model",
    });
    expect(buildSendAnalyticsEvents({ ...base, useRemote: true })[1]).toEqual({
      name: "engine_used",
      engine: "model",
    });
  });

  it("with matches ⇒ redaction_applied carries the count + DEDUPED kinds (no values)", () => {
    const ev = buildSendAnalyticsEvents({
      ...base,
      matchCount: 3,
      spanKinds: ["email", "name", "email"],
    });
    const applied = ev.find((e) => e.name === "redaction_applied");
    expect(applied).toEqual({ name: "redaction_applied", count: 3, kinds: ["email", "name"] });
    // PRIVACY: the event never carries a raw value, only counts + category keys.
    expect(JSON.stringify(ev)).not.toMatch(/v@|Marc|@b\.com/);
  });

  it("AI detector failed ⇒ a redaction_fallback_regex event is appended", () => {
    const ev = buildSendAnalyticsEvents({
      ...base,
      useAiDetect: true,
      modelError: true,
      matchCount: 1,
      spanKinds: ["name"],
    });
    expect(ev.some((e) => e.name === "redaction_fallback_regex")).toBe(true);
  });

  it("modelError WITHOUT an AI engine does NOT emit the fallback event", () => {
    const ev = buildSendAnalyticsEvents({ ...base, modelError: true, matchCount: 1, spanKinds: ["x"] });
    expect(ev.some((e) => e.name === "redaction_fallback_regex")).toBe(false);
  });
});
