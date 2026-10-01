import { describe, expect, it, vi } from "vitest";
import { classifyToolWrite, writeRisk } from "@openmasq/catalog/mcp";
import type { McpToolCall } from "@openmasq/mcp";
import { EMBED_DIM, IncompatibleCollectionError, type QdrantApi } from "./api";
import { QdrantConnection, TOOL, type QdrantEmbedder } from "./connection";

const vec = () => Array.from({ length: EMBED_DIM }, () => 0.1);
const UUID = "0b8e3c9a-4f3e-4d59-9c1b-2a4a5d7e9f10";
const STORED = { id: UUID, document: "Camille préfère le vouvoiement", metadata: { client: "Atelier Sud" } };

function setup(opts: { exists?: boolean; available?: boolean } = {}) {
  const api = {
    listCollections: vi.fn(async () => ["notes", "legacy"]),
    collectionReady: vi.fn(async (name: string) => {
      if (name === "legacy") throw new IncompatibleCollectionError("autre format");
      return opts.exists ?? true;
    }),
    count: vi.fn(async () => 12),
    createCollection: vi.fn(async () => {}),
    deleteCollection: vi.fn(async () => {}),
    upsert: vi.fn(async () => {}),
    retrieve: vi.fn(async (_c: string, ids: (string | number)[]) => (ids.includes(UUID) ? [STORED] : [])),
    deletePoints: vi.fn(async () => {}),
    search: vi.fn(async () => [{ ...STORED, score: 0.87 }]),
    scroll: vi.fn(async () => ({ points: [STORED], next: 42 })),
  };
  const embedder: QdrantEmbedder = {
    available: () => opts.available ?? true,
    embed: vi.fn(async (texts: string[]) => texts.map(vec)),
    passagePrefix: "passage: ",
    queryPrefix: "query: ",
  };
  const conn = new QdrantConnection("local-qdrant", "notes", api as unknown as QdrantApi, embedder);
  return { api, embedder, conn };
}

const run = async (conn: QdrantConnection, name: string, args: Record<string, unknown> = {}) => {
  const r = await conn.callTool({ name, arguments: args } as McpToolCall);
  return { error: r.isError === true, text: String((r.content[0] as { text?: unknown }).text) };
};

describe("the Qdrant tools, as the write gate sees them", () => {
  it("reads are reads, storing is a write, updating and deleting are HIGH-risk writes", async () => {
    const tools = await setup().conn.listTools();
    const byName = new Map(tools.map((t) => [t.name, t]));
    const isWrite = (n: string) => classifyToolWrite(`local-qdrant__${n}`, byName.get(n)!.annotations, byName.get(n)!.description);
    const risk = (n: string) => writeRisk(n, { annotations: byName.get(n)!.annotations });
    for (const n of [TOOL.collections, TOOL.find, TOOL.list]) expect(isWrite(n), n).toBe(false);
    for (const n of [TOOL.store, TOOL.update, TOOL.delete, TOOL.deleteCollection]) expect(isWrite(n), n).toBe(true);
    for (const n of [TOOL.update, TOOL.delete, TOOL.deleteCollection]) expect(risk(n), n).toBe("high");
    expect(tools).toHaveLength(7);
  });
});

describe("the Qdrant connector's tools", () => {
  it("collections: counts, marks the default, flags one of another format, never throws on it", async () => {
    const { conn } = setup();
    const { text } = await run(conn, TOOL.collections);
    expect(text).toMatch(/- notes \(par défaut\) : 12 entrée/);
    expect(text).toMatch(/- legacy : format incompatible/);
  });

  it("store embeds the passage ON-DEVICE, creates a missing collection once, returns the id", async () => {
    const { conn, api, embedder } = setup({ exists: false });
    const { text } = await run(conn, TOOL.store, { information: "Camille préfère le vouvoiement", metadata: { client: "Atelier Sud" }, collection: "clients" });
    expect(embedder.embed).toHaveBeenCalledWith(["passage: Camille préfère le vouvoiement"]);
    expect(api.createCollection).toHaveBeenCalledWith("clients");
    expect(api.upsert).toHaveBeenCalledWith("clients", expect.any(String), vec(), { document: "Camille préfère le vouvoiement", metadata: { client: "Atelier Sud" } });
    expect(text).toMatch(/« clients » sous l'identifiant [0-9a-f-]{36}/);
    await run(conn, TOOL.store, { information: "deuxième", collection: "clients" });
    expect(api.collectionReady).toHaveBeenCalledTimes(1);
  });

  it("find: query prefix, filter passed through, ids in the answer", async () => {
    const { conn, api, embedder } = setup();
    const { text } = await run(conn, TOOL.find, { query: "comment écrire à Camille ?", limit: 3, filter: { client: "Atelier Sud" } });
    expect(embedder.embed).toHaveBeenCalledWith(["query: comment écrire à Camille ?"]);
    expect(api.search).toHaveBeenCalledWith("notes", vec(), 3, { client: "Atelier Sud" });
    expect(text).toContain(`1. (pertinence 0.87) [${UUID}] Camille préfère le vouvoiement`);
  });

  it("list: one page, then the cursor for the next", async () => {
    const { conn, api } = setup();
    const { text } = await run(conn, TOOL.list, { limit: 500, cursor: "7" });
    expect(api.scroll).toHaveBeenCalledWith("notes", 100, 7, undefined);
    expect(text).toContain(`- [${UUID}] Camille préfère le vouvoiement`);
    expect(text).toMatch(/curseur 42/);
  });

  it("update: re-embeds the NEW text and keeps the old metadata when none is given", async () => {
    const { conn, api, embedder } = setup();
    const { error } = await run(conn, TOOL.update, { id: UUID, information: "Camille accepte le tutoiement" });
    expect(error).toBe(false);
    expect(embedder.embed).toHaveBeenCalledWith(["passage: Camille accepte le tutoiement"]);
    expect(api.upsert).toHaveBeenCalledWith("notes", UUID, vec(), { document: "Camille accepte le tutoiement", metadata: { client: "Atelier Sud" } });
  });

  it("update of an id that does not exist says so and writes nothing", async () => {
    const { conn, api } = setup();
    const r = await run(conn, TOOL.update, { id: 99, metadata: { a: 1 } });
    expect(r.error).toBe(true);
    expect(api.upsert).not.toHaveBeenCalled();
  });

  it("delete: removes what exists, reports what did not", async () => {
    const { conn, api } = setup();
    const { text } = await run(conn, TOOL.delete, { ids: [UUID, 404, UUID] });
    expect(api.deletePoints).toHaveBeenCalledWith("notes", [UUID]);
    expect(text).toMatch(/1 entrée\(s\) supprimée\(s\) de « notes », 1 introuvable/);
  });

  it("deleting a collection needs its name spelled out — never the default by omission", async () => {
    const { conn, api } = setup();
    expect((await run(conn, TOOL.deleteCollection, {})).error).toBe(true);
    expect(api.deleteCollection).not.toHaveBeenCalled();
    await run(conn, TOOL.deleteCollection, { collection: "notes" });
    expect(api.deleteCollection).toHaveBeenCalledWith("notes");
  });

  it("a collection of another format is never deleted", async () => {
    const { conn, api } = setup();
    const r = await run(conn, TOOL.deleteCollection, { collection: "legacy" });
    expect(r.error).toBe(true);
    expect(api.deleteCollection).not.toHaveBeenCalled();
  });

  it("with no on-device model, the tools that need a vector REFUSE — the real text never goes to a remote embedder", async () => {
    const { conn, embedder, api } = setup({ available: false });
    for (const [name, args] of [
      [TOOL.store, { information: "x" }],
      [TOOL.find, { query: "x" }],
      [TOOL.update, { id: UUID, information: "y" }],
    ] as const) {
      const r = await run(conn, name, args);
      expect(r.error, name).toBe(true);
      expect(r.text).toMatch(/embeddings local/);
    }
    expect(embedder.embed).not.toHaveBeenCalled();
    expect(api.upsert).not.toHaveBeenCalled();
    expect(api.search).not.toHaveBeenCalled();
  });

  it("malformed model arguments are refused before any request", async () => {
    const { conn, api } = setup();
    const bad: [string, Record<string, unknown>][] = [
      [TOOL.store, {}],
      [TOOL.store, { information: "x", metadata: "not an object" }],
      [TOOL.store, { information: "x", collection: "../admin" }],
      [TOOL.store, { information: "x".repeat(20_001) }],
      [TOOL.find, { query: "x", filter: { "a.b/c": 1 } }],
      [TOOL.find, { query: "x", filter: { a: { nested: true } } }],
      [TOOL.update, { id: "not-an-id", information: "x" }],
      [TOOL.update, { id: UUID }],
      [TOOL.delete, { ids: [] }],
      [TOOL.delete, { ids: Array.from({ length: 101 }, (_, i) => i) }],
      ["drop-everything", {}],
    ];
    for (const [name, args] of bad) expect((await run(conn, name, args)).error, `${name} ${JSON.stringify(args).slice(0, 60)}`).toBe(true);
    for (const f of [api.upsert, api.search, api.scroll, api.deletePoints, api.deleteCollection, api.retrieve]) expect(f).not.toHaveBeenCalled();
  });

  it("an unexpected failure is reported generically (no URL, no stack)", async () => {
    const { conn, api } = setup();
    api.search.mockRejectedValueOnce(new Error("fetch failed at https://q.example.com?api-key=SECRET"));
    const r = await run(conn, TOOL.find, { query: "x" });
    expect(r.error).toBe(true);
    expect(r.text).not.toContain("SECRET");
  });
});
