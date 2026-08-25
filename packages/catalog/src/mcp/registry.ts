import type { McpConnector, McpTransport } from "./types";
import { REMOTE } from "./connectors/remote";
import { STDIO } from "./connectors/stdio";
import { BROKER } from "./connectors/broker";
import { DIRECT } from "./connectors/direct";
import { BUILTIN } from "./connectors/builtin";

/**
 * Every MCP connector, deduped by id. On collision, transport priority is
 * builtin > direct > remote > broker > stdio (the more capable / less configurable
 * flow wins); the ids across the source lists are disjoint today, so no dedup
 * currently drops anything.
 */
const PRIORITY: Record<McpTransport, number> = { builtin: 5, direct: 4, remote: 3, broker: 2, stdio: 1 };

function dedupe(all: McpConnector[]): McpConnector[] {
  const byId = new Map<string, McpConnector>();
  for (const c of all) {
    const existing = byId.get(c.id);
    if (!existing || PRIORITY[c.transport] > PRIORITY[existing.transport]) {
      byId.set(c.id, c);
    }
  }
  return [...byId.values()];
}

export const MCP_CONNECTORS: McpConnector[] = dedupe([
  ...BUILTIN,
  ...REMOTE,
  ...STDIO,
  ...BROKER,
  ...DIRECT,
]);

/** The catalog connector id underlying a connection INSTANCE id. Additional
 *  accounts of a multi-account connector are stored as `${connectorId}--${suffix}`;
 *  the first/only account uses the bare connectorId. `--` never occurs inside a
 *  connector id, so splitting on it recovers the connector. */
export function connectorIdFromInstance(instanceId: string): string {
  const i = instanceId.indexOf("--");
  return i > 0 ? instanceId.slice(0, i) : instanceId;
}

/** Look up a connector by id — tolerant of a multi-account INSTANCE id (falls back
 *  to the connector the instance is an account of). */
/** The connectors that hold FILES (Drive, OneDrive, Dropbox…), in catalog order — what
 *  the right rail lists under « Stockage connecté », beside the granted local folders. */
export const STORAGE_CONNECTORS: McpConnector[] = MCP_CONNECTORS.filter((c) => c.storage);

export function findConnector(id: string): McpConnector | undefined {
  return (
    MCP_CONNECTORS.find((c) => c.id === id) ??
    MCP_CONNECTORS.find((c) => c.id === connectorIdFromInstance(id))
  );
}

/**
 * The connector's BRAND, for a surface that names it inside a sentence — the catalogue
 * `name` minus the parenthesised scope note it carries for the connector LIST
 * (« Google Drive (lecture) »). That note answers « what will I be granting? » on a card
 * one is about to connect; inside « Suppression · fichier (Google Drive (lecture)) » it
 * only nests brackets and says nothing.
 *
 * Here rather than at each caller because the name is the catalogue's fact (rule 9): the
 * strip had been rewritten at three display sites, and a fourth was about to be.
 */
export function connectorBrandName(id: string): string | undefined {
  return findConnector(id)?.name.replace(/\s*\(.*\)\s*$/, "").trim();
}

/** The domains a connector addresses its own resources on (`McpConnector.hosts`) —
 *  empty for anything unknown or undeclared, which is what makes the caller's
 *  allow-list fail CLOSED: no entry ⇒ no URL exemption. Takes the connector rather
 *  than an id so a caller that already resolved one doesn't look it up twice. */
export function connectorHosts(c: McpConnector | undefined): string[] {
  return c?.hosts ?? [];
}
