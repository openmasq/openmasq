import { describe, expect, it } from "vitest";
import type { Conversation } from "../types";
import type { Host } from "../host";
import { DEFAULT_SETTINGS } from "../state/storePersistence";
import { redactRefusedTurn } from "./refusedTurnRedaction";

/**
 * A send refused at the gate (no key, no credits) never reaches the redaction pass —
 * and the bubble stayed in clear under « Clé requise ». This is the pass a refused
 * turn still gets: same engine, same vault, so the bubble carries its spans and the
 * retry reuses the fakes.
 */
const conv = (over: Partial<Conversation> = {}): Conversation =>
  ({
    id: "c1",
    title: "",
    messages: [{ id: "u1", role: "user", at: 1, content: "" }],
    createdAt: 1,
    updatedAt: 1,
    ...over,
  }) as Conversation;

const TEXT = "Rédige un email de remerciement à julien@openmasq.com.";

describe("redactRefusedTurn", () => {
  it("marks the e-mail on the bubble and persists the vault the retry will reuse", async () => {
    let patched: Conversation | null = null;
    await redactRefusedTurn({
      host: {} as Host,
      settings: DEFAULT_SETTINGS,
      conv: conv(),
      text: TEXT,
      userMsgId: "u1",
      patchConversation: (_id, fn) => {
        patched = fn(conv());
      },
    });
    expect(patched).not.toBeNull();
    const c = patched! as Conversation;
    const u = c.messages.find((m) => m.id === "u1")!;
    expect(u.redactions).toBe(1);
    expect(u.redactedSpans?.map((s) => s.value)).toEqual(["julien@openmasq.com"]);
    // The engine also vaults the parts it derives (local part, domain) — the e-mail is among them.
    expect(Object.values(c.redactionVault ?? {})).toContain("julien@openmasq.com");
    expect(c.redactionKinds?.["julien@openmasq.com"]).toBeTruthy();
    expect(c.redactionSalt).toBeTypeOf("number");
    expect(c.redactionKey).toMatch(/^[0-9a-f]{64}$/);
  });

  it("keeps the conversation's own seed and fakes when it already has them", async () => {
    let patched: Conversation | null = null;
    const seeded = conv({ redactionSalt: 42, redactionKey: "ab".repeat(32), redactionMode: "token" });
    await redactRefusedTurn({
      host: {} as Host,
      settings: DEFAULT_SETTINGS,
      conv: seeded,
      text: TEXT,
      userMsgId: "u1",
      patchConversation: (_id, fn) => {
        patched = fn(seeded);
      },
    });
    const c = patched! as Conversation;
    expect(c.redactionSalt).toBe(42);
    expect(c.redactionKey).toBe("ab".repeat(32));
    expect(c.redactionMode).toBe("token");
  });

  it("an empty text patches nothing", async () => {
    let calls = 0;
    await redactRefusedTurn({
      host: {} as Host,
      settings: DEFAULT_SETTINGS,
      conv: conv(),
      text: "   ",
      userMsgId: "u1",
      patchConversation: () => {
        calls++;
      },
    });
    expect(calls).toBe(0);
  });
});
