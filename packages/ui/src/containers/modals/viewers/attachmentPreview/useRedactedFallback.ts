import { useEffect, useState } from "react";
import type { Messages } from "@openmasq/i18n";
import { describeRedactFailure, useRedactEngine, useRedaction } from "../../../../send/redaction";

/**
 * The redacted text of a file WITHOUT a drop-time map (`redactedPreview` null), computed
 * lazily the first time « Masqué » is shown. A failure records the error — NEVER the original
 * text — so the view offers a retry; a drop pass still in flight starts nothing (its map
 * arrives and takes precedence).
 */
export function useRedactedFallback(o: {
  shown: boolean;
  text: string;
  redactedPreview: string | null;
  redacting?: boolean;
  convCategories?: Record<string, boolean>;
  t: Messages;
}) {
  const redact = useRedaction();
  const engine = useRedactEngine();
  const [redacted, setRedacted] = useState<string | null>(null);
  const [redactedErr, setRedactedErr] = useState<string | null>(null);
  const { shown, text, redactedPreview, redacting, convCategories, t } = o;
  useEffect(() => {
    if (redactedPreview !== null) return; // deterministic path — no re-run
    if (!shown || redacted !== null || redactedErr !== null || !text) return;
    if (redacting) return;
    let alive = true;
    redact(text, undefined, undefined, convCategories)
      .then((r) => alive && setRedacted(r.text))
      .catch((e) => {
        if (!alive) return;
        setRedactedErr(describeRedactFailure(e instanceof Error ? e.message : String(e), t, engine));
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [shown, redacted, redactedErr, text, redact, engine, redactedPreview, convCategories, redacting]);
  // « Réessayer » : clear both → the effect re-runs on the same text.
  const retry = () => {
    setRedactedErr(null);
    setRedacted(null);
  };
  return { redacted, redactedErr, retry };
}
