import { describe, it, expect, beforeEach, vi } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { migrate } from "./schema";

// The CRUD reads its handle from `./connection` module state (opened per account by
// `setDbUser`, which needs Electron's `app`). Swap it for a real in-memory libSQL so the
// round-trip below exercises the ACTUAL SQL — a shape-only assertion would not have
// caught either bug this pins: a field can be typed, saved and still have no column.
let client: Client;
vi.mock("./connection", () => ({ getClient: () => client }));

const { dbLoad, dbSaveConversation } = await import("./conversations");

beforeEach(async () => {
  client = createClient({ url: ":memory:" });
  await migrate(client);
});

/** A conversation with one user message, minus the field under test. */
function conv(messages: any[]) {
  return {
    id: "c1",
    title: "Chat",
    modelId: "gpt-4o",
    createdAt: 1,
    updatedAt: 2,
    messages,
  };
}

describe("garde anti-effacement — un squelette n'écrase jamais des messages stockés", () => {
  // The 13/08 data loss: a conversation WITHOUT messages (state not yet hydrated, sync
  // convMeta applied before load) passed to the mirror executed
  // `DELETE FROM messages WHERE conversation_id = ?` — and destroyed the only copy.
  const full = () =>
    conv([
      { id: "m1", role: "user", content: "question sensible" },
      { id: "m2", role: "assistant", content: "réponse" },
    ]);

  it("une conversation VIDE reçue alors que la base a des messages ne supprime RIEN", async () => {
    await dbSaveConversation({
      ...full(),
      redactionVault: { FAUX1: "vrai1" },
      redactionSalt: 42,
    } as any);
    // The skeleton: same id, zero messages, no vault, no salt.
    await dbSaveConversation({ ...conv([]), title: "Titre re-synchronisé" } as any);

    const c = (await dbLoad())!.conversations[0];
    expect(c.messages.map((m: any) => m.id)).toEqual(["m1", "m2"]);
    // The vault AND the salt survive — a skeleton has neither.
    expect(c.redactionVault).toEqual({ FAUX1: "vrai1" });
    expect(c.redactionSalt).toBe(42);
    // The meta, though, does apply (that's what a convMeta actually carries).
    expect(c.title).toBe("Titre re-synchronisé");
  });

  it("le miroir normal continue de refléter un RETRAIT partiel de messages", async () => {
    await dbSaveConversation(full() as any);
    await dbSaveConversation(conv([{ id: "m1", role: "user", content: "question sensible" }]) as any);
    const c = (await dbLoad())!.conversations[0];
    expect(c.messages.map((m: any) => m.id)).toEqual(["m1"]);
  });

  it("une conversation qui n'a JAMAIS eu de message se sauve normalement", async () => {
    await dbSaveConversation(conv([]) as any);
    const c = (await dbLoad())!.conversations[0];
    expect(c.messages).toEqual([]);
    expect(c.title).toBe("Chat");
  });
});

describe("dbSaveConversation → dbLoad round-trip", () => {
  it("persists a message's compétence — tag AND the instruction snapshot", async () => {
    // The prompt rides the model payload, never `content`, so the tag on the bubble is
    // its only trace. With no column it survived in localStorage until the DB-wins merge
    // overwrote it, and the tag vanished on reload.
    await dbSaveConversation(
      conv([
        {
          id: "m1",
          role: "user",
          content: "Résume ceci",
          competence: { id: "k1", name: "Synthèse", prompt: "Tu es un analyste. Résume." },
        },
      ]) as any,
    );

    const loaded = await dbLoad();
    expect(loaded!.conversations[0].messages[0].competence).toEqual({
      id: "k1",
      name: "Synthèse",
      prompt: "Tu es un analyste. Résume.",
    });
  });

  it("carries the SNAPSHOT, not today's compétence — an edit must not rewrite what a past turn sent", async () => {
    await dbSaveConversation(
      conv([
        { id: "m1", role: "user", content: "a", competence: { id: "k1", name: "V1", prompt: "p1" } },
      ]) as any,
    );
    // The same message re-saved (a later turn appends, the row upserts) keeps ITS snapshot.
    await dbSaveConversation(
      conv([
        { id: "m1", role: "user", content: "a", competence: { id: "k1", name: "V1", prompt: "p1" } },
        { id: "m2", role: "assistant", content: "b" },
      ]) as any,
    );

    const msgs = (await dbLoad())!.conversations[0].messages;
    expect(msgs[0].competence).toEqual({ id: "k1", name: "V1", prompt: "p1" });
    // A message sent without one stays clean — no tag on an ordinary turn.
    expect(msgs[1].competence).toBeUndefined();
  });

  it("persists a turn's REFLECTION — this DB is its only at-rest home", async () => {
    // The plaintext localStorage mirror strips it (real values, unbounded), so with no
    // column the « Réflexion » line would simply not survive a reload.
    await dbSaveConversation(
      conv([
        { id: "m1", role: "user", content: "combien en caisse ?" },
        {
          id: "m2",
          role: "assistant",
          content: "12 340 €.",
          reasoning: "J'additionne les soldes de chaque compte…",
        },
      ]) as any,
    );

    const msgs = (await dbLoad())!.conversations[0].messages;
    expect(msgs[1].reasoning).toBe("J'additionne les soldes de chaque compte…");
    // A turn from a non-reasoning model keeps no empty field behind.
    expect(msgs[0].reasoning).toBeUndefined();
  });

  it("persists an AUTO turn's billing claim — « via votre abonnement » must survive a reload", async () => {
    await dbSaveConversation(
      conv([
        { id: "m1", role: "user", content: "analyse ce dossier" },
        { id: "m2", role: "assistant", content: "voici.", model: "glm-5.2", autoRouted: "metered" },
      ]) as any,
    );

    const msgs = (await dbLoad())!.conversations[0].messages;
    expect(msgs[1].autoRouted).toBe("metered");
    // A manually-picked turn keeps no field behind — absent means "chosen by you".
    expect(msgs[0].autoRouted).toBeUndefined();
  });

  it("survives a corrupt competence blob — drops the tag, never breaks the load", async () => {
    await dbSaveConversation(conv([{ id: "m1", role: "user", content: "a" }]) as any);
    await client.execute("UPDATE messages SET competence = '{not json' WHERE id = 'm1'");

    const loaded = await dbLoad();
    expect(loaded!.conversations[0].messages[0].competence).toBeUndefined();
    expect(loaded!.conversations[0].messages[0].content).toBe("a");
  });
});
