/**
 * Bring the in-process Qdrant connector up from its (decrypted) catalog env. The wiring to
 * the app's real boundaries lives here and nowhere else: the SSRF check and its egress
 * journal (`../../net`), the rebinding pin, and the on-device embedder (`../../embed`).
 */
import type { McpConnection } from "@openmasq/mcp";
import { embedAvailable, embedTexts } from "../../embed/client";
import { E5_PASSAGE_PREFIX, E5_QUERY_PREFIX } from "../../embed/model";
import { noteEgressUrl } from "../../net/egressLog";
import { assertPublicUrl, pinnedDispatcher } from "../../net/net";
import { QdrantApi } from "./api";
import { parseQdrantConfig } from "./config";
import { QdrantConnection } from "./connection";

export { parseQdrantConfig } from "./config";

export function connectQdrant(id: string, env: Record<string, string>): McpConnection {
  const parsed = parseQdrantConfig(env);
  if (!parsed.ok) throw new Error(parsed.error);
  const { config } = parsed;
  const api = new QdrantApi(config, {
    fetch: globalThis.fetch,
    assertPublic: assertPublicUrl,
    pin: pinnedDispatcher,
    noteAllowed: (url, source) => noteEgressUrl(url, source, "allowed"),
  });
  return new QdrantConnection(id, config.collection, api, {
    available: embedAvailable,
    embed: embedTexts,
    passagePrefix: E5_PASSAGE_PREFIX,
    queryPrefix: E5_QUERY_PREFIX,
  });
}
