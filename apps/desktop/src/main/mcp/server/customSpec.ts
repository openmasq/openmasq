import { randomBytes } from "node:crypto";

/**
 * Validation for a USER-ADDED remote MCP server (Réglages → MCP → "Ajouter un serveur").
 * Pure — no Electron, no network — so the rules below are unit-testable
 * (`../customServer.test.ts`); the DNS/SSRF half stays in `lifecycle.ts`.
 *
 * A custom server is the one connector the app has not vetted: the user names a host and
 * we hand it tool calls carrying their REAL data (root rule 11 — outward is never
 * redacted). The UI states that risk behind a blocking checkbox; these rules are what
 * keeps the blast radius to "the host the user actually typed".
 */

/** The id namespace every user-added server lives in. */
export const CUSTOM_ID_PREFIX = "custom-";

/** A label is display-only; long enough to be useful, short enough not to break a card. */
export const CUSTOM_NAME_MAX = 60;

export function isCustomServerId(id: string): boolean {
  return id.startsWith(CUSTOM_ID_PREFIX);
}

/**
 * Mint a custom server's id. SECURITY: the id is minted HERE, in main — the renderer
 * never supplies one. A renderer-chosen id could be an existing connector's
 * (`notion`), which would overwrite that connector's stored spec and re-point its card,
 * its tool routes and its OAuth state at the attacker's host. It carries no `--`, so
 * `connectorIdFromInstance` resolves it to itself rather than to some connector's account.
 */
export function newCustomServerId(): string {
  return `${CUSTOM_ID_PREFIX}${randomBytes(6).toString("hex")}`;
}

export interface CustomServerDraft {
  name: string;
  url: string;
}

export type CustomServerCheck =
  | { ok: true; draft: CustomServerDraft }
  | { ok: false; error: string };

/**
 * Check a user-typed name + endpoint. Fails CLOSED: anything not positively understood
 * is refused rather than normalised into something that connects.
 */
export function validateCustomServer(input: { name?: string; url?: string }): CustomServerCheck {
  // Control characters would let a name forge line breaks / bidi runs in the card and
  // in the connector list. Strip, then require something is left.
  const name = (input.name ?? "").replace(/\p{C}/gu, "").trim().slice(0, CUSTOM_NAME_MAX);
  if (!name) return { ok: false, error: "Donnez un nom à ce serveur." };

  const raw = (input.url ?? "").trim();
  if (!raw) return { ok: false, error: "Indiquez l'adresse du serveur." };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, error: "Adresse invalide." };
  }
  // HTTPS only. An API key rides as a Bearer header (or in the query string, the
  // Exa-style pattern) and the tool arguments carry the user's REAL data — over plain
  // http both are readable by anything on the path. `assertPublicUrl` checks the HOST,
  // never the scheme, so this is the only place the scheme is decided.
  if (url.protocol !== "https:") {
    return { ok: false, error: "L'adresse doit commencer par https://" };
  }
  // `https://user:pass@host` would put a credential somewhere we neither store
  // encrypted nor ever show back — and the UI would render it. Refuse it outright.
  if (url.username || url.password) {
    return { ok: false, error: "N'incluez pas d'identifiants dans l'adresse." };
  }
  return { ok: true, draft: { name, url: url.toString() } };
}
