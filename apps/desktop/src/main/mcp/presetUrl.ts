import { findConnector } from "@openmasq/catalog/mcp";

/**
 * A CATALOG preset's endpoint URL is catalog data, not user data — so the catalog wins
 * over whatever was persisted when the connector was added.
 *
 * Why this exists: `mcpAdd` snapshots the whole `ServerSpec`, URL included, into
 * `mcp-<uid>.json`. When a vendor moves its endpoint (Zapier retired the OAuth handshake
 * on `/api/mcp/mcp` in favour of `/api/v1/connect`), correcting the catalog fixed only
 * NEW installs: every user who had already connected kept hitting the dead URL, with a
 * 401 no amount of re-authenticating could clear. Vendors will move again, so this is a
 * standing rule rather than a one-off migration.
 *
 * Applied on READ (`persist.ts` `listServers`/`getServer`) rather than as a write pass:
 * nothing has to be migrated, the persisted value simply stops mattering, and a user who
 * downgrades doesn't carry a URL their older app can't handle.
 *
 * ⚠️ A **user-added** server (`custom-<hex>`, and any id with no catalog entry) is
 * UNTOUCHED — its URL is the only thing the user actually chose. `findConnector` returns
 * undefined for those, which is exactly the guard. Multi-account instances
 * (`${connectorId}--${suffix}`) resolve to their connector and share its URL, which is
 * already how they are connected.
 */
export function withCatalogUrl<T extends { id: string; url?: string }>(spec: T): T {
  const catalogUrl = findConnector(spec.id)?.url;
  if (!catalogUrl || catalogUrl === spec.url) return spec;
  return { ...spec, url: catalogUrl };
}
