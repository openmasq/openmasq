import { resolve } from "node:path";
import { addServer, getServer, removeServer, saveApiKey, saveSecrets, type ServerSpec } from "../persist";
import { buildEnv, getCatalogEntry, resolveParams } from "../catalog";
import { assertPublicUrl } from "../../net/net";
import { isConnectorUrlBlocked } from "../orgPolicy";
import { newCustomServerId, validateCustomServer } from "./customSpec";
import { infoFor } from "./info";
import { mcpDisconnect } from "./registry";
import type { McpServerInfo } from "./types";

// SECURITY (audit M-4): directories the user actually chose via the native
// `mcp:pick-dir` dialog this session. `mcpAddStdio` accepts a stdio path grant ONLY
// if it's in here, so a compromised renderer can't self-grant an arbitrary folder.
const pickedDirs = new Set<string>();
/** Record a directory the native picker returned (called by the `mcp:pick-dir` IPC). */
export function notePickedDir(dir: string): void {
  pickedDirs.add(resolve(dir));
}
function isPickedDir(dir: string): boolean {
  return pickedDirs.has(resolve(dir));
}

/**
 * Register a local (stdio) server from the vetted catalog. SECURITY: the renderer
 * passes a catalog id (not a command) + declared env values; we encrypt the env
 * and store a spec that only references the catalog entry. Rejects unknown ids and
 * missing required env so a half-configured server is never spawned.
 */
export function mcpAddStdio(
  catalogId: string,
  env: Record<string, string>,
  params: Record<string, string | string[]> = {},
): McpServerInfo {
  const entry = getCatalogEntry(catalogId);
  if (!entry) {
    return { id: catalogId, name: catalogId, url: "", kind: "stdio", connected: false, authorized: false, error: "unknown catalog entry" };
  }
  const id = `local-${catalogId}`;
  const err = (error: string): McpServerInfo => ({
    id, name: entry.name, url: "", kind: "stdio", connected: false, authorized: false, error,
  });
  const { missing } = buildEnv(entry, env);
  if (missing.length) return err(`missing: ${missing.join(", ")}`);
  // Validate path grants in main (absolute, existing directory) before storing.
  const { errors } = resolveParams(entry, params);
  if (errors.length) return err(errors.join(", "));
  // SECURITY (audit M-4): a path grant must have been chosen via the native
  // `mcp:pick-dir` dialog THIS session — so a renderer (e.g. via injected model
  // content) can't self-grant an arbitrary directory like `{root:"/Users/<you>"}`.
  // Only gates NEW adds; persisted specs reconnect on relaunch through the connect
  // path (not here), so a restart with an empty session set never blocks them.
  for (const field of entry.params ?? []) {
    const raw = params[field.key];
    const values = Array.isArray(raw) ? raw : raw != null ? [raw] : [];
    for (const v of values) {
      const val = String(v).trim();
      if (val && !isPickedDir(val)) {
        return err(`${field.label} : dossier non autorisé — sélectionnez-le via le bouton`);
      }
    }
  }
  saveSecrets(id, env);
  const spec: ServerSpec = { id, name: entry.name, kind: "stdio", catalogId, params };
  addServer(spec);
  return infoFor(spec);
}

/**
 * Change the granted DIRECTORIES of an already-connected local server — "Add a
 * folder" / "Remove" on the connector's card, without disconnecting it.
 *
 * Why this exists: the folder list was only assembled at CONNECT time. To add
 * one, you had to disconnect the connector and re-grant all the others —
 * a full revocation for one addition, which nobody does willingly. The
 * path therefore goes through the exact same gates:
 *
 *  - an ADDED folder must come from THIS session's native picker (`isPickedDir`,
 *    audit M-4) — a compromised renderer can't grant itself `/Users/<you>`;
 *  - a KEPT folder (already in the spec) doesn't need to be re-chosen: it was granted
 *    once, and asking again on every edit would push toward re-granting everything at once;
 *  - `resolveParams` re-validates everything in main (absolute, existing folder);
 *  - the live connection is REBUILT behind it (`reconnect`), otherwise a removed
 *    folder would stay readable by the model until the next launch — a removal that
 *    removes nothing is worse than no button at all.
 */
export async function mcpSetStdioDirs(
  id: string,
  key: string,
  dirs: string[],
  reconnect: (id: string) => Promise<unknown>,
): Promise<McpServerInfo> {
  const spec = getServer(id);
  const entry = spec?.catalogId ? getCatalogEntry(spec.catalogId) : undefined;
  const err = (error: string): McpServerInfo => ({
    id, name: spec?.name ?? id, url: "", kind: "stdio", connected: false, authorized: false, error,
  });
  if (!spec || spec.kind !== "stdio" || !entry) return err("unknown local server");
  const field = (entry.params ?? []).find((p) => p.key === key);
  if (!field) return err("unknown parameter");

  const prevRaw = spec.params?.[key];
  const previous = new Set(
    (Array.isArray(prevRaw) ? prevRaw : prevRaw != null ? [prevRaw] : []).map((d) => resolve(String(d))),
  );
  const next = [...new Set(dirs.map((d) => String(d).trim()).filter(Boolean))];
  for (const dir of next) {
    if (previous.has(resolve(dir))) continue; // already granted: nothing new to consent to
    if (!isPickedDir(dir)) return err(`${field.label} : dossier non autorisé — sélectionnez-le via le bouton`);
  }
  if (field.required && next.length === 0) return err(`${field.label} : au moins un dossier est requis`);

  const params = { ...(spec.params ?? {}), [key]: next };
  const { errors } = resolveParams(entry, params);
  if (errors.length) return err(errors.join(", "));

  addServer({ ...spec, params });
  // Reconnection is injected by the caller to keep this module out of `connect.ts`'s
  // graph — order matters: the persisted spec first, the live connection
  // next, otherwise a failed reconnect would leave the old perimeter in place.
  //
  // ⚠️ CONTRACT: `reconnect` must DESTROY the live connection before redoing it. A
  // plain `mcpConnect` does nothing on an already-connected connector, and the
  // filesystem worker only re-reads its roots on fork — the new folder would stay invisible.
  await reconnect(id);
  return infoFor(getServer(id) ?? { ...spec, params });
}

/**
 * Register a USER-ADDED remote MCP server (Réglages → MCP → "Ajouter un serveur").
 * Unlike every other entry this one is NOT vetted by the app, so main does the deciding:
 *
 * - the **id is minted here** (`customSpec.ts`), never taken from the renderer — a
 *   renderer-chosen `notion` would overwrite that connector's spec and re-point its
 *   card, tool routes and OAuth state at the typed host;
 * - the name/scheme rules are `validateCustomServer` (https only, no inline credentials);
 * - the SSRF guard runs **at ADD time**, not only at connect: a spec pointing at the LAN
 *   or a cloud-metadata address is never persisted in the first place. Fail closed —
 *   including on a DNS failure, where we refuse rather than store an unchecked host.
 *
 * Everything downstream is unchanged: the tool-dispatch write gate still confirms every
 * mutating call on main's un-spoofable window, and results still come back through the
 * conversation vault.
 */
export async function mcpAddCustom(input: {
  name?: string;
  url?: string;
  apiKey?: string;
}): Promise<McpServerInfo> {
  const err = (error: string): McpServerInfo => ({
    id: "", name: input.name ?? "", url: "", kind: "http", connected: false, authorized: false, error,
  });
  const check = validateCustomServer(input);
  if (!check.ok) return err(check.error);
  // The org-policy hole this closes: the policy names a connector ID, a member adds the
  // same service by URL. Matched on the HOST, which is all a custom spec carries.
  if (isConnectorUrlBlocked(check.draft.url)) {
    return err("Ce service est bloqué par votre organisation.");
  }
  try {
    await assertPublicUrl(check.draft.url, "mcp-connect");
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code;
    return err(
      code === "EDNS_UNRESOLVED"
        ? "Hôte introuvable — vérifiez l'adresse et votre connexion."
        : "Adresse refusée : ce serveur est sur un réseau interne ou privé.",
    );
  }
  const spec: ServerSpec = {
    id: newCustomServerId(),
    name: check.draft.name,
    kind: "http",
    url: check.draft.url,
  };
  mcpAdd(spec, input.apiKey);
  return infoFor(spec);
}

export function mcpAdd(spec: ServerSpec, apiKey?: string): void {
  // A header-auth API key (Fireflies) is a credential → stored ENCRYPTED, never on
  // the plaintext ServerSpec. Its presence drives the Bearer-header connect path.
  if (apiKey && apiKey.trim()) saveApiKey(spec.id, apiKey.trim());
  addServer(spec);
}

export async function mcpRemove(id: string): Promise<void> {
  await mcpDisconnect(id);
  removeServer(id);
}
