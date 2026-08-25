import { describe, it, expect } from "vitest";
import type { Conversation } from "../../../types";
import { conversationKinds, conversationKindIndex, kindOf, vaultBreakdown } from "./privacyStats";
import { conversationProtectedCount, protectedCount } from "../../../state/protectedCount";

// A conversation whose typed name/company were vaulted but whose fine category was
// recorded ONLY on the message span (the historic bug) — `redactionKinds` is empty.
const conv = (over: Partial<Conversation> = {}): Conversation =>
  ({
    id: "c1",
    title: "PV d'AG",
    modelId: "x",
    createdAt: 0,
    updatedAt: 0,
    messages: [
      {
        id: "m1",
        role: "user",
        content: "Julien Sabourdin de Karl Studio, tel 06 12 34 56 78",
        redactedSpans: [
          { value: "Julien Sabourdin", kind: "name" },
          { value: "Karl Studio", kind: "company" },
          { value: "06 12 34 56 78", kind: "phone" },
        ],
      },
    ],
    redactionVault: {
      "Jade Savel": "Julien Sabourdin",
      "Oslen Group": "Karl Studio",
      "07 00 00 00 00": "06 12 34 56 78",
    },
    // The bug: no per-value kinds persisted here.
    redactionKinds: {},
    ...over,
  }) as Conversation;

describe("conversationKinds — heal typed-message categories from redactedSpans", () => {
  it("merges message spans into the value→kind map", () => {
    const k = conversationKinds(conv());
    expect(k["Julien Sabourdin"]).toBe("name");
    expect(k["Karl Studio"]).toBe("company");
    expect(k["06 12 34 56 78"]).toBe("phone");
  });

  it("prefers the persisted redactionKinds when a span is absent, span otherwise", () => {
    const k = conversationKinds(
      conv({ redactionKinds: { "06 12 34 56 78": "phone", "only-in-kinds@x.co": "email" } }),
    );
    expect(k["only-in-kinds@x.co"]).toBe("email"); // persisted-only value kept
    expect(k["Julien Sabourdin"]).toBe("name"); // span-only value healed
  });
});

describe("vaultBreakdown no longer mislabels typed names as secrets", () => {
  it("categorises the healed values (was all 'secret' before)", () => {
    const { rows } = vaultBreakdown([conv()]);
    const byKey = Object.fromEntries(rows.map((r) => [r.key, r.count]));
    expect(byKey.name).toBe(1);
    expect(byKey.company).toBe(1);
    expect(byKey.phone).toBe(1);
    expect(byKey.secret ?? 0).toBe(0); // nothing falls back to "Clés & secrets"
  });
});

describe("kindOf resolves the per-word / casing vault ALIAS fragments", () => {
  // The vault carries per-word name aliases (capitalised + lowercased) the engine
  // writes directly — "Sabourdin"/"sabourdin"/"JULIEN" — that never reach
  // `redactionKinds`. Exact-case lookup missed them → they defaulted to "secret"
  // ("Clés & secrets"). The index resolves them from the parent span's kind.
  const index = conversationKindIndex(conv());

  it("resolves a bare name FRAGMENT to the parent's kind (not secret)", () => {
    expect(kindOf(index, "Sabourdin")).toBe("name");
    expect(kindOf(index, "Julien")).toBe("name");
  });

  it("resolves any CASING of a fragment (JULIEN / julien / SABOURDIN)", () => {
    expect(kindOf(index, "JULIEN")).toBe("name");
    expect(kindOf(index, "sabourdin")).toBe("name");
    expect(kindOf(index, "SABOURDIN")).toBe("name");
  });

  it("does NOT word-fragment non-fragmented kinds (a company stays whole)", () => {
    // "Karl Studio" is a company (word-aliases aren't emitted for ORGs), so a bare
    // "Studio" must NOT be indexed as company (would over-claim a common word).
    expect(kindOf(index, "Studio")).toBeUndefined();
    expect(kindOf(index, "karl studio")).toBe("company"); // whole value, case-insensitive
  });

  it("returns undefined for a genuinely unknown value (caller defaults it)", () => {
    expect(kindOf(index, "totallyunrelated")).toBeUndefined();
  });
});

// The number the user compares across screens. The sidebar shield (Rail), the chat
// header, the mobile thread badge and this card all read `state/protectedCount.ts`;
// the card's total must therefore BE that number, for any conversation set.
describe("parity — the shield's count IS the « tout ce qui a été redacted » total", () => {
  const set = [
    conv(),
    conv({
      id: "c2",
      // A file + a tool result vaulted values that never appear in typed text, and
      // one value typed TWICE — the two cases the old per-message `redactions` sum
      // got wrong in opposite directions.
      messages: [
        {
          id: "m1",
          role: "user",
          content: "Écris à contact@karl.fr, en copie contact@karl.fr",
          redactions: 2,
        },
      ],
      redactionVault: {
        "a@b.fr": "contact@karl.fr",
        "Rue des Lilas": "12 rue de Verdun",
        "": "orphelin sans fake",
      },
      redactionKinds: { "contact@karl.fr": "email", "12 rue de Verdun": "address" },
    } as Partial<Conversation>),
  ];

  it("agrees on a realistic account", () => {
    expect(protectedCount(set)).toBe(vaultBreakdown(set).total);
  });

  it("counts one per vaulted VALUE — not per typed occurrence, and files/tools included", () => {
    // c1: 3 vault entries. c2: 2 countable (the empty-fake row is not an item),
    // even though the message reports 2 typed occurrences of a SINGLE value.
    expect(protectedCount(set)).toBe(5);
  });

  it("stays in agreement when nothing was protected", () => {
    const empty = [conv({ redactionVault: {}, messages: [] })];
    expect(protectedCount(empty)).toBe(0);
    expect(vaultBreakdown(empty).total).toBe(0);
  });

  it("sums the per-conversation number the chat header shows", () => {
    expect(set.reduce((n, c) => n + conversationProtectedCount(c), 0)).toBe(protectedCount(set));
  });
});
