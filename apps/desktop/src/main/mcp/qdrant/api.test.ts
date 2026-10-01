import { describe, expect, it, vi } from "vitest";
import { EMBED_DIM, IncompatibleCollectionError, QdrantApi, QdrantError, type QdrantNet } from "./api";
import type { QdrantConfig } from "./config";

const LOCAL: QdrantConfig = { baseUrl: "http://localhost:6333", collection: "notes", loopback: true };
const REMOTE: QdrantConfig = { baseUrl: "https://q.example.com", apiKey: "SECRET-KEY", collection: "notes", loopback: false };

function net(reply: (url: string, init: RequestInit) => { status: number; body?: unknown }) {
  const calls: { url: string; init: RequestInit & { dispatcher?: unknown } }[] = [];
  const close = vi.fn(async () => {});
  const n: QdrantNet = {
    fetch: (async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      const r = reply(url, init);
      return new Response(r.body === undefined ? "" : JSON.stringify(r.body), { status: r.status });
    }) as typeof fetch,
    assertPublic: vi.fn(async () => ["93.184.216.34"]),
    pin: vi.fn(async () => ({ close })),
    noteAllowed: vi.fn(),
  };
  return { n, calls, close };
}

const collection = (size: number) => ({ result: { config: { params: { vectors: { size, distance: "Cosine" } } } } });

describe("QdrantApi — what leaves, and to whom", () => {
  it("a local Qdrant is journaled and never goes through the public-host check", async () => {
    const { n, calls } = net(() => ({ status: 200, body: collection(EMBED_DIM) }));
    await new QdrantApi(LOCAL, n).collectionReady("notes");
    expect(n.assertPublic).not.toHaveBeenCalled();
    expect(n.noteAllowed).toHaveBeenCalledWith("http://localhost:6333/collections/notes", "connector:qdrant");
    expect(calls[0].init.redirect).toBe("error");
  });

  it("a remote Qdrant is re-checked public on EVERY call, pinned to the verified address, key in the header", async () => {
    const { n, calls, close } = net(() => ({ status: 200, body: collection(EMBED_DIM) }));
    const api = new QdrantApi(REMOTE, n);
    await api.collectionReady("notes");
    await api.listCollections();
    expect(n.assertPublic).toHaveBeenCalledTimes(2);
    expect(n.pin).toHaveBeenCalledWith(["93.184.216.34"]);
    expect(calls[0].init.dispatcher).toBeDefined();
    expect(close).toHaveBeenCalledTimes(2);
    expect((calls[0].init.headers as Record<string, string>)["api-key"]).toBe("SECRET-KEY");
    expect(calls[0].url).not.toContain("SECRET-KEY");
  });

  it("a host that fails the public check is never fetched", async () => {
    const { n, calls } = net(() => ({ status: 200 }));
    n.assertPublic = vi.fn(async () => {
      throw new Error("Refused host resolving to a private address");
    });
    await expect(new QdrantApi(REMOTE, n).collectionReady("notes")).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it("refuses a collection of another vector shape instead of mixing vectors", async () => {
    const { n } = net(() => ({ status: 200, body: collection(768) }));
    await expect(new QdrantApi(LOCAL, n).collectionReady("notes")).rejects.toBeInstanceOf(IncompatibleCollectionError);
    const named = net(() => ({ status: 200, body: { result: { config: { params: { vectors: { "fast-all-minilm-l6-v2": { size: 384 } } } } } } }));
    await expect(new QdrantApi(LOCAL, named.n).collectionReady("notes")).rejects.toThrow(/autre format/);
  });

  it("reports a refusal without ever echoing the key", async () => {
    const { n } = net(() => ({ status: 401, body: { status: { error: "Invalid api-key" } } }));
    const err = await new QdrantApi(REMOTE, n).createCollection("notes").catch((e: Error) => e);
    expect(err).toBeInstanceOf(QdrantError);
    expect(String((err as Error).message)).toMatch(/clé API/);
    expect(String((err as Error).message)).not.toContain("SECRET-KEY");
  });

  it("an unreachable Qdrant is one sentence, not a stack", async () => {
    const n = net(() => ({ status: 200 })).n;
    n.fetch = (async () => {
      throw new Error("connect ECONNREFUSED 127.0.0.1:6333");
    }) as typeof fetch;
    await expect(new QdrantApi(LOCAL, n).search("notes", [0], 5)).rejects.toThrow(/injoignable/);
  });

  it("search keeps only points this connector wrote (a document) and sends the metadata filter", async () => {
    const { n, calls } = net(() => ({
      status: 200,
      body: { result: [{ id: "u1", score: 0.9, payload: { document: "a", metadata: { k: 1 } } }, { id: 2, score: 0.5, payload: {} }] },
    }));
    expect(await new QdrantApi(LOCAL, n).search("notes", [0], 5, { client: "Atelier Sud" })).toEqual([
      { id: "u1", score: 0.9, document: "a", metadata: { k: 1 } },
    ]);
    expect(calls[0].url).toBe("http://localhost:6333/collections/notes/points/search");
    expect(JSON.parse(String(calls[0].init.body)).filter).toEqual({ must: [{ key: "metadata.client", match: { value: "Atelier Sud" } }] });
  });

  it("scroll returns one page and the next cursor; delete sends the ids", async () => {
    const { n, calls } = net((url) =>
      url.endsWith("/scroll")
        ? { status: 200, body: { result: { points: [{ id: 1, payload: { document: "x" } }], next_page_offset: 2 } } }
        : { status: 200, body: { result: { status: "completed" } } },
    );
    const api = new QdrantApi(LOCAL, n);
    expect(await api.scroll("notes", 10, 1)).toEqual({ points: [{ id: 1, document: "x" }], next: 2 });
    await api.deletePoints("notes", [1, "u2"]);
    expect(calls[1].url).toBe("http://localhost:6333/collections/notes/points/delete?wait=true");
    expect(JSON.parse(String(calls[1].init.body))).toEqual({ points: [1, "u2"] });
  });

  it("a collection name that is not a single safe segment never reaches the network", async () => {
    const { n, calls } = net(() => ({ status: 200 }));
    await expect(new QdrantApi(LOCAL, n).deleteCollection("../../collections")).rejects.toBeInstanceOf(QdrantError);
    expect(calls).toHaveLength(0);
  });
});
