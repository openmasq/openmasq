import { describe, it, expect } from "vitest";
import { pseudonymize, toSegments } from "@openmasq/redact";
import { forcedVaultPatch } from "./forcedFake";

describe("forcedVaultPatch — the pill a manual redaction must show", () => {
  it("mints a fake for a value NO detector would catch, and the message then paints it", async () => {
    // The reported bug: select an invented project name in a message → Redact → nothing.
    const text = "Le projet Zorglub avance bien.";
    const p = await forcedVaultPatch("Zorglub", "NAME", undefined);
    expect(p).not.toBeNull();
    // A vault entry now maps some fake → the real value…
    expect(Object.values(p!.vault)).toContain("Zorglub");
    expect(p!.kinds).toEqual({ Zorglub: "name" });
    // …which is exactly what makes the message render it as a redaction pill.
    const segs = toSegments(text, p!.vault, p!.kinds);
    const mark = segs.find((s) => s.kind === "redaction");
    expect(mark?.value).toBe("Zorglub");
    expect(mark?.label).toBe("name");
    expect(mark?.tone).toBe("violet"); // name → the Identité family hue
    // Reassembly stays lossless — the user still reads their REAL text.
    expect(segs.map((s) => s.value).join("")).toBe(text);
  });

  it("REUSES the conversation's existing fake instead of minting a second one", async () => {
    // The invariant this fix could break: one real value → ONE fake, conversation-wide.
    // Seeding against `{}` (as the document path does) would hand "Zorglub" a fresh fake
    // while the conversation already had one, and the two would diverge.
    const existing = { Fantasio: "Zorglub" };
    const p = await forcedVaultPatch("Zorglub", "NAME", existing);
    expect(p).not.toBeNull();
    const fakes = Object.entries(p!.vault).filter(([, real]) => real === "Zorglub");
    expect(fakes).toHaveLength(1);
    expect(fakes[0][0]).toBe("Fantasio");
  });

  it("carries the pre-existing vault through, so merging cannot drop another value", async () => {
    const existing = { Fantasio: "Zorglub", "a@b.com": "réel@example.com" };
    const p = await forcedVaultPatch("Spirou", "NAME", existing);
    expect(p!.vault).toMatchObject(existing);
  });

  it("stays reversible — the send's un-redaction restores the forced value", async () => {
    const p = await forcedVaultPatch("Zorglub", "NAME", undefined);
    const fake = Object.keys(p!.vault).find((k) => p!.vault[k] === "Zorglub")!;
    // A later send re-redacts the same text against the SAME vault: the wire carries the
    // fake we seeded, not a new one.
    const vault = { ...p!.vault };
    const { text } = await pseudonymize("Zorglub avance", {
      forced: [{ value: "Zorglub", category: "NAME" }],
      vault,
      numbers: false,
    });
    expect(text).toContain(fake);
    expect(text).not.toContain("Zorglub");
  });

  it("returns null on an empty/blank selection rather than vaulting nothing", async () => {
    expect(await forcedVaultPatch("   ", "NAME", undefined)).toBeNull();
    expect(await forcedVaultPatch("", "NAME", undefined)).toBeNull();
  });
});
