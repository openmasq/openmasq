/**
 * The Qdrant connector's configuration, validated in MAIN (the renderer only fills the
 * declared fields of the catalog entry, `../catalog.ts`).
 *
 * The address is the USER's, never the model's: the model only ever supplies text to store
 * or a query. So the one exception to the app's public-host rule is made here, for this
 * connector alone and on the literal loopback names: a Qdrant on this machine
 * (`localhost:6333`, the default install) is reachable over http or https. Anything else
 * must be https — the API key rides every request — and is checked PUBLIC on every call
 * by `assertPublicUrl` (`api.ts`). A private LAN address is refused: not supported yet.
 */
export interface QdrantConfig {
  /** Origin + optional base path, no trailing slash, no credentials, no query. */
  baseUrl: string;
  apiKey?: string;
  /** The collection a tool uses when the model names none. */
  collection: string;
  /** True when the host is a literal loopback name: the public-host check is skipped. */
  loopback: boolean;
}

export const QDRANT_DEFAULT_COLLECTION = "openmasq";

const LOOPBACK = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);
const COLLECTION = /^[A-Za-z0-9_-]{1,64}$/;

/** A collection name is a URL path segment: letters, digits, `-` and `_` only. The model
 *  may name one per call, so this is the gate that keeps it a single segment. */
export function isCollectionName(name: string): boolean {
  return COLLECTION.test(name);
}

export function isLoopbackHost(hostname: string): boolean {
  return LOOPBACK.has(hostname.toLowerCase());
}

export type QdrantConfigResult = { ok: true; config: QdrantConfig } | { ok: false; error: string };

/** Parse the connector's env fields. Every refusal is a sentence the user can act on. */
export function parseQdrantConfig(env: Record<string, string | undefined>): QdrantConfigResult {
  const raw = (env.QDRANT_URL ?? "").trim();
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: "Adresse Qdrant invalide (exemple : http://localhost:6333)" };
  }
  if (url.username || url.password) {
    return { ok: false, error: "L'adresse ne doit pas contenir d'identifiants : utilisez le champ clé API" };
  }
  if (url.search || url.hash) return { ok: false, error: "L'adresse Qdrant ne doit pas contenir de paramètres" };
  const loopback = isLoopbackHost(url.hostname);
  if (url.protocol !== "https:" && !(loopback && url.protocol === "http:")) {
    return { ok: false, error: "Un Qdrant distant doit être en https:// (http n'est accepté que sur cette machine)" };
  }
  const collection = (env.QDRANT_COLLECTION ?? "").trim() || QDRANT_DEFAULT_COLLECTION;
  if (!isCollectionName(collection)) {
    return { ok: false, error: "Nom de collection invalide (lettres, chiffres, - et _, 64 au plus)" };
  }
  const apiKey = (env.QDRANT_API_KEY ?? "").trim() || undefined;
  const baseUrl = `${url.origin}${url.pathname.replace(/\/+$/, "")}`;
  return { ok: true, config: { baseUrl, apiKey, collection, loopback } };
}
