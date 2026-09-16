import { resolve } from "node:path";
import { addServer, getServer, removeServer, saveApiKey, saveSecrets, type ServerSpec } from "../persist";
import { buildEnv, getCatalogEntry, resolveParams } from "../catalog";
import { assertPublicUrl } from "../../net/net";
import { isConnectorUrlBlocked } from "../orgPolicy";
import { newCustomServerId, validateCustomServer } from "./customSpec";
import { infoFor } from "./info";
import { mcpDisconnect } from "./registry";
import type { McpServerInfo } from "./types";

// Directories the user chose via the native `mcp:pick-dir` dialog this session: a stdio
// path grant is accepted ONLY from here, so a renderer can't self-grant a folder.
const pickedDirs = new Set<string>();
/** Record a directory the native picker returned (called by the `mcp:pick-dir` IPC). */
export function notePickedDir(dir: string): void {
  pickedDirs.add(resolve(dir));
}
function isPickedDir(dir: string): boolean {
  return pickedDirs.has(resolve(dir));
}

/** Register a local (stdio) server from the vetted catalog: a catalog id (never a
 *  command) + declared env, encrypted. A half-configured server is never spawned. */
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
  // A path grant must come from THIS session's native picker. Only gates NEW adds:
  // persisted specs reconnect through the connect path.
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
 * Change the granted DIRECTORIES of a connected local server, through the same gates: an
 * ADDED folder comes from THIS session's picker, a KEPT one needs no re-consent,
 * `resolveParams` re-validates, and the live connection is REBUILT (a removal that
 * removes nothing is worse than no button).
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
  // Injected to keep this module out of `connect.ts`'s graph. ⚠️ CONTRACT: `reconnect`
  // DESTROYS the live connection first (a plain connect is a no-op on a connected id, and
  // the filesystem worker only reads its roots on fork).
  await reconnect(id);
  return infoFor(getServer(id) ?? { ...spec, params });
}

/**
 * Register a USER-ADDED remote server, the one entry the app hasn't vetted, so main decides:
 * the id is MINTED here (a renderer-chosen one would hijack a connector's spec), https only
 * with no inline credentials (`validateCustomServer`), SSRF guard at ADD time (fail closed,
 * a DNS failure included). Downstream gates are unchanged.
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
  // The policy names an id, a member adds the same service by URL: matched on the HOST.
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
  // A header-auth API key is stored ENCRYPTED, never on the plaintext ServerSpec.
  if (apiKey && apiKey.trim()) saveApiKey(spec.id, apiKey.trim());
  addServer(spec);
}

export async function mcpRemove(id: string): Promise<void> {
  await mcpDisconnect(id);
  removeServer(id);
}
