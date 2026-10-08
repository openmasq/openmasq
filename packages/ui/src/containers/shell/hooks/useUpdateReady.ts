import { useCallback, useEffect, useRef, useState } from "react";
import { useHost } from "../../../host";
import { noteForVersion, useReleaseNotesFeed, type ReleaseNote } from "../../../state/settings/releaseNotes";

/**
 * AN UPDATE IS DOWNLOADED, AND READY TO INSTALL.
 *
 * ⚠️ It's the RENDERER that announces it, not the system: an OS dialog says nothing of
 * what the version brings and steals focus.
 *
 * ⚠️ The announcement is a TOAST, never the modal. A download ends at a moment nobody
 * chose (mid-reply, mid-sentence), and nothing has to be decided then: the build installs
 * at the next quit, or on its own once the app is idle (`updates/autoInstall.ts`). The
 * modal (the note, « Redémarrer maintenant ») opens only on a GESTURE: the toast's action,
 * or the right rail's button, there for as long as the version waits.
 *
 * Three choices that hold up:
 *  · **A single toast per version.** `announcedRef` remembers the versions already
 *    announced, so a second `downloaded` event for the same build (the updater
 *    re-signals on every check) doesn't announce it again. The toast passing doesn't
 *    erase the update: the rail's button stays.
 *  · **The note is not waited for.** If the notes endpoint doesn't respond, or the version
 *    has no published note, the window opens anyway with the number and the action —
 *    staying silent because a CMS is mute would be the only real failure.
 *  · **`install()` is the only gesture ONLY main can perform**; everything else
 *    (what to show, when, to whom) is decided here.
 */
export interface UpdateReadyApi {
  /** The downloaded version waiting for a restart, else `null`. */
  version: string | null;
  /** Its published note, if it exists. */
  note?: ReleaseNote;
  /** Download size, when the updater gave it. */
  sizeBytes?: number;
  /** Is the window open? Only ever by a gesture (the toast's action, the rail's button). */
  open: boolean;
  setOpen: (v: boolean) => void;
  /** Is the « version ready » toast showing? Once per version; it passes on its own. */
  toast: boolean;
  setToast: (v: boolean) => void;
  /** Restart and install. */
  install: () => void;
}

export function useUpdateReady(): UpdateReadyApi {
  const host = useHost();
  const updates = host.updates;
  const [ready, setReady] = useState<{ version: string; sizeBytes?: number } | null>(null);
  const [open, setOpen] = useState(false);
  const [toast, setToast] = useState(false);
  const announcedRef = useRef<Set<string>>(new Set());
  // The notes are requested HERE too: it's entirely possible to have opened neither Réglages
  // nor the session's help, and it is precisely that moment that must be served.
  const { notes } = useReleaseNotesFeed();

  useEffect(() => {
    if (!updates) return;
    return updates.onStatus((s) => {
      if (s.state !== "downloaded" || !s.version) return;
      setReady({ version: s.version, sizeBytes: s.sizeBytes });
      if (announcedRef.current.has(s.version)) return;
      announcedRef.current.add(s.version);
      setToast(true);
    });
  }, [updates]);

  const install = useCallback(() => {
    void updates?.install().catch(() => {});
  }, [updates]);

  return {
    version: ready?.version ?? null,
    note: noteForVersion(notes, ready?.version),
    sizeBytes: ready?.sizeBytes,
    open: open && !!ready,
    setOpen,
    // The modal open says it all already: no toast beside it.
    toast: toast && !open && !!ready,
    setToast,
    install,
  };
}
