/**
 * The Qdrant connector as an MCP connection: seven tools (`tools.ts`), run in-process.
 *
 * Embeddings are computed ON THIS MACHINE only (`embed`, the bundled e5 worker): the text
 * arrives here as REAL values (root rule 11 — the outside gets the real value, only the
 * model sees fakes), so it must never reach a remote embedder. No model bundled ⇒ every tool
 * that needs a vector refuses; it never falls back to a network service.
 *
 * Every model-supplied argument is validated HERE before any request: a collection name is a
 * single path segment (`isCollectionName`), an id is a UUID or an unsigned integer, a filter
 * is flat primitives. Deleting a collection needs its name spelled out (never the default)
 * and only reaches one of the shape this connector writes — another shape is refused; one
 * of the SAME shape made by another tool is not told apart (the confirmation is the guard).
 */
import { randomUUID } from "node:crypto";
import type { JsonObject, JsonValue, McpConnection, McpTool, McpToolCall, McpToolResult } from "@openmasq/mcp";
import { EMBED_DIM, IncompatibleCollectionError, QdrantError, type MetadataFilter, type PointId, type QdrantApi, type QdrantPoint } from "./api";
import { isCollectionName } from "./config";
import { LIMITS, TOOL, toolList } from "./tools";

export { TOOL } from "./tools";

export interface QdrantEmbedder {
  /** `false` when no on-device model is bundled. */
  available: () => boolean;
  /** One vector per text; the caller adds the model's passage/query prefix. */
  embed: (texts: string[]) => Promise<number[][]>;
  passagePrefix: string;
  queryPrefix: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FILTER_KEY = /^[A-Za-z0-9_-]{1,64}$/;

/** A refusal written for the model and the user, raised before any request. */
class BadArgument extends QdrantError {}

const reply = (t: string, isError = false): McpToolResult => ({ content: [{ type: "text", text: t }], ...(isError ? { isError } : {}) });

function pointId(v: JsonValue | undefined): PointId {
  if (typeof v === "number" && Number.isSafeInteger(v) && v >= 0) return v;
  if (typeof v === "string" && /^\d{1,15}$/.test(v)) return Number(v);
  if (typeof v === "string" && UUID.test(v)) return v.toLowerCase();
  throw new BadArgument("Identifiant invalide : un UUID ou un entier, tel que renvoyé par qdrant-find ou qdrant-list.");
}

function metadataArg(v: JsonValue | undefined): Record<string, unknown> | undefined {
  if (v === undefined) return undefined;
  if (v === null || typeof v !== "object" || Array.isArray(v)) throw new BadArgument("« metadata » doit être un objet JSON.");
  return v as Record<string, unknown>;
}

function filterArg(v: JsonValue | undefined): MetadataFilter | undefined {
  if (v === undefined) return undefined;
  if (v === null || typeof v !== "object" || Array.isArray(v)) throw new BadArgument("« filter » doit être un objet de clés et de valeurs simples.");
  const out: MetadataFilter = {};
  for (const [k, val] of Object.entries(v)) {
    if (!FILTER_KEY.test(k)) throw new BadArgument(`Clé de filtre invalide : « ${k.slice(0, 64)} ».`);
    if (typeof val !== "string" && typeof val !== "number" && typeof val !== "boolean") {
      throw new BadArgument(`La valeur du filtre « ${k} » doit être un texte, un nombre ou un booléen.`);
    }
    out[k] = val;
  }
  return out;
}

function textArg(v: JsonValue | undefined, name: string, max: number, required: boolean): string | undefined {
  const s = typeof v === "string" ? v.trim() : "";
  if (!s) {
    if (required) throw new BadArgument(`« ${name} » est requis.`);
    return undefined;
  }
  if (s.length > max) throw new BadArgument(`« ${name} » dépasse ${max} caractères.`);
  return s;
}

function intArg(v: JsonValue | undefined, fallback: number, max: number): number {
  const n = Number(v);
  return Number.isInteger(n) ? Math.min(Math.max(n, 1), max) : fallback;
}

function describe(p: QdrantPoint, prefix = ""): string {
  const meta = p.metadata === undefined ? "" : `\n   métadonnées : ${JSON.stringify(p.metadata)}`;
  return `${prefix}[${p.id}] ${p.document}${meta}`;
}

export class QdrantConnection implements McpConnection {
  /** Collections known to exist with a usable vector space — cleared when one is deleted. */
  private readonly ready = new Set<string>();

  constructor(
    readonly id: string,
    private readonly defaultCollection: string,
    private readonly api: QdrantApi,
    private readonly embedder: QdrantEmbedder,
  ) {}

  async listTools(): Promise<McpTool[]> {
    return toolList(this.id, this.defaultCollection);
  }

  async close(): Promise<void> {}

  private collection(args: JsonObject): string {
    const raw = args.collection;
    if (raw === undefined || raw === "") return this.defaultCollection;
    if (typeof raw !== "string" || !isCollectionName(raw)) {
      throw new BadArgument("Nom de collection invalide (lettres, chiffres, - et _, 64 au plus).");
    }
    return raw;
  }

  private async vector(input: string): Promise<number[]> {
    if (!this.embedder.available()) {
      throw new QdrantError("Le modèle d'embeddings local n'est pas installé : Qdrant ne peut pas être utilisé dans cette version");
    }
    const [v] = await this.embedder.embed([input]);
    if (!Array.isArray(v) || v.length !== EMBED_DIM) throw new QdrantError("Le modèle d'embeddings local a renvoyé un vecteur inattendu");
    return v;
  }

  /** `false` when the collection does not exist; throws on one of another shape. */
  private async exists(name: string): Promise<boolean> {
    if (this.ready.has(name)) return true;
    const ok = await this.api.collectionReady(name);
    if (ok) this.ready.add(name);
    return ok;
  }

  private async collections(): Promise<McpToolResult> {
    const names = (await this.api.listCollections()).slice(0, 50);
    if (!names.length) return reply("Aucune collection.");
    const lines = await Promise.all(
      names.map(async (n) => {
        const mark = n === this.defaultCollection ? " (par défaut)" : "";
        try {
          if (!(await this.exists(n))) return `- ${n}${mark} : introuvable`;
          return `- ${n}${mark} : ${await this.api.count(n)} entrée(s)`;
        } catch (e) {
          if (e instanceof IncompatibleCollectionError) return `- ${n}${mark} : format incompatible (créée par un autre outil)`;
          throw e;
        }
      }),
    );
    return reply(lines.join("\n"));
  }

  private async store(args: JsonObject): Promise<McpToolResult> {
    const information = textArg(args.information, "information", LIMITS.information, true)!;
    const metadata = metadataArg(args.metadata);
    const col = this.collection(args);
    const vector = await this.vector(this.embedder.passagePrefix + information);
    if (!(await this.exists(col))) {
      await this.api.createCollection(col);
      this.ready.add(col);
    }
    const id = randomUUID();
    await this.api.upsert(col, id, vector, { document: information, ...(metadata ? { metadata } : {}) });
    return reply(`Enregistré dans « ${col} » sous l'identifiant ${id}.`);
  }

  private async find(args: JsonObject): Promise<McpToolResult> {
    const query = textArg(args.query, "query", LIMITS.query, true)!;
    const limit = intArg(args.limit, LIMITS.findDefault, LIMITS.findMax);
    const filter = filterArg(args.filter);
    const col = this.collection(args);
    const vector = await this.vector(this.embedder.queryPrefix + query);
    if (!(await this.exists(col))) return reply(`La collection « ${col} » n'existe pas encore.`);
    const hits = await this.api.search(col, vector, limit, filter);
    if (!hits.length) return reply("Aucun résultat.");
    return reply(hits.map((h, i) => describe(h, `${i + 1}. (pertinence ${h.score.toFixed(2)}) `)).join("\n"));
  }

  private async list(args: JsonObject): Promise<McpToolResult> {
    const limit = intArg(args.limit, LIMITS.listDefault, LIMITS.listMax);
    const cursor = args.cursor === undefined || args.cursor === "" ? undefined : pointId(args.cursor);
    const filter = filterArg(args.filter);
    const col = this.collection(args);
    if (!(await this.exists(col))) return reply(`La collection « ${col} » n'existe pas encore.`);
    const { points, next } = await this.api.scroll(col, limit, cursor, filter);
    if (!points.length) return reply(cursor === undefined ? `La collection « ${col} » est vide.` : "Plus aucune entrée.");
    const more = next === undefined ? "\n(fin de la collection)" : `\n(suite : curseur ${next})`;
    return reply(points.map((p) => describe(p, "- ")).join("\n") + more);
  }

  private async update(args: JsonObject): Promise<McpToolResult> {
    const id = pointId(args.id);
    const information = textArg(args.information, "information", LIMITS.information, false);
    const metadata = metadataArg(args.metadata);
    if (information === undefined && metadata === undefined) throw new BadArgument("Rien à modifier : donnez « information » et/ou « metadata ».");
    const col = this.collection(args);
    if (!(await this.exists(col))) return reply(`La collection « ${col} » n'existe pas.`, true);
    const [current] = await this.api.retrieve(col, [id]);
    if (!current) return reply(`Aucune entrée ${id} dans « ${col} ».`, true);
    const document = information ?? current.document;
    const meta = metadata ?? current.metadata;
    const vector = await this.vector(this.embedder.passagePrefix + document);
    await this.api.upsert(col, id, vector, { document, ...(meta ? { metadata: meta } : {}) });
    return reply(`Entrée ${id} modifiée dans « ${col} ».`);
  }

  private async remove(args: JsonObject): Promise<McpToolResult> {
    const raw = args.ids;
    if (!Array.isArray(raw) || raw.length === 0) throw new BadArgument("« ids » doit être une liste d'identifiants.");
    if (raw.length > LIMITS.deleteMax) throw new BadArgument(`Au plus ${LIMITS.deleteMax} identifiants par appel.`);
    const ids = [...new Set(raw.map(pointId))];
    const col = this.collection(args);
    if (!(await this.exists(col))) return reply(`La collection « ${col} » n'existe pas.`, true);
    const found = (await this.api.retrieve(col, ids)).map((p) => p.id);
    if (found.length) await this.api.deletePoints(col, found);
    const missing = ids.length - found.length;
    return reply(`${found.length} entrée(s) supprimée(s) de « ${col} »${missing ? `, ${missing} introuvable(s)` : ""}.`);
  }

  private async dropCollection(args: JsonObject): Promise<McpToolResult> {
    if (typeof args.collection !== "string" || !args.collection) throw new BadArgument("Donnez explicitement le nom de la collection à supprimer.");
    const col = this.collection(args);
    if (!(await this.exists(col))) return reply(`La collection « ${col} » n'existe pas.`, true);
    await this.api.deleteCollection(col);
    this.ready.delete(col);
    return reply(`Collection « ${col} » supprimée.`);
  }

  async callTool(call: McpToolCall): Promise<McpToolResult> {
    const args = call.arguments ?? {};
    try {
      switch (call.name) {
        case TOOL.collections:
          return await this.collections();
        case TOOL.store:
          return await this.store(args);
        case TOOL.find:
          return await this.find(args);
        case TOOL.list:
          return await this.list(args);
        case TOOL.update:
          return await this.update(args);
        case TOOL.delete:
          return await this.remove(args);
        case TOOL.deleteCollection:
          return await this.dropCollection(args);
        default:
          return reply(`Outil inconnu : ${call.name}`, true);
      }
    } catch (e) {
      // A QdrantError is a sentence written for the user; anything else is reported
      // generically (it may carry a URL or a stack).
      return reply(e instanceof QdrantError ? e.message : "Qdrant : erreur inattendue", true);
    }
  }
}
