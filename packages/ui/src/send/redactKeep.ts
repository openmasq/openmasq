import { connectorHosts, connectorIdFromInstance, findConnector } from "@openmasq/catalog/mcp";
import type { Host } from "../host";

/**
 * The names of the user's CONNECTED integrations — fed to the redaction `keep`
 * allow-list so the chat model receives them VERBATIM. A connector name like
 * "Stripe" / "Canva" must never be redacted as a company, or the model can't
 * recognise its own tools and mis-routes (or hallucinates about "stripe").
 *
 * Sourced from what's ACTUALLY connected: the namespaced tool names
 * (`${serverId}__${tool}`) + the connected `list()` servers + the broker
 * sidecar's `broker()` platforms (Stripe/Canva…, kept even pre-reconnect). Best-effort and
 * gated — no `host.mcp` (e.g. the browser preview) or an error ⇒ empty list, so
 * redaction is unchanged.
 */
export async function connectedKeepList(host: Host): Promise<string[]> {
  const mcp = host.mcp;
  if (!mcp) return [];
  const out = new Set<string>();
  const add = (raw?: string | null) => {
    const v = raw?.trim();
    if (!v || v.length < 2) return;
    out.add(v);
    // The bare keyword without a broker-/local- id prefix ("broker-canva" → "canva").
    const bare = v.replace(/^(broker|local)-/i, "");
    if (bare.length >= 2 && bare !== v) out.add(bare);
    // Multi-account instance id → its connector id ("gmail--a1b2" → "gmail"), so the
    // brand name is kept, not the (meaningless) instance suffix.
    const conn = connectorIdFromInstance(v);
    if (conn.length >= 2 && conn !== v) out.add(conn);
  };

  try {
    for (const t of (await mcp.listTools?.()) ?? []) {
      const name = String((t as { name?: string }).name ?? "");
      const px = name.indexOf("__");
      add(px > 0 ? name.slice(0, px) : name); // the connector id (before `__`)
      // ALSO keep the bare TOOL name (`list_messages`, `send_email`) in clear — a tool
      // identifier is never the user's PII, and keeping it means a tool NAME appearing in a
      // result / trace can never be redacted (nor vaulted, which would corrupt later calls).
      if (px > 0) add(name.slice(px + 2));
    }
  } catch {
    /* not connected / unavailable — ignore */
  }
  try {
    for (const s of (await mcp.list?.()) ?? []) {
      if (s.connected) {
        add(s.name);
        add(s.id);
      }
    }
  } catch {
    /* ignore */
  }
  // Broker-sidecar platforms (Stripe, Canva…). Include them even when the live
  // connection state isn't reflected in list() (e.g. right after a restart,
  // before the sidecar reconnects) — the name must stay kept regardless so it's
  // never redacted as a company.
  try {
    for (const p of (await mcp.broker?.())?.platforms ?? []) {
      add(p.name);
      add(p.id);
    }
  } catch {
    /* broker not running — ignore */
  }
  return [...out];
}

/**
 * The domains the user's CONNECTED integrations address their OWN resources on —
 * `structuralUrlHosts` for the redaction engine, which then leaves the sub-parts of a
 * link on one of those hosts in clear (a Notion page id, a `?pvs=1`, a Vercel deployment
 * slug). Faking them served nobody: the model got a URL that resolves to nothing and that
 * it cannot hand back to `notion-fetch`, and the audit filled with cache-buster noise.
 *
 * ⚠️ ALLOW-list, derived from what is ACTUALLY connected — a host nobody connected is
 * never exempt, and neither is a URL a connected service merely LINKS to. It rides the
 * SAME source as {@link connectedKeepList} (that list already carries every connected
 * connector id, so this costs no extra round-trip) and stays PURE, hence testable.
 *
 * What it does NOT weaken, and must not: the suppression is per-VALUE like the rest of
 * the URL gate — a name that also appears in the page title is still redacted — and
 * `URL_EXEMPT_KINDS` still wins, so a key, an e-mail or a phone inside such a URL is
 * masked as before.
 */
export function connectedUrlHosts(keepList: readonly string[]): string[] {
  const out = new Set<string>();
  for (const entry of keepList) {
    for (const h of connectorHosts(findConnector(entry))) out.add(h);
  }
  return [...out];
}
