import { stringList } from "../args";
/**
 * Shared helpers for the Microsoft Graph connectors (Outlook / OneDrive / SharePoint
 * / Teams). Pure — only `fetch` via the injected `ConnectorToolCtx`. The Graph base
 * URL and small arg/format utilities live here so each connector file stays lean.
 */
export const GRAPH = "https://graph.microsoft.com/v1.0";
export const MAX_CHARS = 50_000;

/** Trim a value to a non-empty string, or undefined. */
export function str(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/** Clamp a numeric arg into `[1, max]` with a default. */
export function clampLimit(v: unknown, def: number, max: number): number {
  const n = typeof v === "number" ? Math.floor(v) : def;
  return Math.max(1, Math.min(max, n));
}

/** Accept a recipient list as a comma-separated STRING or an array of strings — a
 *  plain-string schema avoids weak models dropping the field on `oneOf`. */
// Délègue à `stringList` — une seule normalisation pour tous les connecteurs (règle 9),
// qui accepte en plus le tableau JSON ENCODÉ EN CHAÎNE qu'un modèle faible produit.
export function addrs(v: unknown): string[] {
  return stringList(v);
}

/** Strip HTML tags to plain text (Graph message/channel bodies are often HTML). */
export function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}
