import type { Section } from "../types";
import {
  chatRef,
  deserializeLayout,
  emptyLayout,
  openTab as layoutOpenTab,
  type WorkspaceLayout,
} from "../workspace/layout";
import { BRAND } from "@openmasq/branding";
import { migrateLegacyLocalStorage } from "./legacyStorage";

/**
 * Boot restore for the redux `ui` slice: which SECTION the app reopens on, and the
 * persisted workspace LAYOUT (with the legacy flat `openTabs` migration). The mirror
 * that writes these keys back on every change lives with the store (`redux.ts`) —
 * this module only reads them, so it stays import-cycle-free.
 */

// Persist the current section so a reload returns to the SAME screen (chats /
// library / settings) instead of the default.
export const SECTION_KEY = "openmasq.section";
export const TABS_KEY = "openmasq.openTabs";
export const WORKSPACE_KEY = `${BRAND.slug}:workspace`;
/** The id of the very first pane — stable so a fresh single-pane layout is
 *  reproducible; split panes get caller-generated ids. */
const ROOT_PANE = "root";
// MUST list every `Section` member: `readInitialSection` validates the persisted
// value against this, so a missing one silently falls back to chats on reload.
const SECTIONS: Section[] = [
  "chats",
  "library",
  "vault",
  "competences",
  "memory",
  "settings",
];

export function readInitialSection(): Section {
  migrateLegacyLocalStorage(); // the keys from before the rename — one pass, then no-op
  try {
    const s = localStorage.getItem(SECTION_KEY) as Section | null;
    // « workflows » used to be a section; it merged into « competences ». A
    // device that had it open last finds it there, rather than being
    // sent back to conversations without a word.
    if ((s as string) === "workflows") return "competences";
    if (s && SECTIONS.includes(s)) return s;
  } catch {
    /* localStorage unavailable (SSR / preview) */
  }
  return "chats";
}

/**
 * Restore the persisted workspace layout; else MIGRATE from the legacy flat
 * `openTabs` list into a single pane (so an existing user keeps their open tabs);
 * else a fresh empty single pane. The result is pruned later in AppShell against
 * the account's actually-loaded conversations.
 */
export function initialLayout(): WorkspaceLayout {
  migrateLegacyLocalStorage();
  try {
    const saved = deserializeLayout(localStorage.getItem(WORKSPACE_KEY));
    if (saved) return saved;
    const raw = localStorage.getItem(TABS_KEY);
    const arr = raw ? (JSON.parse(raw) as unknown) : null;
    if (Array.isArray(arr)) {
      const ids = arr.filter((x): x is string => typeof x === "string");
      let l = emptyLayout(ROOT_PANE);
      for (const id of ids) l = layoutOpenTab(l, chatRef(id));
      return l;
    }
  } catch {
    /* absent / malformed */
  }
  return emptyLayout(ROOT_PANE);
}
