// A vault blob must only decrypt under the thread it was written for.
//
// Without the binding, the server chooses which blob answers which request: it can serve
// conversation A's vault for a read of B. Same account, same passphrase, so it decrypts
// and merges — and A's real values are then substituted back into B's replies and ride
// B's next forward pass. Encryption alone does not prevent that; authenticating the
// CONTEXT does. The record channel bound this way from the start (`recordAad`); the
// vault blob did not, and this pins the fix.
import { describe, it, expect } from "vitest";
import { encryptVault, decryptVault } from "./crypto";
import type { VaultPayload } from "./types";

const payload = (): VaultPayload => ({
  redactionVault: { "Jean Dupont": "Simon Cros" },
  redactionKinds: {},
  updatedAt: 1,
});

describe("vault blobs are bound to their thread", () => {
  const pass = "correct horse battery staple";

  it("round-trips under the thread it was written for", async () => {
    const blob = await encryptVault(payload(), pass, "thread-A");
    expect(blob.v).toBe(2);
    await expect(decryptVault(blob, pass, "thread-A")).resolves.toMatchObject({
      redactionVault: { "Jean Dupont": "Simon Cros" },
    });
  });

  it("refuses to decrypt when the server swaps it onto another thread", async () => {
    const blob = await encryptVault(payload(), pass, "thread-A");
    await expect(decryptVault(blob, pass, "thread-B")).rejects.toThrow();
  });

  it("still refuses under the right thread but the wrong passphrase", async () => {
    const blob = await encryptVault(payload(), pass, "thread-A");
    await expect(decryptVault(blob, "wrong", "thread-A")).rejects.toThrow();
  });

  it("keeps reading legacy unbound blobs (v:1) so nothing needs migrating", async () => {
    const legacy = await encryptVault(payload(), pass); // no threadId ⇒ v:1
    expect(legacy.v).toBe(1);
    await expect(decryptVault(legacy, pass, "thread-A")).resolves.toMatchObject({
      redactionVault: { "Jean Dupont": "Simon Cros" },
    });
  });
});
