import { describe, expect, it } from "vitest";
import {
  applyIntegrationRecords,
  emitIntegrationRecords,
  emptyIntegrationSyncState,
  type SyncedIntegration,
} from "./integrations";

const gmail: SyncedIntegration = {
  id: "gmail-1",
  connectorId: "gmail",
  name: "Gmail",
  kind: "local-oauth",
  label: "julien@exemple.fr",
};

describe("emitIntegrationRecords", () => {
  it("emits one record per connected integration, then nothing while unchanged", () => {
    const first = emitIntegrationRecords([gmail], emptyIntegrationSyncState("acc"), "dev-A");
    expect(first.records.map((r) => r.kind)).toEqual(["integration"]);
    const again = emitIntegrationRecords([gmail], first.state, "dev-A");
    expect(again.records).toEqual([]);
  });

  it("SECURITY: the payload is ALLOW-LISTED — url/apiKey/token can never ride along", () => {
    const leaky = { ...gmail, url: "https://x?key=SECRET", apiKey: "sk-123", token: "t" };
    const { records } = emitIntegrationRecords(
      [leaky as SyncedIntegration],
      emptyIntegrationSyncState("acc"),
      "dev-A",
    );
    const wire = JSON.stringify(records[0].payload);
    expect(wire).not.toContain("SECRET");
    expect(wire).not.toContain("sk-123");
    expect(records[0].payload).toEqual({
      id: "gmail-1",
      connectorId: "gmail",
      name: "Gmail",
      kind: "local-oauth",
      label: "julien@exemple.fr",
    });
  });

  it("a disconnect emits a tombstone; a later re-connect resurrects the entry", () => {
    const first = emitIntegrationRecords([gmail], emptyIntegrationSyncState("acc"), "dev-A");
    const gone = emitIntegrationRecords([], first.state, "dev-A");
    expect(gone.records.map((r) => r.kind)).toEqual(["integrationTombstone"]);
    const back = emitIntegrationRecords([gmail], gone.state, "dev-A");
    expect(back.records.map((r) => r.kind)).toEqual(["integration"]);
    // The receiving side: connect → disconnect → reconnect ⇒ the entry is LIVE.
    const all = [...first.records, ...gone.records, ...back.records];
    expect(applyIntegrationRecords(all).map((i) => i.id)).toEqual(["gmail-1"]);
    // …whereas stopping at the tombstone leaves it deleted.
    expect(applyIntegrationRecords([...first.records, ...gone.records])).toEqual([]);
  });

  it("a label change (new account email) re-emits with LWW semantics", () => {
    const first = emitIntegrationRecords([gmail], emptyIntegrationSyncState("acc"), "dev-A");
    const relabeled = { ...gmail, label: "pro@exemple.fr" };
    const second = emitIntegrationRecords([relabeled], first.state, "dev-A");
    expect(second.records).toHaveLength(1);
    const live = applyIntegrationRecords([...first.records, ...second.records]);
    expect(live).toHaveLength(1);
    expect(live[0].label).toBe("pro@exemple.fr");
  });
});
