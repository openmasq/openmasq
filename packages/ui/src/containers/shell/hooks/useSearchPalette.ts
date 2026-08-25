import { useCallback, useEffect, useState } from "react";
import { useHost } from "../../../host";
import type { ChatStore } from "../../../state/store";
import { searchSettings } from "../../../pages/Settings/settingsIndex";
import { searchSections } from "../../../help";
import { isGated, useFeatureAccess } from "../../../state/featureAccess";
import { useLibraryFiles, searchFiles } from "../../../pages/Library";

/**
 * The ⌘K search palette. Owned at the shell level (not per-nav) so the shortcut works
 * from ANY section — Settings included — and TOGGLES; one source of truth for the Rail
 * and the Sidebar, which just call `setOpen(true)`.
 *
 * **Two shortcut paths, one gate.** The window `keydown` listener never fires while the
 * agent browser holds OS keyboard focus, so the desktop host forwards the shortcut
 * instead (`host.browser.onShortcut`). Both apply the same gate — `!blocked` and nothing
 * else. Settings is deliberately NOT excluded: the palette searches settings
 * destinations too, and every result navigates away on its own, so no section is a dead
 * end. `blocked` is the login/onboarding overlay, where the palette would open inert
 * behind the scrim.
 */
export function useSearchPalette({ chat, blocked }: { chat: ChatStore; blocked: boolean }): {
  open: boolean;
  setOpen: (v: boolean) => void;
  settingsResults: (q: string) => ReturnType<typeof searchSettings>;
  sectionResults: (q: string) => ReturnType<typeof searchSections>;
  fileResults: (q: string) => ReturnType<typeof searchFiles>;
} {
  const host = useHost();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        if (!blocked) setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [blocked]);

  useEffect(() => {
    const b = host.browser;
    if (!b?.onShortcut) return;
    return b.onShortcut((name) => {
      if (name === "cmd-k" && !blocked) setOpen((v) => !v);
    });
  }, [host.browser, blocked]);

  // The palette also searches SETTINGS. The shell resolves them because it owns which
  // tabs actually exist here — the same capability gates the settings rail applies — so
  // the palette can never offer a destination the rail doesn't have.
  const settingsResults = useCallback(
    (q: string) =>
      searchSettings(q, (id) => {
        if (id === "browser") return !!host.browser;
        if (id === "sync") return !!host.sync;
        if (id === "org") return !!chat.orgProfile;
        return true;
      }),
    [host.browser, host.sync, chat.orgProfile],
  );
  // …and the stored FILES. Aggregate them (host.db) ONLY while the palette is open — no
  // cost on every shell render (the Library grid and this share ONE listing).
  const { files } = useLibraryFiles(chat.conversations, open);
  const fileResults = useCallback((q: string) => searchFiles(files ?? [], q), [files]);
  // …and the SECTIONS themselves — the six places a newcomer is hunting for, which the
  // palette could not reach at all. Une section dont la PORTE est fermée en est
  // retirée : la proposer ouvrirait un écran non monté (`state/featureAccess.ts`).
  const access = useFeatureAccess();
  const sectionResults = useCallback(
    (q: string) => searchSections(q, (id) => !isGated(id) || access[id]),
    [access],
  );

  return { open, setOpen, settingsResults, sectionResults, fileResults };
}
