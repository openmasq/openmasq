import { describe, expect, it } from "vitest";
import type { Conversation } from "../types";
import { mergeDbConversations } from "../state/store/dbHydrateMerge";
import { buildWireHistory } from "./buildWire";
import { stripVaultForLocal } from "./sendGuards";

// After a restart the conversation is rebuilt from the plaintext localStorage mirror (which
// never holds `modelContent`, real values) merged under the encrypted DB copy ("DB wins").
// The earlier turn's document must ride the next send again — the DB's `model_content`
// column is what brings it back (round trip: `apps/desktop/src/main/db/resumeState.test.ts`).

const DOC = "Bail entre Ninon Verdolini et la SCI des Lilas, durée trois ans.";
const sent: Conversation = {
  id: "c1",
  title: "Bail",
  modelId: "gpt-4o",
  createdAt: 1,
  updatedAt: 2,
  messages: [
    {
      id: "u1",
      role: "user",
      content: "Résume ce bail.",
      attachments: [{ name: "bail.pdf", kind: "pdf" }],
      // A SENT turn: its redaction completed (`persistUserTurn`), the condition for replay.
      redactions: 2,
      modelContent: `Résume ce bail.\n\n=== Attached file: document-1.pdf ===\n${DOC}`,
    },
    { id: "a1", role: "assistant", content: "Un bail de trois ans." },
  ],
} as Conversation;
const identity = (s: string) => ({ text: s });
const wireOf = (c: Conversation) =>
  buildWireHistory(c.messages, { text: "Et le loyer ?" }, "", undefined, identity)
    .map((m) => (typeof m.content === "string" ? m.content : ""))
    .join("\n");

describe("a reloaded conversation re-sends its earlier document", () => {
  it("the plaintext mirror never holds the payload", () => {
    expect(stripVaultForLocal(sent).messages[0].modelContent).toBeUndefined();
  });

  it("restored from the DB, the next send carries the document again", () => {
    const local = stripVaultForLocal(sent);
    const { merged } = mergeDbConversations([sent], [local]);
    expect(wireOf(merged[0])).toContain(DOC);
  });

  it("without the DB column (the former state), the document silently vanished", () => {
    const local = stripVaultForLocal(sent);
    const { merged } = mergeDbConversations([local], [local]);
    expect(wireOf(merged[0])).not.toContain(DOC);
  });
});
