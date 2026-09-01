import { describe, it, expect, vi } from "vitest";
import type { Conversation } from "../../types";
import { makeRenameConversation, normalizeConvTitle, CONV_TITLE_MAX } from "./renameConversation";

const conv = (over: Partial<Conversation> = {}): Conversation =>
  ({
    id: "c1",
    title: "Ancien titre",
    modelId: "gpt-5.5",
    messages: [],
    updatedAt: 1000,
    ...over,
  }) as Conversation;

/** Run the builder against a one-conversation store and hand back what it wrote. */
function rename(from: Conversation, raw: string): Conversation {
  let out = from;
  const patch = vi.fn((_id: string, fn: (c: Conversation) => Conversation) => {
    out = fn(out);
  });
  makeRenameConversation(patch)(from.id, raw);
  return out;
}

describe("normalizeConvTitle", () => {
  it("trims and collapses the whitespace a paste brings in", () => {
    expect(normalizeConvTitle("  Devis   Rebour \n ")).toBe("Devis Rebour");
  });

  it("caps at the same width as the auto-title", () => {
    expect(normalizeConvTitle("x".repeat(200))).toHaveLength(CONV_TITLE_MAX);
  });

  it("returns null for anything blank — there is no usable name in it", () => {
    expect(normalizeConvTitle("   \n\t ")).toBeNull();
    expect(normalizeConvTitle("")).toBeNull();
  });
});

describe("makeRenameConversation", () => {
  it("writes the normalised title", () => {
    expect(rename(conv(), "  Dossier   Morvan ").title).toBe("Dossier Morvan");
  });

  it("KEEPS the current title when the field was cleared", () => {
    // Committing on blur means an accidental clear reaches here. Writing "" would
    // leave an unnamed row the user then has to identify by guessing.
    const before = conv();
    const patch = vi.fn();
    makeRenameConversation(patch)(before.id, "   ");
    expect(patch).not.toHaveBeenCalled();
  });

  it("does NOT bump updatedAt — a rename is not activity in the thread", () => {
    // updatedAt orders the sidebar's date groups; bumping it would yank an old
    // conversation out of « Semaine dernière » and into « Aujourd'hui ».
    expect(rename(conv({ updatedAt: 1000 }), "Nouveau nom").updatedAt).toBe(1000);
  });

  it("returns the SAME object when the title is unchanged (no pointless re-render)", () => {
    const before = conv({ title: "Déjà bon" });
    expect(rename(before, "  Déjà bon  ")).toBe(before);
  });
});
