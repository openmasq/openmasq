import { connectorIdFromInstance, findConnector } from "@openmasq/catalog/mcp";

/**
 * MAIN's replay of the organisation's MCP policy: which connectors a member MAY use. The
 * renderer's filter is UX (rule 7); this closes the custom-server re-add and the direct
 * IPC call.
 *
 * An ALLOW-list, and two absences that do NOT mean the same thing: `null` = not told yet
 * (gate OPEN: a member with no organisation must not lose their connectors); `[]` = the
 * organisation opened nothing (gate CLOSED). Collapsing them turns the allow-list back
 * into "everything permitted".
 *
 * RESIDUAL: the list arrives FROM the renderer, so a renderer compromised enough to push
 * a fabricated list still moves the policy. The authoritative control is server-side.
 */

/** `null` = never published (open gate); a Set = the policy (even when empty). */
let allowed: Set<string> | null = null;
/** Hosts of the ALLOWED connectors, so a service re-added as a CUSTOM server URL is
 *  recognised as permitted. A custom server carries no catalog id — the host is what it has. */
let allowedHosts: Set<string> | null = null;

function hostOf(url: string | undefined): string | null {
  if (!url) return null;
  try {
    return new URL(url).hostname.toLowerCase().replace(/^www\./, "");
  } catch {
    return null;
  }
}

/** Publish the allowed ids. A non-array CLEARS the policy to "not told yet" (a half-parsed
 *  policy reads as enforced); an empty ARRAY is a real, closed policy. */
export function setOrgAllowedConnectors(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    allowed = null;
    allowedHosts = null;
    return null;
  }
  const ids = value.filter((v): v is string => typeof v === "string" && !!v);
  allowed = new Set(ids);
  allowedHosts = new Set(
    ids.map((id) => hostOf(findConnector(id)?.url)).filter((h): h is string => !!h),
  );
  return [...allowed];
}

export function orgAllowedConnectors(): string[] | null {
  return allowed ? [...allowed] : null;
}

/** Is this connector (or one of its extra accounts) blocked? `instanceId` may be a
 *  multi-account id (`gmail--a1b2`) — `connectorIdFromInstance` recovers the connector.
 *  A CUSTOM server (`custom-<hex>`) carries no catalog id: it is judged by URL at add
 *  time (`isConnectorUrlBlocked`), so it is not refused here on id alone. */
export function isConnectorBlocked(instanceId: string | undefined): boolean {
  if (!allowed) return false; // policy unknown ⇒ open gate, deliberately
  if (!instanceId) return true;
  if (instanceId.startsWith("custom-")) return false;
  return !(allowed.has(instanceId) || allowed.has(connectorIdFromInstance(instanceId)));
}

/** A service the org has NOT opened, re-added by URL: a URL matching no permitted connector
 *  is refused, including one not in the catalogue at all. */
export function isConnectorUrlBlocked(url: string | undefined): boolean {
  if (!allowedHosts) return false; // policy unknown ⇒ open gate
  const host = hostOf(url);
  return !host || !allowedHosts.has(host);
}

/** The refusal the model sees: the connector's name, never the policy internals. */
export function blockedConnectorError(instanceId: string): Error {
  const id = connectorIdFromInstance(instanceId);
  const name = findConnector(id)?.name ?? id;
  return new Error(
    `Connecteur non autorisé par votre organisation : ${name}. Cette action ne peut pas ` +
      `aboutir ici ; votre administrateur peut l'activer.`,
  );
}

/** Test seam. */
export function _resetOrgPolicy(): void {
  allowed = null;
  allowedHosts = null;
}
