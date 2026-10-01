/**
 * The Qdrant REST calls the connector needs, and the network rules around them.
 *
 * Every request: the configured origin only (the path is built here from a collection name
 * `isCollectionName` accepted, never from free model text), `redirect: "error"` (a 3xx would
 * carry the API key to a host nobody configured), a hard timeout, and one line in the egress
 * journal. A non-loopback host is re-checked PUBLIC before each call (`assertPublicUrl`,
 * which journals it too) and the connection is pinned to the verified address; a loopback
 * one is journaled here. An error surfaces as a short sentence with the HTTP status — never
 * the API key, never a response header.
 */
import { BRAND } from "@openmasq/branding";
import { isCollectionName, type QdrantConfig } from "./config";

export const EMBED_DIM = 384;
const TIMEOUT_MS = 15_000;
const SOURCE = "connector:qdrant";

export interface QdrantNet {
  fetch: typeof fetch;
  /** Throws when the URL's host is not public (and journals the verdict); resolves with
   *  the verified addresses. */
  assertPublic: (url: string, source: string) => Promise<string[]>;
  /** A dispatcher pinned to those addresses, so `fetch` cannot re-resolve the name to a
   *  private IP between the check and the connect (DNS rebinding). `undefined` ⇒ unpinned. */
  pin?: (addrs: string[]) => Promise<{ close?: () => Promise<void> } | undefined>;
  /** Journals an allowed call the public check did not see (loopback). */
  noteAllowed: (url: string, source: string) => void;
}

/** A Qdrant point id: a UUID or an unsigned integer. */
export type PointId = string | number;

export interface QdrantPoint {
  id: PointId;
  document: string;
  metadata?: Record<string, unknown>;
}

export interface QdrantHit extends QdrantPoint {
  score: number;
}

/** A metadata equality filter: every `metadata.<key> == value` must hold. */
export type MetadataFilter = Record<string, string | number | boolean>;

export class QdrantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "QdrantError";
  }
}

/** The collection exists but was not made by this connector (another vector shape). */
export class IncompatibleCollectionError extends QdrantError {}

/** A point as the connector writes it, or `null` for one it did not write (no `document`). */
function toPoint(raw: unknown): QdrantPoint | null {
  const r = raw as { id?: unknown; payload?: Record<string, unknown> };
  const document = r.payload?.document;
  if (typeof document !== "string" || (typeof r.id !== "string" && typeof r.id !== "number")) return null;
  const metadata = r.payload?.metadata;
  const isObject = !!metadata && typeof metadata === "object" && !Array.isArray(metadata);
  return { id: r.id, document, ...(isObject ? { metadata: metadata as Record<string, unknown> } : {}) };
}

function filterOf(filter?: MetadataFilter): { filter?: unknown } {
  const entries = Object.entries(filter ?? {});
  if (!entries.length) return {};
  return { filter: { must: entries.map(([key, value]) => ({ key: `metadata.${key}`, match: { value } })) } };
}

export class QdrantApi {
  constructor(
    private readonly cfg: QdrantConfig,
    private readonly net: QdrantNet,
  ) {}

  private col(name: string, path = ""): string {
    if (!isCollectionName(name)) throw new QdrantError(`Nom de collection invalide : « ${name.slice(0, 64)} »`);
    return `/collections/${encodeURIComponent(name)}${path}`;
  }

  private async request(method: string, path: string, body?: unknown): Promise<{ status: number; json: unknown }> {
    const url = `${this.cfg.baseUrl}${path}`;
    let dispatcher: { close?: () => Promise<void> } | undefined;
    if (this.cfg.loopback) this.net.noteAllowed(url, SOURCE);
    else dispatcher = await this.net.pin?.(await this.net.assertPublic(url, SOURCE));
    const headers: Record<string, string> = { accept: "application/json" };
    if (body !== undefined) headers["content-type"] = "application/json";
    if (this.cfg.apiKey) headers["api-key"] = this.cfg.apiKey;
    const init: RequestInit & { dispatcher?: unknown } = {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(TIMEOUT_MS),
      ...(dispatcher ? { dispatcher } : {}),
    };
    let res: Response;
    let text: string;
    try {
      res = await this.net.fetch(url, init);
      text = await res.text().catch(() => "");
    } catch {
      throw new QdrantError("Qdrant injoignable (adresse, réseau ou délai dépassé)");
    } finally {
      await dispatcher?.close?.().catch(() => {});
    }
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      /* a non-JSON body is reported by status below */
    }
    return { status: res.status, json };
  }

  private fail(what: string, status: number, json: unknown): never {
    if (status === 401 || status === 403) throw new QdrantError(`${what} : accès refusé par Qdrant (clé API ?)`);
    const detail = (json as { status?: { error?: unknown } } | null)?.status?.error;
    const why = typeof detail === "string" ? ` — ${detail.slice(0, 200)}` : "";
    throw new QdrantError(`${what} : Qdrant a répondu ${status}${why}`);
  }

  private async ok(what: string, method: string, path: string, body?: unknown): Promise<unknown> {
    const { status, json } = await this.request(method, path, body);
    if (status !== 200) this.fail(what, status, json);
    return (json as { result?: unknown } | null)?.result;
  }

  async listCollections(): Promise<string[]> {
    const result = (await this.ok("Liste des collections", "GET", "/collections")) as { collections?: { name?: unknown }[] } | undefined;
    return (result?.collections ?? []).flatMap((c) => (typeof c.name === "string" ? [c.name] : []));
  }

  /** `true` when the collection exists with a vector space this connector can use; `false`
   *  when it does not exist. A collection with another size or named vectors is REFUSED:
   *  writing into it would fail, and reading it would compare incomparable vectors. */
  async collectionReady(name: string): Promise<boolean> {
    const { status, json } = await this.request("GET", this.col(name));
    if (status === 404) return false;
    if (status !== 200) this.fail("Lecture de la collection", status, json);
    const vectors = (json as { result?: { config?: { params?: { vectors?: unknown } } } })?.result?.config?.params?.vectors;
    if ((vectors as { size?: unknown } | undefined)?.size !== EMBED_DIM) {
      throw new IncompatibleCollectionError(
        `La collection « ${name} » existe avec un autre format de vecteurs : choisissez-en une autre, ${BRAND.name} la créera`,
      );
    }
    return true;
  }

  async count(name: string): Promise<number> {
    const result = (await this.ok("Comptage", "POST", this.col(name, "/points/count"), { exact: true })) as { count?: unknown } | undefined;
    return Number(result?.count) || 0;
  }

  async createCollection(name: string): Promise<void> {
    await this.ok("Création de la collection", "PUT", this.col(name), { vectors: { size: EMBED_DIM, distance: "Cosine" } });
  }

  async deleteCollection(name: string): Promise<void> {
    await this.ok("Suppression de la collection", "DELETE", this.col(name));
  }

  async upsert(name: string, id: PointId, vector: number[], payload: Record<string, unknown>): Promise<void> {
    await this.ok("Enregistrement", "PUT", this.col(name, "/points?wait=true"), { points: [{ id, vector, payload }] });
  }

  async retrieve(name: string, ids: PointId[]): Promise<QdrantPoint[]> {
    const result = await this.ok("Lecture des entrées", "POST", this.col(name, "/points"), { ids, with_payload: true, with_vector: false });
    return (Array.isArray(result) ? result : []).flatMap((r) => toPoint(r) ?? []);
  }

  async deletePoints(name: string, ids: PointId[]): Promise<void> {
    await this.ok("Suppression", "POST", this.col(name, "/points/delete?wait=true"), { points: ids });
  }

  async search(name: string, vector: number[], limit: number, filter?: MetadataFilter): Promise<QdrantHit[]> {
    const result = await this.ok("Recherche", "POST", this.col(name, "/points/search"), { vector, limit, with_payload: true, ...filterOf(filter) });
    return (Array.isArray(result) ? result : []).flatMap((r) => {
      const p = toPoint(r);
      return p ? [{ ...p, score: Number((r as { score?: unknown }).score) || 0 }] : [];
    });
  }

  /** One page of the collection, in Qdrant's order; `next` is the cursor of the next page. */
  async scroll(name: string, limit: number, offset?: PointId, filter?: MetadataFilter): Promise<{ points: QdrantPoint[]; next?: PointId }> {
    const result = (await this.ok("Lecture de la collection", "POST", this.col(name, "/points/scroll"), {
      limit,
      with_payload: true,
      with_vector: false,
      ...(offset !== undefined ? { offset } : {}),
      ...filterOf(filter),
    })) as { points?: unknown[]; next_page_offset?: unknown } | undefined;
    const next = result?.next_page_offset;
    return {
      points: (result?.points ?? []).flatMap((r) => toPoint(r) ?? []),
      ...(typeof next === "string" || typeof next === "number" ? { next } : {}),
    };
  }
}
