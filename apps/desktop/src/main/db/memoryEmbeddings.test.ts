import { describe, it, expect, beforeEach, vi } from "vitest";
import { createClient, type Client } from "@libsql/client";
import { migrate, MEMORY_EMBED_DIM } from "./schema";
import { BRAND } from "@openmasq/branding";

// Real in-memory libSQL (same rationale as conversations.test.ts): the vector32()/
// vector_distance_cos round-trip must exercise the ACTUAL SQL.
let client: Client;
vi.mock("./connection", () => ({ getClient: () => client }));

const {
  upsertMemoryEmbedding,
  memoryEmbeddingStatus,
  pruneMemoryEmbeddings,
  searchMemoryEmbeddings,
} = await import("./memoryEmbeddings");

beforeEach(async () => {
  client = createClient({ url: ":memory:" });
  await migrate(client);
});

/** A unit basis vector — cosine distance to itself 0, to an orthogonal one 1. */
const basis = (i: number): number[] => {
  const v = new Array(MEMORY_EMBED_DIM).fill(0);
  v[i] = 1;
  return v;
};
const MODEL = `${BRAND.hfOrg}/multilingual-e5-small@q8`;

describe("memory_embeddings round-trip", () => {
  it("upsert is idempotent per card — an edited card REPLACES its row, never duplicates", async () => {
    await upsertMemoryEmbedding({ cardId: "c1", model: MODEL, textHash: "h1", vector: basis(0) });
    await upsertMemoryEmbedding({ cardId: "c1", model: MODEL, textHash: "h2", vector: basis(1) });
    const status = await memoryEmbeddingStatus();
    expect(status).toEqual([{ cardId: "c1", model: MODEL, textHash: "h2" }]);
  });

  it("search ranks by cosine distance and only ever matches the SAME embedder", async () => {
    await upsertMemoryEmbedding({ cardId: "near", model: MODEL, textHash: "h", vector: basis(0) });
    await upsertMemoryEmbedding({ cardId: "far", model: MODEL, textHash: "h", vector: basis(1) });
    await upsertMemoryEmbedding({ cardId: "other-model", model: "old@fp32", textHash: "h", vector: basis(0) });

    const hits = await searchMemoryEmbeddings(basis(0), MODEL, 5);
    expect(hits.map((h) => h.cardId)).toEqual(["near", "far"]); // never "other-model"
    expect(hits[0].distance).toBeCloseTo(0, 5);
    expect(hits[1].distance).toBeGreaterThan(0.5);
  });

  it("prune drops every card NOT kept (deleted card ⇒ no vector of its PII survives); empty keep wipes", async () => {
    await upsertMemoryEmbedding({ cardId: "keep", model: MODEL, textHash: "h", vector: basis(0) });
    await upsertMemoryEmbedding({ cardId: "gone", model: MODEL, textHash: "h", vector: basis(1) });
    await pruneMemoryEmbeddings(["keep"]);
    expect((await memoryEmbeddingStatus()).map((s) => s.cardId)).toEqual(["keep"]);
    await pruneMemoryEmbeddings([]);
    expect(await memoryEmbeddingStatus()).toEqual([]);
  });

  it("a wrong-dimension vector FAILS LOUD on write and on search (never a silent bad row)", async () => {
    await expect(
      upsertMemoryEmbedding({ cardId: "c", model: MODEL, textHash: "h", vector: [1, 2, 3] }),
    ).rejects.toThrow(/384/);
    await expect(searchMemoryEmbeddings([1, 2, 3], MODEL)).rejects.toThrow(/384/);
  });

  it("stores NO raw text — the table's columns are the vector + invalidation keys only", async () => {
    const cols = await client.execute(`PRAGMA table_info(memory_embeddings)`);
    expect((cols.rows as any[]).map((r) => r.name).sort()).toEqual([
      "card_id",
      "embedding",
      "model",
      "text_hash",
      "updated_at",
    ]);
  });
});
