import { describe, it, expect, beforeEach, vi } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { migrate } from "./schema";

// What the plaintext localStorage mirror STRIPS (`packages/ui/src/send/sendGuards.ts`
// `stripVaultForLocal`) must come back from this DB, or a restart loses it in silence: the
// model stopped seeing every earlier document, a crashed agentic turn could not resume, the
// compaction recap and the files' spans vanished. Real in-memory libSQL: a field can be
// typed, saved and still have no column — only the round trip shows it.
let client: Client;
vi.mock("./connection", () => ({ getClient: () => client }));

const { dbLoad, dbSaveConversation } = await import("./conversations");

beforeEach(async () => {
  client = createClient({ url: ":memory:" });
  await migrate(client);
});

const DOC = "Bail entre Ninon Verdolini et la SCI des Lilas, 12 rue des Fleurs.";
const conv = (over: Record<string, unknown> = {}) => ({
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
      modelContent: `Résume ce bail.\n\n=== Attached file: document-1.pdf ===\n${DOC}`,
    },
    { id: "a1", role: "assistant", content: "Un bail de trois ans." },
  ],
  ...over,
});
const loaded = async () => (await dbLoad())!.conversations[0];

describe("messages.model_content — a turn's model payload survives a restart", () => {
  it("round-trips the WHOLE payload, documents included; absent stays absent", async () => {
    await dbSaveConversation(conv() as never);
    const c = await loaded();
    expect(c.messages[0].modelContent).toContain(DOC);
    expect(c.messages[1].modelContent).toBeUndefined();
  });

  it("a document far past the former 50,000-character cut comes back whole", async () => {
    const big = "x".repeat(200_000) + DOC;
    const c0 = conv();
    (c0.messages[0] as { modelContent: string }).modelContent = big;
    await dbSaveConversation(c0 as never);
    expect((await loaded()).messages[0].modelContent).toBe(big);
  });
});

describe("conversation state the mirror strips is restored from here", () => {
  const state = {
    contextSummary: { throughTurn: 4, text: "Récapitulatif : bail de Personne-A.", at: 5, model: "gpt-4o" },
    turnCheckpoint: { turnId: "t1", at: 6, messages: [{ role: "user", content: "wire" }] },
    fileRedactions: [{ name: "bail.pdf", spans: [{ value: "Ninon Verdolini", kind: "name" }], at: 7 }],
  };

  it("round-trips the recap, the checkpoint and the files' spans", async () => {
    await dbSaveConversation(conv(state) as never);
    expect(await loaded()).toMatchObject(state);
  });

  it("a settled turn CLEARS its checkpoint (saved absent ⇒ read absent)", async () => {
    await dbSaveConversation(conv(state) as never);
    await dbSaveConversation(conv({ ...state, turnCheckpoint: undefined }) as never);
    expect((await loaded()).turnCheckpoint).toBeUndefined();
  });

  it("a SKELETON save keeps them (anti-erasure, like the vault and the salt)", async () => {
    await dbSaveConversation(conv(state) as never);
    await dbSaveConversation({ ...conv(), messages: [] } as never);
    const c = await loaded();
    expect(c).toMatchObject(state);
    expect(c.messages[0].modelContent).toContain(DOC);
  });

  it("a corrupt JSON column is dropped, never a broken load", async () => {
    await dbSaveConversation(conv() as never);
    await client.execute("UPDATE conversations SET context_summary = '{oops', turn_checkpoint = '[]', file_redactions = '{}'");
    const c = await loaded();
    expect(c.contextSummary).toBeUndefined();
    expect(c.turnCheckpoint).toBeUndefined();
    expect(c.fileRedactions).toBeUndefined();
    expect(c.messages).toHaveLength(2);
  });
});
