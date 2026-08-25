import { describe, expect, it } from "vitest";
import {
  absorbCoffreRecords,
  emitCoffreRecords,
  emptyCoffreSyncState,
  type SyncedCoffreTerm,
} from "./coffre";
import type { SyncRecord } from "./types";

const term = (id: string, value: string, extra?: Partial<SyncedCoffreTerm>): SyncedCoffreTerm => ({
  id,
  value,
  token: "ORG",
  createdAt: 1000,
  ...extra,
});

describe("coffre sync (emit/absorb)", () => {
  it("emits one record per term, then nothing when unchanged", () => {
    const state = emptyCoffreSyncState("acc");
    const terms = [term("a", "Zephyrus"), term("b", "ACME", { note: "client" })];
    const first = emitCoffreRecords(terms, state, "dev1");
    expect(first.records).toHaveLength(2);
    expect(first.records.every((r) => r.kind === "coffre")).toBe(true);
    const second = emitCoffreRecords(terms, first.state, "dev1");
    expect(second.records).toHaveLength(0);
  });

  it("emits a tombstone for a locally-deleted term", () => {
    const state = emitCoffreRecords([term("a", "Zephyrus")], emptyCoffreSyncState("acc"), "dev1").state;
    const { records } = emitCoffreRecords([], state, "dev1");
    expect(records).toHaveLength(1);
    expect(records[0].kind).toBe("coffreTombstone");
    expect(records[0].entityId).toBe("cf:a");
  });

  it("round-trips device A → device B (absorb applies the terms)", () => {
    const a = emitCoffreRecords([term("a", "Zephyrus")], emptyCoffreSyncState("acc"), "devA");
    const b = absorbCoffreRecords([], a.records, emptyCoffreSyncState("acc"));
    expect(b.changed).toBe(true);
    expect(b.terms).toHaveLength(1);
    expect(b.terms[0]).toMatchObject({ id: "a", value: "Zephyrus", token: "ORG" });
  });

  it("a local uncommitted edit survives a conflicting remote edit (local wins)", () => {
    // Both devices start converged on v1.
    const v1 = emitCoffreRecords([term("a", "Zephyrus")], emptyCoffreSyncState("acc"), "devA");
    const bBase = absorbCoffreRecords([], v1.records, emptyCoffreSyncState("acc"));
    // A pushes an edit; B edited locally too (uncommitted).
    const aEdit = emitCoffreRecords([term("a", "Zephyrus-X")], v1.state, "devA");
    const localB = [term("a", "Zephyrus-LOCAL")];
    const merged = absorbCoffreRecords(localB, aEdit.records, bBase.state);
    expect(merged.terms[0].value).toBe("Zephyrus-LOCAL"); // re-emits as newest
  });

  it("remote delete removes an unedited local term; an edited one resurrects", () => {
    const v1 = emitCoffreRecords([term("a", "Zephyrus")], emptyCoffreSyncState("acc"), "devA");
    const b = absorbCoffreRecords([], v1.records, emptyCoffreSyncState("acc"));
    const aDel = emitCoffreRecords([], v1.state, "devA");
    // Unedited → deleted.
    const gone = absorbCoffreRecords(b.terms, [...v1.records, ...aDel.records], b.state);
    expect(gone.terms).toHaveLength(0);
    // Edited since base → survives (edit beats delete).
    const edited = [term("a", "Zephyrus-EDIT")];
    const kept = absorbCoffreRecords(edited, [...v1.records, ...aDel.records], b.state);
    expect(kept.terms).toHaveLength(1);
    expect(kept.terms[0].value).toBe("Zephyrus-EDIT");
  });

  it("skips a tampered/foreign payload (fail closed) and strips extras on emit", () => {
    const bad: SyncRecord = {
      recordId: "x",
      entityId: "cf:evil",
      kind: "coffre",
      lamport: 5,
      deviceId: "devX",
      payload: { type: "coffreTerm", item: { id: "evil" } }, // missing value/token
    };
    const out = absorbCoffreRecords([], [bad], emptyCoffreSyncState("acc"));
    expect(out.terms).toHaveLength(0);
    // Emission rebuilds the allow-listed subset only — a local extra never rides.
    const rich = { ...term("a", "Zephyrus"), uses: 42 } as SyncedCoffreTerm & { uses: number };
    const { records } = emitCoffreRecords([rich], emptyCoffreSyncState("acc"), "dev1");
    expect((records[0].payload as { item: Record<string, unknown> }).item.uses).toBeUndefined();
  });

  it("absorb keeps a device-local extra field on an updated term (spread-merge)", () => {
    const v1 = emitCoffreRecords([term("a", "Zephyrus")], emptyCoffreSyncState("acc"), "devA");
    const b = absorbCoffreRecords([], v1.records, emptyCoffreSyncState("acc"));
    const localRich = [{ ...b.terms[0], localFlag: true } as SyncedCoffreTerm & { localFlag: boolean }];
    const aEdit = emitCoffreRecords([term("a", "Zephyrus-2")], v1.state, "devA");
    const merged = absorbCoffreRecords(localRich, [...v1.records, ...aEdit.records], b.state);
    expect(merged.terms[0].value).toBe("Zephyrus-2");
    expect((merged.terms[0] as { localFlag?: boolean }).localFlag).toBe(true);
  });
});
