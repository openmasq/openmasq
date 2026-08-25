import { describe, expect, it } from "vitest";
import type { Conversation, Message } from "@openmasq/schema";
import { emitConvRecords, emitDeletions, emptyConvSyncState } from "./convSync";
import { absorbPulled, applyPulled } from "./convSyncApply";

const msg = (id: string, over: Partial<Message> = {}): Message => ({
  id,
  role: "user",
  content: `content ${id}`,
  ...over,
});

const conv = (id: string, messages: Message[], over: Partial<Conversation> = {}): Conversation =>
  ({
    id,
    title: "Titre",
    modelId: "gpt-4o-mini",
    messages,
    createdAt: 1000,
    updatedAt: 2000,
    ...over,
  }) as Conversation;

describe("emitConvRecords", () => {
  it("first emit: one meta record + one record per FINAL message (pending excluded)", () => {
    const c = conv("c1", [msg("m1"), msg("m2", { pending: true }), msg("m3")]);
    const { records, state } = emitConvRecords(c, emptyConvSyncState("acc"), "dev-A");
    expect(records.map((r) => r.kind)).toEqual(["convMeta", "message", "message"]);
    expect(records.map((r) => r.entityId)).toEqual(["meta", "m1", "m3"]);
    expect(state.convs["c1"].msgIds).toEqual(["m1", "m3"]);
    // A later emit with the SAME conversation pushes nothing (delta-only).
    const again = emitConvRecords(c, state, "dev-A");
    expect(again.records).toEqual([]);
  });

  it("the message payload is ALLOW-LISTED — transient fields never sync", () => {
    const m = msg("m1", { toolCall: "browser_navigate", errorText: "boom", modelContent: "wire" } as Partial<Message>);
    const { records } = emitConvRecords(conv("c1", [m]), emptyConvSyncState("acc"), "dev-A");
    const payload = records.find((r) => r.kind === "message")!.payload as Record<string, unknown>;
    expect(payload).toEqual({ id: "m1", role: "user", content: "content m1", modelContent: "wire" });
    expect(payload.toolCall).toBeUndefined();
    expect(payload.errorText).toBeUndefined();
  });

  it("a title/model change re-emits ONLY the meta record (deterministic msg recordIds dedupe)", () => {
    const c = conv("c1", [msg("m1")]);
    const first = emitConvRecords(c, emptyConvSyncState("acc"), "dev-A");
    const renamed = conv("c1", [msg("m1")], { title: "Nouveau titre" });
    const { records } = emitConvRecords(renamed, first.state, "dev-A");
    expect(records.map((r) => r.kind)).toEqual(["convMeta"]);
  });
});

describe("emitDeletions", () => {
  it("a ledger conversation missing from the store becomes a tombstone (and leaves the ledger)", () => {
    const { state } = emitConvRecords(conv("c1", [msg("m1")]), emptyConvSyncState("acc"), "dev-A");
    const { tombstones, state: next } = emitDeletions(new Set([]), state, "dev-A");
    expect(tombstones.map((t) => t.convId)).toEqual(["c1"]);
    expect(tombstones[0].record.kind).toBe("convTombstone");
    expect(next.convs["c1"]).toBeUndefined();
  });

  it("nothing deleted → no tombstones, state unchanged", () => {
    const { state } = emitConvRecords(conv("c1", [msg("m1")]), emptyConvSyncState("acc"), "dev-A");
    const out = emitDeletions(new Set(["c1"]), state, "dev-A");
    expect(out.tombstones).toEqual([]);
    expect(out.state).toBe(state);
  });
});

describe("applyPulled / absorbPulled — the receiving side", () => {
  it("creates a conversation from remote records (meta + messages, lamport order)", () => {
    const local = emitConvRecords(conv("c1", [msg("m1"), msg("m2")]), emptyConvSyncState("acc"), "dev-A");
    const out = applyPulled(undefined, "c1", local.records, 5000);
    expect(out.kind).toBe("upsert");
    const c = (out as { conv: Conversation }).conv;
    expect(c.title).toBe("Titre");
    expect(c.modelId).toBe("gpt-4o-mini");
    expect(c.createdAt).toBe(1000);
    expect(c.messages.map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(c.updatedAt).toBe(5000);
  });

  it("merges into an existing conversation: LOCAL order preserved, unseen appended, no duplicates", () => {
    const remote = emitConvRecords(conv("c1", [msg("m1"), msg("m9")]), emptyConvSyncState("acc"), "dev-B");
    const local = conv("c1", [msg("m1"), msg("m2")]);
    const out = applyPulled(local, "c1", remote.records, 5000);
    const c = (out as { conv: Conversation }).conv;
    expect(c.messages.map((m) => m.id)).toEqual(["m1", "m2", "m9"]);
  });

  it("a convTombstone deletes an existing conversation (and no-ops on an unknown one)", () => {
    const { tombstones } = emitDeletions(
      new Set([]),
      emitConvRecords(conv("c1", [msg("m1")]), emptyConvSyncState("acc"), "dev-B").state,
      "dev-B",
    );
    expect(applyPulled(conv("c1", [msg("m1")]), "c1", [tombstones[0].record], 5000).kind).toBe("delete");
    expect(applyPulled(undefined, "c1", [tombstones[0].record], 5000).kind).toBe("none");
  });

  it("absorbPulled prevents the ECHO: pulled messages are never re-emitted, lamport advances", () => {
    const A = emitConvRecords(conv("c1", [msg("m1")]), emptyConvSyncState("accA"), "dev-A");
    // Device B pulls A's records…
    let stateB = emptyConvSyncState("accA");
    stateB = absorbPulled(stateB, "c1", 2, A.records);
    expect(stateB.convs["c1"].seq).toBe(2);
    expect(stateB.lamport).toBeGreaterThanOrEqual(A.state.lamport);
    // …and its next emit for the merged conversation pushes NOTHING back.
    const applied = applyPulled(undefined, "c1", A.records, 5000) as { conv: Conversation };
    const echo = emitConvRecords(applied.conv, stateB, "dev-B");
    expect(echo.records).toEqual([]);
  });
});

describe("message EDITS — re-emit + LWW apply (the DocumentCard editor's channel)", () => {
  it("an edited known message re-emits as a VERSIONED record on the same entityId", () => {
    const first = emitConvRecords(conv("c1", [msg("m1")]), emptyConvSyncState("acc"), "dev-A");
    const edited = conv("c1", [msg("m1", { content: "content m1 ÉDITÉ" })]);
    const { records, state } = emitConvRecords(edited, first.state, "dev-A");
    expect(records).toHaveLength(1);
    const r = records[0]!;
    expect(r.kind).toBe("message");
    expect(r.entityId).toBe("m1");
    expect(r.recordId).not.toBe("msg:m1"); // the server ignores a re-push of that id
    expect(r.recordId.startsWith("msg:m1:")).toBe(true);
    expect((r.payload as { content: string }).content).toBe("content m1 ÉDITÉ");
    // Idempotent: emitting again with no further change pushes nothing.
    expect(emitConvRecords(edited, state, "dev-A").records).toEqual([]);
  });

  it("UPGRADE : un ledger sans msgSigs adopte les sigs SANS re-pousser l'historique", () => {
    const first = emitConvRecords(conv("c1", [msg("m1"), msg("m2")]), emptyConvSyncState("acc"), "dev-A");
    // Simulate a pre-edit ledger: same msgIds, no sig map.
    const legacy = {
      ...first.state,
      convs: { c1: { ...first.state.convs["c1"]!, msgSigs: undefined } },
    };
    const { records, state } = emitConvRecords(conv("c1", [msg("m1"), msg("m2")]), legacy, "dev-A");
    expect(records).toEqual([]); // no mass re-push
    // …but a subsequent edit IS now detected.
    const next = emitConvRecords(conv("c1", [msg("m1", { content: "v2" }), msg("m2")]), state, "dev-A");
    expect(next.records.map((r) => r.entityId)).toEqual(["m1"]);
  });

  it("applyPulled remplace le contenu d'un message connu (LWW), champs locaux préservés", () => {
    const A1 = emitConvRecords(conv("c1", [msg("m1")]), emptyConvSyncState("accA"), "dev-A");
    const A2 = emitConvRecords(conv("c1", [msg("m1", { content: "v2 éditée" })]), A1.state, "dev-A");
    // B holds m1 v1 with a device-local field, and a clean ledger sig for v1.
    let stateB = absorbPulled(emptyConvSyncState("accA"), "c1", 1, A1.records);
    const localB = conv("c1", [msg("m1", { redactions: 3 } as Partial<Message>)]);
    const out = applyPulled(localB, "c1", A2.records, 6000, stateB.convs["c1"]!.msgSigs);
    expect(out.kind).toBe("upsert");
    const m = (out as { conv: Conversation }).conv.messages[0]!;
    expect(m.content).toBe("v2 éditée");
    expect((m as { redactions?: number }).redactions).toBe(3); // local-only field survives
    // Absorbing the pull records v2's sig → B never echoes the applied edit back.
    stateB = absorbPulled(stateB, "c1", 2, A2.records);
    const echo = emitConvRecords((out as { conv: Conversation }).conv, stateB, "dev-B");
    expect(echo.records).toEqual([]);
  });

  it("un édit LOCAL non poussé SURVIT à un pull concurrent (règle userdata)", () => {
    const A1 = emitConvRecords(conv("c1", [msg("m1")]), emptyConvSyncState("accA"), "dev-A");
    const A2 = emitConvRecords(conv("c1", [msg("m1", { content: "édit de A" })]), A1.state, "dev-A");
    // B pulled v1, then edited locally WITHOUT pushing yet.
    const stateB = absorbPulled(emptyConvSyncState("accA"), "c1", 1, A1.records);
    const localB = conv("c1", [msg("m1", { content: "édit de B, pas encore poussé" })]);
    const out = applyPulled(localB, "c1", A2.records, 6000, stateB.convs["c1"]!.msgSigs);
    // A's edit must NOT clobber B's uncommitted one.
    const content =
      out.kind === "upsert"
        ? (out as { conv: Conversation }).conv.messages[0]!.content
        : localB.messages[0]!.content;
    expect(content).toBe("édit de B, pas encore poussé");
  });

  it("absorb enregistre la sig du GAGNANT LWW quand un pull porte plusieurs versions", () => {
    const A1 = emitConvRecords(conv("c1", [msg("m1")]), emptyConvSyncState("accA"), "dev-A");
    const A2 = emitConvRecords(conv("c1", [msg("m1", { content: "v2" })]), A1.state, "dev-A");
    const both = [...A1.records, ...A2.records]; // v1 + v2 in ONE pull
    const stateB = absorbPulled(emptyConvSyncState("accA"), "c1", 3, both);
    const applied = applyPulled(undefined, "c1", both, 6000) as { conv: Conversation };
    expect(applied.conv.messages[0]!.content).toBe("v2");
    // The ledger remembers v2 (the winner) — no echo.
    expect(emitConvRecords(applied.conv, stateB, "dev-B").records).toEqual([]);
  });
});
