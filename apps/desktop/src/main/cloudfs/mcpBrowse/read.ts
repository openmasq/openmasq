/**
 * LIRE la réponse d'un listage distant — la moitié qui échoue FERMÉ.
 *
 * On n'accepte que du JSON, et seulement s'il porte de quoi NOMMER et CLASSER chaque
 * entrée. Une prose faite pour un modèle, un JSON dont rien ne dit ce qui est un dossier
 * ⇒ `null`, donc « pas navigable » : la source reprend sa ligne d'état. **Inventer une
 * arborescence serait pire que ne pas en avoir**, et c'est ce que ce refus achète.
 *
 * `describeShape` est l'autre moitié du contrat : un refus sans empreinte est un mur.
 */
import { remoteTime, type RemoteEntry } from "@openmasq/connectors";

/** Les clés sous lesquelles un serveur range sa liste. */
const LIST_KEYS = ["entries", "items", "files", "results", "contents", "children"];

/** Les clés qui disent « dossier ». Aucune d'elles ⇒ on ne sait pas classer ⇒ on renonce. */
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
 * Le JSON d'une partie texte, quand il y en a un.
 *
 * Un serveur MCP encadre volontiers son JSON d'une clôture Markdown ou d'une phrase
 * d'introduction — c'est de la mise en forme pour un modèle, pas une autre donnée. On la
 * retire, sans jamais DEVINER une liste : ce qui n'est pas du JSON reste illisible.
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
      /* le candidat suivant */
    }
  }
  return undefined;
}

const arrayOfRecords = (v: unknown): v is unknown[] =>
  Array.isArray(v) && v.every((x) => !!asRecord(x));

/** Le tableau d'entrées dans une réponse, où qu'il soit rangé. Les clés connues d'abord ;
 *  à défaut, le premier tableau d'OBJETS — un serveur a le droit de nommer sa liste
 *  autrement, mais pas de nous faire prendre une liste de chaînes pour des fichiers. */
function listIn(parsed: unknown): unknown[] | null {
  if (arrayOfRecords(parsed)) return parsed;
  const rec = asRecord(parsed);
  if (!rec) return null;
  for (const k of LIST_KEYS) if (arrayOfRecords(rec[k])) return rec[k] as unknown[];
  for (const v of Object.values(rec)) if (arrayOfRecords(v) && v.length) return v;
  return null;
}

/** `"folder"` / `{".tag":"folder"}` / `is_folder: true` / le `folder` de Graph — ou `null`
 *  quand RIEN ne le dit, auquel cas on renonce plutôt que de tout aplatir en fichiers. */
function kindOf(e: Record<string, unknown>): "dir" | "file" | null {
  for (const k of FOLDER_MARKS) {
    const v = e[k];
    if (typeof v === "boolean") return v ? "dir" : "file";
    if (typeof v === "string") {
      const low = v.toLowerCase();
      if (FOLDER_WORDS.has(low)) return "dir";
      // Un type MIME dit « dossier » à sa façon (Drive : `…apps.folder`).
      if (low.includes("/")) return low.includes("folder") ? "dir" : "file";
      return "file";
    }
  }
  // Graph range le discriminant dans une facette : la PRÉSENCE de `folder` ou de `file`.
  if (asRecord(e.folder)) return "dir";
  if (asRecord(e.file)) return "file";
  return null;
}

/**
 * L'EMPREINTE d'une réponse illisible : les clés, jamais les valeurs.
 *
 * Sans elle, « ce stockage ne rend pas de liste exploitable » est un mur — on ne sait pas
 * si le serveur a répondu de la prose, une liste rangée ailleurs, ou des entrées qu'on ne
 * sait pas classer. Des NOMS de champs sont de la structure, pas des données : c'est ce qui
 * rend ce diagnostic montrable à celui qui le lit.
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

/** Le dernier segment d'un chemin — le nom, quand le serveur ne le donne pas à part. */
const baseName = (p: string): string => p.slice(p.lastIndexOf("/") + 1) || p;

/**
 * Une réponse d'outil → des entrées typées, ou `null` si on ne sait pas la lire.
 *
 * `[]` est une réponse VALIDE (dossier vide) et se distingue de `null` (illisible) : la
 * première se dessine, la seconde retire l'arborescence.
 */
export function parseToolList(texts: string[]): {
  entries: RemoteEntry[];
  cursor?: string;
} | null {
  for (const text of texts) {
    const parsed = readJson(text);
    // De la prose : ce n'est pas une liste, c'est un paragraphe.
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
      // Un seul champ manquant suffit : une liste à moitié classée se déplierait faux.
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
