import { describe, it, expect } from "vitest";
import { redact, toSegments, compileVault, segmentsWith, wireSegments, type Vault } from "../index";

describe("wireSegments (debug highlight of the wire text)", () => {
  it("highlights the placeholders that actually left the machine (regex engine)", () => {
    const vault: Vault = {};
    const { text } = redact("Email marcus@acme.com about it.", { vault });
    // The wire text carries a [REDACTED_EMAIL_1] placeholder, NOT the original.
    const segs = wireSegments(text, vault);
    const red = segs.filter((s) => s.kind === "redaction");
    expect(red).toHaveLength(1);
    expect(red[0].value).toMatch(/^\[REDACTED_EMAIL_\d+\]$/);
    expect(red[0].tone).toBe("sky"); // EMAIL → the Contact section, which wears sky
    // Reassembling the segments yields the wire text back.
    expect(segs.map((s) => s.value).join("")).toBe(text);
  });

  it("uses the kinds map (keyed by original) for fake-data wires", () => {
    // Model engine: vault key is a believable fake value, not a placeholder.
    const vault: Vault = { "Jane Doe": "Marcus Foy" };
    const kinds = { "Marcus Foy": "name" }; // keyed by the ORIGINAL
    const segs = wireSegments("Hi Jane Doe, welcome.", vault, kinds);
    const red = segs.filter((s) => s.kind === "redaction");
    expect(red).toHaveLength(1);
    expect(red[0].value).toBe("Jane Doe");
    expect(red[0].tone).toBe("violet"); // name → violet (Identité & organisations family)
  });

  it("is the mirror of toSegments: one finds originals, the other finds keys", () => {
    const vault: Vault = { "[REDACTED_EMAIL_1]": "a@b.com" };
    expect(toSegments("a@b.com here", vault).some((s) => s.kind === "redaction")).toBe(true);
    expect(wireSegments("a@b.com here", vault).some((s) => s.kind === "redaction")).toBe(false);
    expect(wireSegments("[REDACTED_EMAIL_1] here", vault).some((s) => s.kind === "redaction")).toBe(true);
  });

  it("recovers a structured category by SHAPE when kinds is missing (fake-data engine)", () => {
    // Fake-data vault: the key is a believable fake EMAIL, not a [REDACTED_…]
    // marker, and no kinds map is provided. Without shape-recovery this fell to
    // the SENSITIVE/coral tone → rendered RED in the chat while the composer (live
    // per-category hue) showed it in its family colour. It must resolve to email + that
    // family's tone, whatever the family is currently painted.
    const vault: Vault = { "jules.velay@gmail.com": "john.doe@example.com" };
    const red = toSegments("Écris à john.doe@example.com", vault).find(
      (s) => s.kind === "redaction",
    );
    expect(red?.label).toBe("email");
    expect(red?.tone).toBe("sky"); // email → Contact section (matches the composer)
  });
});

describe("toSegments — word-glued short values are NOT highlighted", () => {
  it("skips a 2-char value inside a word but marks it standalone", () => {
    // vault maps a fake → the real 2-char value "us" (e.g. mis-detected country code)
    const vault: Vault = { Besançon: "us" };
    const segs = toSegments("because of us, plus status", vault);
    const marks = segs.filter((s) => s.kind === "redaction").map((s) => s.value);
    // only the STANDALONE "us" is a redaction — not the "us" inside because/plus/status
    expect(marks).toEqual(["us"]);
    // reassembly is lossless (glued occurrences stay as text)
    expect(segs.map((s) => s.value).join("")).toBe("because of us, plus status");
  });
  it("still highlights normal (non-glued) values", () => {
    const vault: Vault = { "jane@x.com": "marc@acme.com" };
    const segs = toSegments("Write marc@acme.com now", vault);
    expect(segs.filter((s) => s.kind === "redaction").map((s) => s.value)).toEqual(["marc@acme.com"]);
  });
});

describe("compileVault / segmentsWith — a matcher is REUSABLE", () => {
  const marks = (segs: ReturnType<typeof toSegments>) =>
    segs.filter((s) => s.kind === "redaction").map((s) => s.value);

  // The point of compiling once is that rehypeRedact reuses ONE matcher across every
  // text node of a message — so reuse must be side-effect-free. Today it is: the
  // matcher's regex is `g`, but the scan always drains it until exec returns null,
  // which resets lastIndex. These pin the PROPERTY, not that reasoning — a switch to a
  // sticky flag, an early `break`, or matchAll would break reuse, and the failure mode
  // is silent (the wire stays redacted; the user just stops SEEING the marks).
  it("marks the same values on every call, not just the first", () => {
    const vault: Vault = { "jane@x.com": "marc@acme.com" };
    const m = compileVault(vault)!;
    for (let i = 0; i < 3; i++) {
      expect(marks(segmentsWith("Write marc@acme.com now", m))).toEqual(["marc@acme.com"]);
    }
  });

  it("does not leak match position between calls (a later node matching EARLY)", () => {
    // First text matches near its END, second at index 0 — the shape a stale match
    // position would skip.
    const vault: Vault = { "jane@x.com": "marc@acme.com" };
    const m = compileVault(vault)!;
    expect(marks(segmentsWith("a".repeat(200) + " marc@acme.com", m))).toEqual(["marc@acme.com"]);
    expect(marks(segmentsWith("marc@acme.com is first", m))).toEqual(["marc@acme.com"]);
  });

  it("agrees with toSegments, which is now defined in terms of it", () => {
    const vault: Vault = { Besançon: "us", "jane@x.com": "marc@acme.com" };
    const text = "because of us, write marc@acme.com";
    const m = compileVault(vault)!;
    expect(segmentsWith(text, m)).toEqual(toSegments(text, vault));
  });

  it("compiles an empty vault to null (nothing to match)", () => {
    expect(compileVault({})).toBeNull();
    expect(compileVault({ "[REDACTED_EMAIL_1]": "" })).toBeNull(); // empty values filtered
    expect(toSegments("plain text", {})).toEqual([{ kind: "text", value: "plain text" }]);
  });
});

describe("spanKindLabel — le repli-placeholder ne dit jamais « api token » pour un scramble", () => {
  it("un segment de chemin scramblé (valeur = mot pur) tombe sur « sensitive », pas « api token »", async () => {
    const { spanKindLabel } = await import("./segments");
    // Log 02/08: `u5MZS9WVyjs7CB2 → juliensabourdin (api token)` — the VALUE is a
    // plain username, only the FAKE (alnum scramble) looks like a token.
    expect(spanKindLabel("u5MZS9WVyjs7CB2", "juliensabourdin")).toBe("sensitive");
    // A supplied exactKind always wins…
    expect(spanKindLabel("u5MZS9WVyjs7CB2", "juliensabourdin", "path")).toBe("path");
    // …and a pair whose VALUE has a shape (email) keeps its precise label.
    expect(spanKindLabel("jane@x.test", "marc@acme.com")).toBe("email");
  });
});
