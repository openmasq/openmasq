/**
 * READ the response of a remote listing — the half that fails CLOSED.
 *
 * We accept only JSON, and only if it carries enough to NAME and CLASSIFY each
 * entry. Prose meant for a model, JSON that says nothing about what is a folder
 * ⇒ `null`, so "not browsable": the source falls back to its status line. **Inventing a
 * tree would be worse than having none**, and that's what this refusal buys.
 *
 * `describeShape` is the other half of the contract: a refusal with no fingerprint is a wall.
 */
import { remoteTime, type RemoteEntry } from "@openmasq/connectors";

/** The keys under which a server files its list. */
const LIST_KEYS = ["entries", "items", "files", "results", "contents", "children"];

/** The keys that say "folder". None of them ⇒ we can't classify ⇒ we give up. */
const FOLDER_MARKS = [
  ".tag",
  "tag",
  "type",
  "kind",
  "is_folder",
  "isFolder",
  "is_dir",
  "isDirectory",
  "mimeType",
  "mime_type",
];

const FOLDER_WORDS = new Set(["folder", "dir", "directory", "dossier"]);

export const asRecord = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

/**
 * The JSON of a text part, when there is one.
 *
 * An MCP server readily wraps its JSON in a Markdown fence or an introductory
 * sentence — that's formatting for a model, not other data. We strip it,
 * without ever GUESSING a list: what isn't JSON stays unreadable.
 */
export function readJson(text: string): unknown {
  const body = text.replace(/^\s*```(?:json)?\s*/i, "").replace(/```\s*$/, "");
  const candidates = [body];
  const first = body.search(/[[{]/);
  const last = Math.max(body.lastIndexOf("]"), body.lastIndexOf("}"));
  if (first > 0 && last > first) candidates.push(body.slice(first, last + 1));
  for (const c of candidates) {
    try {
      return JSON.parse(c);
    } catch {
      /* try the next candidate */
    }
  }
  return undefined;
}

const arrayOfRecords = (v: unknown): v is unknown[] =>
  Array.isArray(v) && v.every((x) => !!asRecord(x));

/** The array of entries in a response, wherever it's filed. Known keys first;
 *  failing that, the first array of OBJECTS — a server may name its list
 *  differently, but not make us mistake a list of strings for files. */
function listIn(parsed: unknown): unknown[] | null {
  if (arrayOfRecords(parsed)) return parsed;
  const rec = asRecord(parsed);
  if (!rec) return null;
  for (const k of LIST_KEYS) if (arrayOfRecords(rec[k])) return rec[k] as unknown[];
  for (const v of Object.values(rec)) if (arrayOfRecords(v) && v.length) return v;
  return null;
}

/** `"folder"` / `{".tag":"folder"}` / `is_folder: true` / Graph's `folder` — or `null`
 *  when NOTHING says so, in which case we give up rather than flatten everything to files. */
function kindOf(e: Record<string, unknown>): "dir" | "file" | null {
  for (const k of FOLDER_MARKS) {
    const v = e[k];
    if (typeof v === "boolean") return v ? "dir" : "file";
    if (typeof v === "string") {
      const low = v.toLowerCase();
      if (FOLDER_WORDS.has(low)) return "dir";
      // A MIME type says "folder" its own way (Drive: `…apps.folder`).
      if (low.includes("/")) return low.includes("folder") ? "dir" : "file";
      return "file";
    }
  }
  // Graph files the discriminant in a facet: the PRESENCE of `folder` or `file`.
  if (asRecord(e.folder)) return "dir";
  if (asRecord(e.file)) return "file";
  return null;
}

/**
 * The FINGERPRINT of an unreadable response: the keys, never the values.
 *
 * Without it, "this storage doesn't return a usable list" is a wall — we don't know
 * whether the server answered with prose, a list filed elsewhere, or entries we
 * can't classify. Field NAMES are structure, not data: that's what makes this
 * diagnostic showable to whoever reads it.
 */
export function describeShape(texts: string[]): string {
  if (!texts.length) return "réponse vide";
  const keys = (o: Record<string, unknown>): string => Object.keys(o).slice(0, 10).join(", ");
  for (const text of texts) {
    const parsed = readJson(text);
    if (parsed === undefined) continue;
    const list = listIn(parsed);
    const rec = asRecord(parsed);
    const top = rec ? `réponse {${keys(rec)}}` : Array.isArray(parsed) ? "réponse [tableau]" : "réponse JSON";
    if (!list) return `${top} — aucune liste d'objets`;
    const one = asRecord(list[0]);
    return one ? `${top}, entrée {${keys(one)}}` : `${top}, entrées non-objets`;
  }
  return `réponse non-JSON (${texts[0].length} car.)`;
}

const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

/** The last segment of a path — the name, when the server doesn't give it separately. */
const baseName = (p: string): string => p.slice(p.lastIndexOf("/") + 1) || p;

/**
 * A tool response → typed entries, or `null` if we can't read it.
 *
 * `[]` is a VALID response (empty folder) and is distinct from `null` (unreadable): the
 * former is drawn, the latter withdraws the tree.
 */
export function parseToolList(texts: string[]): {
  entries: RemoteEntry[];
  cursor?: string;
} | null {
  for (const text of texts) {
    const parsed = readJson(text);
    // Prose: not a list, a paragraph.
    if (parsed === undefined) continue;
    const raw = listIn(parsed);
    if (!raw) continue;
    const entries: RemoteEntry[] = [];
    for (const item of raw) {
      const e = asRecord(item);
      if (!e) return null;
      const path =
        str(e.path_display) ?? str(e.path_lower) ?? str(e.path) ?? str(e.id) ?? str(e.fileId);
      const name = str(e.name) ?? (path ? baseName(path) : undefined);
      const kind = kindOf(e);
      // One missing field is enough: a half-classified list would render wrong.
      if (!path || !name || !kind) return null;
      entries.push({
        id: path,
        name,
        kind,
        mtime: remoteTime(
          str(e.server_modified) ??
            str(e.client_modified) ??
            str(e.lastModifiedDateTime) ??
            str(e.modifiedTime) ??
            str(e.modified),
        ),
      });
    }
    const rec = asRecord(parsed);
    const more = rec?.has_more === true || rec?.hasMore === true;
    const cursor = more ? (str(rec?.cursor) ?? str(rec?.nextPageToken)) : undefined;
    return { entries, ...(cursor ? { cursor } : {}) };
  }
  return null;
}
