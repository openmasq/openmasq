import { useEffect, useState } from "react";
import { useHost } from "../../../host";
import { noteForVersion, useReleaseNotesFeed, type ReleaseNote } from "../../../state/settings/releaseNotes";

/**
 * « WHAT'S NEW » — the version this launch LANDED on, with its note.
 *
 * Updates install on their own (a quit, an idle app), so the person meets a new version
 * without having chosen the moment: this is where they learn what it brings. Main hands the
 * landing ONCE (`updates:just-updated`, consumed on read), so a recreated window says nothing.
 *
 *  · **No note, no modal.** Unlike the « ready » modal there is no gesture to offer: without
 *    the text there is nothing to say, and « not published yet » would only interrupt.
 *  · **Waits for the notes feed** rather than opening on a blank that fills a beat later.
 */
export interface WhatsNewApi {
  /** The version to present, once its note is known — else `null`. */
  version: string | null;
  note?: ReleaseNote;
  close: () => void;
}

export function useWhatsNew(): WhatsNewApi {
  const updates = useHost().updates;
  const [landed, setLanded] = useState<string | null>(null);
  const { notes, loading } = useReleaseNotesFeed();

  useEffect(() => {
    if (!updates?.justUpdated) return;
    // No unmount guard: the value is consumed main-side, a dropped answer is never re-sent.
    void updates
      .justUpdated()
      .then((j) => {
        if (j?.to) setLanded(j.to);
      })
      .catch(() => {});
  }, [updates]);

  const note = landed && !loading ? noteForVersion(notes, landed) : undefined;
  return { version: note ? landed : null, note, close: () => setLanded(null) };
}
