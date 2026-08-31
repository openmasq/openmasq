import { useCallback, useEffect, useRef, useState } from "react";
import { useHost } from "../../../host";
import { noteForVersion, useReleaseNotesFeed, type ReleaseNote } from "../../../state/releaseNotes";

/**
 * AN UPDATE IS DOWNLOADED, AND READY TO INSTALL.
 *
 * ⚠️ It's the RENDERER that announces it, not the system anymore. An OS dialog
 * used to say "x.y.z is ready to install" in English, didn't say what the version
 * brings, and stole focus mid-sentence. Here we have the published note
 * (Contentful) and know how to wait: the window closes, a button on the right rail
 * reopens it as long as the version stays pending.
 *
 * Three choices that hold up:
 *  · **A single automatic opening per version.** `announcedRef` remembers the versions
 *    already announced, so a second `downloaded` event for the same build — they
 *    repeat, the updater re-signals on every check — doesn't reopen on top of what
 *    is being written right now. Closing doesn't erase the update: the button stays.
 *  · **The note is not waited for.** If Contentful doesn't respond, or the version has no
 *    published note, the window opens anyway with the number and the action — what
 *    matters is "a new version is ready, restart", and staying silent about that because a
 *    CMS is mute would be the only real failure.
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
  /** Is the window open? */
  open: boolean;
  setOpen: (v: boolean) => void;
  /** Restart and install. */
  install: () => void;
}

export function useUpdateReady(): UpdateReadyApi {
  const host = useHost();
  const updates = host.updates;
  const [ready, setReady] = useState<{ version: string; sizeBytes?: number } | null>(null);
  const [open, setOpen] = useState(false);
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
      setOpen(true);
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
    install,
  };
}
