import { describe, expect, it } from "vitest";
import {
  absorbUserdataRecords,
  emitUserdataRecords,
  emptyUserdataSyncState,
  snapshotOfSettings,
  settingsPatchOf,
  type SyncedSkill,
  type UserdataSnapshot,
} from "./userdata";
import type { SyncRecord } from "./types";

const comp = (over: Partial<SyncedSkill> = {}): SyncedSkill => ({
  id: "c1",
  name: "Réponse e-mail pro",
  prompt: "Rédige une réponse claire.",
  cat: "redaction",
  createdAt: 1,
  ...over,
});

const snap = (over: Partial<UserdataSnapshot> = {}): UserdataSnapshot => ({
  competences: [],
  workflows: [],
  memoryCards: [],
  ...over,
});

describe("emitUserdataRecords", () => {
  it("emits allow-listed records for new entities, nothing when unchanged", () => {
    const local = snap({
      competences: [comp()],
      workflows: [{ id: "w1", name: "Triage", prompt: "fais {x}", servers: ["github"], createdAt: 2 }],
      memoryCards: [{ id: "m1", entity: "Alice Rebour", cat: "personne", facts: "préfère le tutoiement", createdAt: 3, updatedAt: 3 }],
      memoryProfile: "Je suis dev.",
    });
    const a = emitUserdataRecords(local, emptyUserdataSyncState("u1"), "devA");
    expect(a.records.map((r) => r.kind)).toEqual(["userdata", "userdata", "userdata", "userdata"]);
    expect(a.records.map((r) => r.entityId).sort()).toEqual(["cmp:c1", "mem:m1", "profile", "wf:w1"]);
    // Idempotent: same snapshot + advanced ledger → nothing to emit.
    const b = emitUserdataRecords(local, a.state, "devA");
    expect(b.records).toHaveLength(0);
  });

  it("never leaks non-allow-listed fields (uses, tokens, anything extra)", () => {
    const rich = { ...comp(), uses: 12, secretToken: "sk-REAL", apiKey: "leak" } as SyncedSkill;
    const { records } = emitUserdataRecords(snap({ competences: [rich] }), emptyUserdataSyncState("u1"), "devA");
    const payload = JSON.stringify(records[0].payload);
    expect(payload).not.toContain("uses");
    expect(payload).not.toContain("sk-REAL");
    expect(payload).not.toContain("leak");
    expect(payload).toContain("Réponse e-mail pro");
  });

  it("tombstones a locally deleted entity, then forgets it", () => {
    const s0 = emptyUserdataSyncState("u1");
    const withIt = emitUserdataRecords(snap({ competences: [comp()] }), s0, "devA");
    const gone = emitUserdataRecords(snap(), withIt.state, "devA");
    expect(gone.records).toHaveLength(1);
    expect(gone.records[0].kind).toBe("userdataTombstone");
    expect(gone.records[0].entityId).toBe("cmp:c1");
    expect(emitUserdataRecords(snap(), gone.state, "devA").records).toHaveLength(0);
  });
});

describe("absorbUserdataRecords", () => {
  const emitted = (s: UserdataSnapshot, device = "devA") =>
    emitUserdataRecords(s, emptyUserdataSyncState("u1"), device).records;

  it("applies remote additions and aligns the ledger (no echo re-emit)", () => {
    const pulled = emitted(snap({ competences: [comp()], memoryProfile: "Profil." }));
    const r = absorbUserdataRecords(snap(), pulled, emptyUserdataSyncState("u1"));
    expect(r.changed).toBe(true);
    expect(r.snapshot.competences).toHaveLength(1);
    expect(r.snapshot.memoryProfile).toBe("Profil.");
    // Absorbed content must NOT bounce back out on the next emit.
    expect(emitUserdataRecords(r.snapshot, r.state, "devB").records).toHaveLength(0);
  });

  it("remote edit wins when local is unchanged; LOCAL wins when both edited", () => {
    // Device B starts in sync with c1.
    const base = absorbUserdataRecords(snap(), emitted(snap({ competences: [comp()] })), emptyUserdataSyncState("u1"));
    // Remote (A) renames.
    const renamed = emitUserdataRecords(
      snap({ competences: [comp({ name: "Renommée" })] }),
      base.state, // same sig base — A's second emit
      "devA",
    ).records;
    const clean = absorbUserdataRecords(base.snapshot, renamed, base.state);
    expect(clean.snapshot.competences[0].name).toBe("Renommée");

    // Same remote edit, but B ALSO edited locally → B's edit survives.
    const localEdit = snap({ competences: [{ ...comp(), prompt: "édition locale" }] });
    const conflicted = absorbUserdataRecords(localEdit, renamed, base.state);
    expect(conflicted.snapshot.competences[0].prompt).toBe("édition locale");
    expect(conflicted.snapshot.competences[0].name).toBe(comp().name);
    // And it re-emits (ledger stayed at base for that entity).
    const reemit = emitUserdataRecords(conflicted.snapshot, conflicted.state, "devB");
    expect(reemit.records.map((r) => r.entityId)).toEqual(["cmp:c1"]);
    // With a lamport ABOVE anything pulled, so it wins the merge everywhere.
    expect(reemit.records[0].lamport).toBeGreaterThan(Math.max(...renamed.map((r) => r.lamport)));
  });

  it("applies a remote delete when local is unchanged; an edited entity survives it", () => {
    const base = absorbUserdataRecords(snap(), emitted(snap({ competences: [comp()] })), emptyUserdataSyncState("u1"));
    // Remote deletes c1.
    const st = emitUserdataRecords(snap({ competences: [comp()] }), emptyUserdataSyncState("u1"), "devA").state;
    const dele = emitUserdataRecords(snap(), st, "devA").records;

    const gone = absorbUserdataRecords(base.snapshot, [...emitted(snap({ competences: [comp()] })), ...dele], base.state);
    expect(gone.snapshot.competences).toHaveLength(0);
    expect(emitUserdataRecords(gone.snapshot, gone.state, "devB").records).toHaveLength(0);

    const edited = snap({ competences: [{ ...comp(), prompt: "gardée" }] });
    const survived = absorbUserdataRecords(edited, [...emitted(snap({ competences: [comp()] })), ...dele], base.state);
    expect(survived.snapshot.competences).toHaveLength(1);
    expect(survived.snapshot.competences[0].prompt).toBe("gardée");
  });

  it("preserves device-local extra fields (uses) through a remote update", () => {
    const localRich = snap({ competences: [{ ...comp(), uses: 7 } as SyncedSkill] });
    const st = emitUserdataRecords(snap({ competences: [comp()] }), emptyUserdataSyncState("u1"), "devB").state;
    const renamed = emitUserdataRecords(snap({ competences: [comp({ name: "V2" })] }), st, "devA").records;
    const r = absorbUserdataRecords(localRich, renamed, st);
    expect(r.snapshot.competences[0].name).toBe("V2");
    expect((r.snapshot.competences[0] as { uses?: number }).uses).toBe(7);
  });

  it("skips malformed / non-allow-listed payloads (fail closed)", () => {
    const bad: SyncRecord[] = [
      { recordId: "x1", entityId: "cmp:evil", kind: "userdata", lamport: 9, deviceId: "d", payload: { type: "competence", item: { id: "evil" } } },
      { recordId: "x2", entityId: "profile", kind: "userdata", lamport: 10, deviceId: "d", payload: { type: "memoryProfile", profile: 42 } },
      { recordId: "x3", entityId: "wf:mismatch", kind: "userdata", lamport: 11, deviceId: "d", payload: { type: "workflow", item: { id: "other", name: "n", prompt: "p", createdAt: 1, servers: [] } } },
    ];
    const r = absorbUserdataRecords(snap(), bad, emptyUserdataSyncState("u1"));
    expect(r.changed).toBe(false);
    expect(r.snapshot.competences).toHaveLength(0);
    expect(r.snapshot.workflows).toHaveLength(0);
    expect(r.snapshot.memoryProfile).toBeUndefined();
  });

  it("two devices converge (A emits, B absorbs+edits, A absorbs back)", () => {
    const a0 = emitUserdataRecords(snap({ competences: [comp()] }), emptyUserdataSyncState("u1"), "devA");
    const b0 = absorbUserdataRecords(snap(), a0.records, emptyUserdataSyncState("u1"));
    const bEdit: UserdataSnapshot = { ...b0.snapshot, competences: [{ ...b0.snapshot.competences[0], name: "B-edit" }] };
    const b1 = emitUserdataRecords(bEdit, b0.state, "devB");
    const aBack = absorbUserdataRecords(snap({ competences: [comp()] }), [...a0.records, ...b1.records], a0.state);
    expect(aBack.snapshot.competences[0].name).toBe("B-edit");
    expect(emitUserdataRecords(aBack.snapshot, aBack.state, "devA").records).toHaveLength(0);
  });
});

/**
 * THE MERGE ROUND-TRIP — the app now has only ONE list, the envelope still keeps TWO.
 *
 * This is what decides whether a device still on an older version keeps
 * seeing its routines: they must go out in the `wf:` compartment, without which it would
 * read nothing for them; and they must come back MERGED, without which the
 * single list would duplicate on every sync.
 */
describe("fusion compétences ⇄ routines : la répartition du fil", () => {
  const prose = { id: "c1", name: "Relecture", prompt: "p", cat: "redaction", createdAt: 1 };
  const routine = {
    id: "w1",
    name: "Revue de PR",
    prompt: "p",
    cat: "routine",
    servers: ["github"],
    createdAt: 2,
  };

  it("répartit à l'émission : `servers` non vide ⇒ le compartiment que l'ancien lit", () => {
    const snap = snapshotOfSettings({ competences: [prose, routine] });
    expect(snap.competences.map((c) => c.id)).toEqual(["c1"]);
    expect(snap.workflows.map((w) => w.id)).toEqual(["w1"]);
    // Without this the routine would arrive on the other device WITHOUT its connectors,
    // i.e. no longer doing anything (`cleanCompetence` doesn't emit `servers`).
    expect(snap.workflows[0].servers).toEqual(["github"]);
  });

  it("refusionne à la réception, et ne réécrit jamais l'ancien champ local", () => {
    const patch = settingsPatchOf(snapshotOfSettings({ competences: [prose, routine] }));
    expect(patch.competences.map((c) => c.id).sort()).toEqual(["c1", "w1"]);
    expect(patch.workflows).toEqual([]);
  });

  it("un blob ANCIEN (les deux champs remplis) ne compte pas deux fois la même entrée", () => {
    const snap = snapshotOfSettings({ competences: [routine], workflows: [routine] });
    expect(snap.workflows.map((w) => w.id)).toEqual(["w1"]);
    expect(snap.competences).toEqual([]);
  });

  it("une routine venue d'un appareil ANCIEN (sans `cat`) se range en « Routines »", () => {
    const patch = settingsPatchOf({
      competences: [],
      workflows: [{ id: "w9", name: "R", prompt: "p", servers: ["gmail"], createdAt: 3 }],
      memoryCards: [],
    });
    expect(patch.competences[0].cat).toBe("routine");
  });
});
