import { describe, expect, it } from "vitest";
import type { Conversation, Message } from "../../types";
import { DEFAULT_SETTINGS } from "../../state/storePersistence";
import { detectImportedTurns } from "./importedTurns";

// An imported history is masked on import with the pattern rules alone; the on-device
// detector runs over it the first time the conversation goes back to a model.
const NAME = "Kwame Adjei-Boateng";
const imported: Message[] = [
  { id: "imp-gpt-x:m0", role: "user", content: `Rédige une lettre pour ${NAME}.` } as Message,
  { id: "imp-gpt-x:m1", role: "assistant", content: `Voici la lettre pour ${NAME}.` } as Message,
];

function setup(detect: (t: string) => Promise<unknown[]>) {
  const conv = { id: "c", title: "", messages: imported, createdAt: 0, updatedAt: 0 } as Conversation;
  let patched: Conversation = conv;
  let failed = "";
  const ctx = {
    d: {
      host: { detectLocalPii: ({ text }: { text: string }) => detect(text) },
      settings: DEFAULT_SETTINGS,
      orgProfileRef: { current: null },
      patchConversation: (_: string, fn: (c: Conversation) => Conversation) => (patched = fn(patched)),
    },
    conv,
    convId: "c",
    sendAbort: new AbortController(),
    stoppedEarly: () => false,
  };
  const r = { vault: {} as Record<string, string>, redactionSalt: 7, redactionKey: "b".repeat(64), redactionMode: "fake" };
  const failClosed = (reason: string): never => {
    failed = reason;
    throw new Error(reason);
  };
  return { ctx, r, failClosed, get patched() { return patched; }, get failed() { return failed; } };
}

describe("detectImportedTurns", () => {
  it("detects both roles on the first send, marks them, and vaults what it found", async () => {
    const s = setup(async (t) =>
      t.includes(NAME) ? [{ value: NAME, category: "name", score: 0.99 }] : [],
    );
    const out = await detectImportedTurns(s.ctx as never, s.r as never, s.failClosed);
    expect(out?.every((m) => typeof m.redactions === "number")).toBe(true);
    expect(Object.values(s.r.vault)).toContain(NAME);
    expect(s.patched.messages.every((m) => typeof m.redactions === "number")).toBe(true);
  });

  it("blocks the send when the detector did not run — never a replay on the rules alone", async () => {
    const s = setup(async () => {
      throw new Error("onnxruntime: out of memory");
    });
    await expect(detectImportedTurns(s.ctx as never, s.r as never, s.failClosed)).rejects.toThrow();
    expect(s.failed).toBeTruthy();
    expect(s.patched.messages.some((m) => typeof m.redactions === "number")).toBe(false);
  });
});
