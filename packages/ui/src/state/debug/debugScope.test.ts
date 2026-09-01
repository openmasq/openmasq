import { describe, it, expect } from "vitest";
import { isEntryVisibleIn } from "./debugScope";

/**
 * The hole these tests keep closed.
 *
 * An entry WITHOUT `conv` was treated as "app-level", so shown in ALL conversations —
 * redacted→original mapping included. Observed in real usage: a Gmail conversation's
 * journal showed the correspondence table of an INPI PDF redacted hours earlier, with
 * the real name, addresses and company number.
 *
 * The vault is per-conversation by CONSTRUCTION. Its table appearing next to an unrelated
 * exchange breaks precisely the isolation it exists to give — and a journal gets
 * copied, pasted into a bug report, shown to someone.
 *
 * ⚠️ The emitter isn't strictly at fault: an attachment dropped BEFORE a conversation
 * exists has no id to stamp (`conversation?.id` is undefined at that moment). That's why
 * the rule targets the CONTENT and not the emitter: it holds for the next one who'll
 * forget, and there will be one.
 */
describe("portée du journal — une entrée non attribuable ne fuit nulle part", () => {
  const pairs = [{ token: "Marnco & Co", original: "Karl Studio" }];

  it("MASQUE partout une entrée sans conv qui porte le mapping réel", () => {
    const e = { id: "d1", at: 0, type: "tool" as const, name: "document-redaction", ok: true, pairs };
    expect(isEntryVisibleIn(e, "c1")).toBe(false);
    expect(isEntryVisibleIn(e, "c2")).toBe(false);
    expect(isEntryVisibleIn(e, undefined)).toBe(false); // not even "outside conversation"
  });

  it("masque de même une entrée sans conv qui porte un extrait de coffre", () => {
    const e = { id: "d2", at: 0, type: "wire" as const, model: "m", text: "t", vault: { A: "Karl Studio" } };
    expect(isEntryVisibleIn(e, "c1")).toBe(false);
  });

  // ⚠️ This case said the OPPOSITE until 12/08: an entry with no real values was
  // "app-level", so shown everywhere. Reversed on usage findings — a conversation's
  // journal stayed the SAME when switching conversations. The journal is per-conversation
  // with no exception (the modal writes it), and no emitter produces an unattributed
  // entry anymore: "no conversation yet" is `DRAFT_CONV`, not `undefined`. What still
  // fell through this branch was therefore only data persisted before the stamping was
  // added. See `debugScope.ts` for the accepted corollary.
  it("une entrée sans conv ne s'affiche NULLE PART, même inoffensive", () => {
    const phase = { id: "d3", at: 0, type: "phase" as const, scope: "loop", label: "démarrage" };
    expect(isEntryVisibleIn(phase, "c1")).toBe(false);
    expect(isEntryVisibleIn(phase, "c2")).toBe(false);
    expect(isEntryVisibleIn(phase, undefined)).toBe(false);
    // Even a tool entry with an EMPTY mapping: what decides is attribution, not the
    // content. Once stamped, the same entry shows (next case).
    const empty = { id: "d4", at: 0, type: "tool" as const, name: "t", ok: true, pairs: [] };
    expect(isEntryVisibleIn(empty, "c1")).toBe(false);
    expect(isEntryVisibleIn({ ...empty, conv: "c1" }, "c1")).toBe(true);
  });

  it("une entrée ESTAMPILLÉE ne se voit que dans sa conversation, mapping ou pas", () => {
    const e = { id: "d5", at: 0, conv: "c1", type: "tool" as const, name: "n", ok: true, pairs };
    expect(isEntryVisibleIn(e, "c1")).toBe(true);
    expect(isEntryVisibleIn(e, "c2")).toBe(false);
    expect(isEntryVisibleIn(e, undefined)).toBe(false);
  });
});
