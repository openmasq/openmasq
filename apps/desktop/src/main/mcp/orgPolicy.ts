import { connectorIdFromInstance, findConnector } from "@openmasq/catalog/mcp";

/**
 * MAIN's copy of the organisation's MCP policy — which connectors a member MAY use.
 *
 * Until now this list lived **only in the renderer** (applied when the agent loop assembles
 * its tool set). That made it a UX filter rather than a policy: a member could re-add the
 * very same service as a CUSTOM server and get its tools back, and anything calling
 * `mcp:call-tool` directly bypassed it entirely. This module is the privileged-side replay
 * the trust model asks for (root rule 7: a renderer gate is UX, the real check runs in main
 * too).
 *
 * ## ALLOW-list, and the two absences that do NOT mean the same thing
 *
 * The policy is now what the org PERMITS, not what it forbids (root rule 7 again: a
 * deny-list is fail-open — a connector added to the catalogue after the policy was written
 * used to be usable everywhere). That makes the distinction below load-bearing:
 *
 * - **`null` = we have not been told yet** (no push since launch, or a policy read that
 *   failed). The gate stays OPEN — a member with no organisation, or one whose fetch is
 *   still in flight, must not have their connectors silently cut.
 * - **`[]` = the organisation opened nothing.** The gate is CLOSED. This is a real policy,
 *   not an absence, and it is exactly what a freshly-created organisation looks like.
 *
 * Collapsing the two (the old `Set` where empty ≡ missing) is how an allow-list quietly
 * turns back into "everything is permitted".
 *
 * ## What this closes, and what it does NOT — read before trusting it
 *
 * The list arrives FROM the renderer (it is part of the org profile the renderer fetches).
 * Main cannot verify it, so a renderer compromised badly enough to push a fabricated list
 * still moves the policy. What is closed is everything short of that: the custom-server
 * re-add, a direct IPC call, a tool the loop's filter missed, a route that appeared after
 * the renderer last looked. Strictly more than before and strictly less than a policy main
 * could prove — say so rather than implying otherwise. The authoritative control for the
 * platform path is server-side, in the gateway.
 */

/** `null` = jamais publiée (porte ouverte) ; un Set = la politique (même vide). */
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

/**
 * Publish the org's allowed connector ids. `null`/`undefined` (or anything that is not an
 * array) CLEARS the policy back to "not told yet" rather than being guessed at — a
 * half-parsed policy is worse than none, because it reads as enforced. An empty ARRAY is a
 * real, closed policy and is kept as such.
 */
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
  if (!allowed) return false; // politique inconnue ⇒ porte ouverte, délibérément
  if (!instanceId) return true;
  if (instanceId.startsWith("custom-")) return false;
  return !(allowed.has(instanceId) || allowed.has(connectorIdFromInstance(instanceId)));
}

/** Is this URL a service the org has NOT opened, re-added by hand? This is the hole the
 *  renderer-only list left open: the policy names an id, the member adds a URL. Under an
 *  allow-list a URL matching no permitted connector is refused — including a service that
 *  is not in the catalogue at all, which is what a managed account should not be reaching. */
export function isConnectorUrlBlocked(url: string | undefined): boolean {
  if (!allowedHosts) return false; // politique inconnue ⇒ porte ouverte
  const host = hostOf(url);
  return !host || !allowedHosts.has(host);
}

/** The refusal the model sees. Names the connector, not the policy internals — the member
 *  needs to know to stop trying, and their admin is who can change it. */
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
