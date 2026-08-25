import { createHash } from "node:crypto";
import { describe, it, expect } from "vitest";
import { verifyWeights, type WeightEntry } from "./verify";

const sha256 = (b: Uint8Array): string => createHash("sha256").update(b).digest("hex");

describe("verifyWeights (fail-closed NER integrity pin)", () => {
  const files: Record<string, Uint8Array> = {
    "/m/model.onnx": new TextEncoder().encode("weights-bytes"),
    "/m/config.json": new TextEncoder().encode("{}"),
  };
  const readFile = async (p: string): Promise<Uint8Array> => {
    const b = files[p];
    if (!b) throw new Error("ENOENT");
    return b;
  };
  const entryFor = (p: string): WeightEntry => ({ path: p, sha256: sha256(files[p]) });

  it("passes when every file matches its pinned hash", async () => {
    await expect(
      verifyWeights([entryFor("/m/model.onnx"), entryFor("/m/config.json")], readFile, sha256),
    ).resolves.toBeUndefined();
  });

  it("throws when a file's bytes were tampered (hash mismatch)", async () => {
    const tampered: WeightEntry = { path: "/m/model.onnx", sha256: sha256(new TextEncoder().encode("evil")) };
    await expect(verifyWeights([tampered], readFile, sha256)).rejects.toThrow(/integrity check failed/i);
  });

  it("throws when a pinned file is missing (fail-closed, never silently skipped)", async () => {
    const missing: WeightEntry = { path: "/m/absent.onnx", sha256: "deadbeef" };
    await expect(verifyWeights([missing], readFile, sha256)).rejects.toThrow(/missing or unreadable/i);
  });

  it("accepts an uppercase pinned hash (case-insensitive compare)", async () => {
    const upper: WeightEntry = { path: "/m/config.json", sha256: sha256(files["/m/config.json"]).toUpperCase() };
    await expect(verifyWeights([upper], readFile, sha256)).resolves.toBeUndefined();
  });
});
