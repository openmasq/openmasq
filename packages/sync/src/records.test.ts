import { describe, expect, it } from "vitest";
import {
  clearKekCache,
  createConvKey,
  decryptRecord,
  encryptRecord,
  kekFor,
  openConvKey,
  rewrapConvKey,
} from "./crypto";
import { compareRecords, liveView, mergeRecords, nextLamport } from "./records";
import { createRecordSync } from "./recordClient";
import type {
  ConvKeyEnvelope,
  EncryptedRecord,
  RecordTransport,
  ServerRecord,
  SyncRecord,
} from "./types";
import { INTEGRATIONS_SCOPE } from "./types";

const rec = (over: Partial<SyncRecord>): SyncRecord => ({
  recordId: over.recordId ?? `r-${Math.random().toString(36).slice(2)}`,
  entityId: "m1",
  kind: "message",
  lamport: 1,
  deviceId: "A",
  payload: { text: "hello" },
  ...over,
});

// ---------------------------------------------------------------------------
// Crypto v2 — the KEK/DEK envelope
// ---------------------------------------------------------------------------
describe("conv key envelope (KEK/DEK)", () => {
  it("round-trips: mint → open with the same passphrase → same records decrypt", async () => {
    const { envelope, dek } = await createConvKey("pass-1");
    const blob = await encryptRecord(dek, "c1", "r1", { secret: "IBAN FR14…" });
    const reopened = await openConvKey(envelope, "pass-1");
    expect(await decryptRecord(reopened, "c1", "r1", blob)).toEqual({ secret: "IBAN FR14…" });
  });

  it("a WRONG passphrase cannot open the envelope (GCM auth fails)", async () => {
    const { envelope } = await createConvKey("pass-1");
    await expect(openConvKey(envelope, "wrong")).rejects.toThrow();
  });

  it("ciphertext is bound to (convId, recordId) — the server cannot swap blobs", async () => {
    const { dek } = await createConvKey("pass-1");
    const blob = await encryptRecord(dek, "c1", "r1", { v: 1 });
    await expect(decryptRecord(dek, "c1", "OTHER", blob)).rejects.toThrow();
    await expect(decryptRecord(dek, "OTHER", "r1", blob)).rejects.toThrow();
  });

  it("the encrypted blob never contains the plaintext", async () => {
    const { envelope, dek } = await createConvKey("pass-1");
    const blob = await encryptRecord(dek, "c1", "r1", { name: "Julien Sabourdin" });
    const wire = JSON.stringify({ envelope, blob });
    expect(wire).not.toContain("Julien");
    expect(wire).not.toContain("Sabourdin");
  });

  it("passphrase change re-wraps the DEK: new passphrase opens, old no longer does, records survive", async () => {
    const { envelope, dek } = await createConvKey("old-pass");
    const blob = await encryptRecord(dek, "c1", "r1", { keep: "me" });
    const next: ConvKeyEnvelope = await rewrapConvKey(envelope, "old-pass", "new-pass");
    const reopened = await openConvKey(next, "new-pass");
    expect(await decryptRecord(reopened, "c1", "r1", blob)).toEqual({ keep: "me" }); // history untouched
    await expect(openConvKey(next, "old-pass")).rejects.toThrow();
  });
});

// ---------------------------------------------------------------------------
// Merge semantics
// ---------------------------------------------------------------------------
describe("mergeRecords / liveView", () => {
  it("unions messages by entity and dedupes an idempotent re-push (same recordId)", () => {
    const a = rec({ recordId: "r1", entityId: "m1" });
    const b = rec({ recordId: "r2", entityId: "m2", lamport: 2 });
    const merged = mergeRecords([a, b], [a]);
    expect(merged.map((r) => r.entityId)).toEqual(["m1", "m2"]);
  });

  it("convMeta is LWW by (lamport, deviceId) — Lamport clock, never wall clock", () => {
    const older = rec({ recordId: "r1", kind: "convMeta", entityId: "meta", lamport: 3, deviceId: "B", payload: { title: "old" } });
    const newer = rec({ recordId: "r2", kind: "convMeta", entityId: "meta", lamport: 5, deviceId: "A", payload: { title: "new" } });
    const { meta } = liveView(mergeRecords([older], [newer]));
    expect((meta!.payload as { title: string }).title).toBe("new");
  });

  it("a convTombstone deletes the whole conversation", () => {
    const msg = rec({ recordId: "r1" });
    const tomb = rec({ recordId: "r2", kind: "convTombstone", entityId: "conv", lamport: 9 });
    expect(liveView(mergeRecords([msg], [tomb])).deleted).toBe(true);
  });

  it("an integrationTombstone removes the integration — unless a NEWER reconnect resurrects it", () => {
    const gmail = rec({ recordId: "r1", kind: "integration", entityId: "gmail", lamport: 2 });
    const tomb = rec({ recordId: "r2", kind: "integrationTombstone", entityId: "gmail", lamport: 5 });
    expect(liveView(mergeRecords([gmail], [tomb])).integrations).toHaveLength(0);
    const reconnect = rec({ recordId: "r3", kind: "integration", entityId: "gmail", lamport: 7 });
    expect(liveView(mergeRecords([gmail, tomb], [reconnect])).integrations).toHaveLength(1);
  });

  it("message order is deterministic across devices (lamport, then deviceId)", () => {
    const a = rec({ recordId: "r1", entityId: "m1", lamport: 2, deviceId: "B" });
    const b = rec({ recordId: "r2", entityId: "m2", lamport: 2, deviceId: "A" });
    const c = rec({ recordId: "r3", entityId: "m3", lamport: 1, deviceId: "Z" });
    const forward = liveView(mergeRecords([a, b], [c])).messages.map((r) => r.entityId);
    const reverse = liveView(mergeRecords([c], [b, a])).messages.map((r) => r.entityId);
    expect(forward).toEqual(["m3", "m2", "m1"]);
    expect(reverse).toEqual(forward);
  });

  it("nextLamport advances past everything observed", () => {
    expect(nextLamport([rec({ lamport: 7 })], 3)).toBe(8);
    expect(nextLamport([], 3)).toBe(4);
    expect(compareRecords(rec({ lamport: 1, deviceId: "A" }), rec({ lamport: 1, deviceId: "B" }))).toBeLessThan(0);
  });
});

// ---------------------------------------------------------------------------
// Two-device flow over an in-memory transport (the server: ciphertext only)
// ---------------------------------------------------------------------------
function fakeTransport() {
  const keys = new Map<string, ConvKeyEnvelope>();
  const rows = new Map<string, ServerRecord[]>();
  let global = 0;
  const transport: RecordTransport = {
    async listChangedConvs(since) {
      void since;
      return { convIds: [...rows.keys()], cursor: global };
    },
    async getRecords(convId, since) {
      const all = rows.get(convId) ?? [];
      const out = all.filter((r) => r.seq > since);
      return { records: out, seq: all.length ? all[all.length - 1].seq : since };
    },
    async putRecords(convId, records: EncryptedRecord[]) {
      const all = rows.get(convId) ?? [];
      for (const r of records) {
        if (all.some((x) => x.recordId === r.recordId)) continue; // idempotent
        all.push({ ...r, seq: all.length + 1 });
        global++;
      }
      rows.set(convId, all);
      return all.length ? all[all.length - 1].seq : 0;
    },
    async getConvKey(convId) {
      return keys.get(convId) ?? null;
    },
    async putConvKey(convId, envelope, replace) {
      const cur = keys.get(convId);
      if (cur && !replace) return cur; // first writer wins
      keys.set(convId, envelope);
      return envelope;
    },
    async listConvKeys() {
      return [...keys.keys()];
    },
    async deleteConv(convId) {
      keys.delete(convId);
      rows.delete(convId);
    },
  };
  return { transport, dump: () => JSON.stringify({ keys: [...keys], rows: [...rows] }) };
}

describe("createRecordSync — two devices", () => {
  it("A pushes, B pulls+decrypts with the same passphrase; the server never saw plaintext", async () => {
    const { transport, dump } = fakeTransport();
    const A = createRecordSync({ transport, getPassphrase: () => "shared-pass" });
    const B = createRecordSync({ transport, getPassphrase: () => "shared-pass" });

    const pushed = await A.push("conv-1", [
      rec({ recordId: "r1", entityId: "m1", payload: { text: "mon IBAN est FR14 2004 1010" } }),
      rec({ recordId: "r2", kind: "convMeta", entityId: "meta", payload: { title: "Achat maison" } }),
    ]);
    expect(pushed).toBe(2);
    expect(dump()).not.toContain("IBAN");
    expect(dump()).not.toContain("Achat");

    const { records, seq } = await B.pull("conv-1", 0);
    expect(seq).toBe(2);
    const view = liveView(mergeRecords([], records));
    expect((view.messages[0].payload as { text: string }).text).toContain("FR14 2004 1010");
    expect((view.meta!.payload as { title: string }).title).toBe("Achat maison");
  });

  it("a device with the WRONG passphrase pulls NOTHING (degrades, never corrupts)", async () => {
    const { transport } = fakeTransport();
    const A = createRecordSync({ transport, getPassphrase: () => "right" });
    await A.push("conv-1", [rec({ recordId: "r1" })]);
    const evil = createRecordSync({ transport, getPassphrase: () => "wrong" });
    const { records } = await evil.pull("conv-1", 0);
    expect(records).toEqual([]);
  });

  it("no passphrase → sync is OFF (push/pull no-op)", async () => {
    const { transport } = fakeTransport();
    const off = createRecordSync({ transport, getPassphrase: () => null });
    expect(await off.push("conv-1", [rec({})])).toBe(0);
    expect((await off.pull("conv-1", 0)).records).toEqual([]);
  });

  it("concurrent key provisioning: the second device adopts the first's envelope (one DEK per conv)", async () => {
    const { transport } = fakeTransport();
    const A = createRecordSync({ transport, getPassphrase: () => "pass" });
    const B = createRecordSync({ transport, getPassphrase: () => "pass" });
    await A.push("conv-1", [rec({ recordId: "rA", entityId: "mA" })]);
    await B.push("conv-1", [rec({ recordId: "rB", entityId: "mB" })]);
    const { records } = await A.pull("conv-1", 0);
    expect(records.map((r) => r.entityId).sort()).toEqual(["mA", "mB"]); // both decrypt → one shared DEK
  });

  it("integrations directory rides the reserved scope", async () => {
    const { transport } = fakeTransport();
    const A = createRecordSync({ transport, getPassphrase: () => "pass" });
    await A.pushIntegrations([
      rec({ recordId: "r1", kind: "integration", entityId: "gmail", payload: { account: "t@x.fr" } }),
    ]);
    const { records } = await A.pullIntegrations(0);
    expect(records).toHaveLength(1);
    expect((await transport.getRecords(INTEGRATIONS_SCOPE, 0)).records).toHaveLength(1);
  });

  it("rewrapAllKeys: after a passphrase change the NEW passphrase reads every conv, the old none", async () => {
    const { transport } = fakeTransport();
    const A = createRecordSync({ transport, getPassphrase: () => "old" });
    await A.push("conv-1", [rec({ recordId: "r1", payload: { text: "x" } })]);
    await A.push("conv-2", [rec({ recordId: "r2", payload: { text: "y" } })]);

    const done = await A.rewrapAllKeys("old", "new");
    expect(done.sort()).toEqual(["conv-1", "conv-2"]);

    const fresh = createRecordSync({ transport, getPassphrase: () => "new" });
    expect((await fresh.pull("conv-1", 0)).records).toHaveLength(1);
    const stale = createRecordSync({ transport, getPassphrase: () => "old" });
    expect((await stale.pull("conv-1", 0)).records).toEqual([]);
  });
});

/**
 * The decryption CIRCUIT-BREAKER (`dekFor`). A passphrase that doesn't open the envelope won't
 * open it any better on the next attempt: without a stop, every cycle retried and
 * re-reported without moving anything forward (24 reports in a few hours for two devices,
 * 14/08, `@integrations` scope). These cases hold the three halves that matter: we no longer
 * retry, we report only once, and a corrected passphrase reopens the door.
 */
describe("createRecordSync — une portée qui ne s'ouvre pas est scellée, pas martelée", () => {
  it("signale UNE fois et cesse d'appeler le serveur, quel que soit le nombre d'essais", async () => {
    const { transport } = fakeTransport();
    const right = createRecordSync({ transport, getPassphrase: () => "right" });
    await right.push("conv-1", [rec({ recordId: "r1" })]);

    let keyReads = 0;
    const counted = {
      ...transport,
      getConvKey: async (convId: string) => {
        keyReads++;
        return transport.getConvKey(convId);
      },
    };
    const errors: string[] = [];
    const wrong = createRecordSync({
      transport: counted,
      getPassphrase: () => "wrong",
      onError: (scope) => errors.push(scope),
    });

    for (let i = 0; i < 5; i++) await wrong.pull("conv-1", 0);
    await wrong.push("conv-1", [rec({ recordId: "r2" })]);

    expect(errors).toEqual(["dekFor(conv-1)"]); // once, not six
    expect(keyReads).toBe(1); // and the server is no longer hit for nothing
  });

  it("le sceau est PAR PORTÉE — une autre conversation reste tentée", async () => {
    const { transport } = fakeTransport();
    const right = createRecordSync({ transport, getPassphrase: () => "right" });
    await right.push("conv-1", [rec({ recordId: "r1" })]);
    await right.push("conv-2", [rec({ recordId: "r2" })]);

    const errors: string[] = [];
    const wrong = createRecordSync({
      transport,
      getPassphrase: () => "wrong",
      onError: (scope) => errors.push(scope),
    });
    await wrong.pull("conv-1", 0);
    await wrong.pull("conv-1", 0);
    await wrong.pull("conv-2", 0);
    expect(errors).toEqual(["dekFor(conv-1)", "dekFor(conv-2)"]);
  });

  it("`resetKeys()` rouvre la porte — sinon corriger sa phrase n'aurait aucun effet", async () => {
    const { transport } = fakeTransport();
    const right = createRecordSync({ transport, getPassphrase: () => "right" });
    await right.push("conv-1", [rec({ recordId: "r1" })]);

    let pass = "wrong";
    const device = createRecordSync({ transport, getPassphrase: () => pass });
    expect((await device.pull("conv-1", 0)).records).toEqual([]);

    pass = "right"; // the passphrase is fixed…
    expect((await device.pull("conv-1", 0)).records).toEqual([]); // …but the scope is sealed
    device.resetKeys();
    expect((await device.pull("conv-1", 0)).records).toHaveLength(1);
  });

  // The KEK cache is keyed by the PLAINTEXT passphrase and holds a usable CryptoKey —
  // the very material the passphrase exists to gate. Nothing cleared it, so it outlived
  // sign-out, « Désactiver la synchronisation » and an account switch: the previous
  // account's key stayed resident and kept opening its envelopes for the whole process.
  it("`clearKekCache()` oublie la clé dérivée — elle ne survit pas à sa phrase", async () => {
    clearKekCache();
    const salt = (await createConvKey("phrase-a")).envelope.kekSalt;
    const premier = kekFor("phrase-a", salt);
    // Même (phrase, sel) ⇒ la MÊME dérivation réutilisée : c'est ce que le cache achète.
    expect(kekFor("phrase-a", salt)).toBe(premier);
    clearKekCache();
    expect(kekFor("phrase-a", salt)).not.toBe(premier);
    // …et la clé re-dérivée reste utilisable (on vide un cache, on ne casse rien).
    expect((await kekFor("phrase-a", salt)).algorithm).toEqual((await premier).algorithm);
  });

  it("`resetKeys()` vide AUSSI le cache de KEK (déconnexion, changement de compte)", async () => {
    const { transport } = fakeTransport();
    clearKekCache();
    const salt = (await createConvKey("phrase-b")).envelope.kekSalt;
    const avant = kekFor("phrase-b", salt);
    createRecordSync({ transport, getPassphrase: () => "phrase-b" }).resetKeys();
    expect(kekFor("phrase-b", salt)).not.toBe(avant);
  });

  it("un échec RÉSEAU n'est PAS scellé — lui mérite un retour", async () => {
    const { transport } = fakeTransport();
    let reads = 0;
    const flaky = {
      ...transport,
      getConvKey: async () => {
        reads++;
        throw new Error("fetch failed");
      },
    };
    const errors: string[] = [];
    const device = createRecordSync({
      transport: flaky,
      getPassphrase: () => "right",
      onError: (scope) => errors.push(scope),
    });
    await device.pull("conv-1", 0);
    await device.pull("conv-1", 0);
    expect(reads).toBe(2);
    expect(errors).toHaveLength(2);
  });
});
