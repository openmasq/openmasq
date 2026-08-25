/**
 * Typed tab references for the unified workspace tabs. A pane's `tabs` are now
 * NAMESPACED strings so ONE strip can hold heterogeneous tabs — chat conversations,
 * agent-browser tabs, and artifacts — while the layout ops keep treating them as
 * OPAQUE strings (a conv still lives in ≤1 pane, etc.). Only the KIND-aware seams
 * (which conv is "active", what persists, what a tab renders) parse a ref.
 *
 * Format: `"<kind>:<id>"`. A bare id with no known prefix is treated as a legacy
 * CHAT conv id (pre-unification persisted data) — see {@link migrateTabId}.
 */
export type TabKind = "chat" | "browser" | "artifact" | "file";

const KINDS: readonly TabKind[] = ["chat", "browser", "artifact", "file"];

export const chatRef = (convId: string): string => `chat:${convId}`;
export const browserRef = (browserTabId: string): string => `browser:${browserTabId}`;
export const artifactRef = (artifactId: string): string => `artifact:${artifactId}`;
export const fileRef = (fileId: string): string => `file:${fileId}`;

/** The kind of a tab ref. A bare/unknown-prefix id is legacy CHAT (back-compat). */
export function tabKind(ref: string): TabKind {
  const i = ref.indexOf(":");
  const k = i < 0 ? "" : ref.slice(0, i);
  return (KINDS as readonly string[]).includes(k) ? (k as TabKind) : "chat";
}

/** The underlying id (conv id / browser tab id / artifact id) without the kind prefix. */
export function tabRefId(ref: string): string {
  const i = ref.indexOf(":");
  return i < 0 ? ref : ref.slice(i + 1);
}

/** True when `ref` is a chat conversation tab. */
export const isChatRef = (ref: string): boolean => tabKind(ref) === "chat";

/** Normalise a persisted tab id: a legacy bare conv id (no known kind prefix)
 *  becomes `chat:<id>`; an already-namespaced ref is returned unchanged. */
export function migrateTabId(ref: string): string {
  const i = ref.indexOf(":");
  const k = i < 0 ? "" : ref.slice(0, i);
  return (KINDS as readonly string[]).includes(k) ? ref : chatRef(ref);
}
