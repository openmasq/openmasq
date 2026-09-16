import { useEffect, useRef, useState } from "react";
import type { Messages } from "@openmasq/i18n";
import { previewStatus, skillExtraCount } from "../composerDetection";
import type { Attachment } from "./types";
import type { LiveDetectionApi } from "./useLiveDetection";

interface Deps {
  input: string;
  attachments: Attachment[];
  live: LiveDetectionApi;
  skillCats: { value: string; cat: string }[];
  t: Messages;
}

/**
 * The send button IS the redaction indicator: a spinner while detecting or redacting, a
 * brief ✓ once something was actually protected, then the send icon. The live count comes
 * from the MERGED detection (the same source as the chips and the highlight), minus the
 * values kept in clear, plus the staged compétence's prompt — it goes out too.
 */
export function useSendState(d: Deps) {
  const { input, attachments, live, skillCats, t } = d;
  const redacting = attachments.some((a) => a.redacting);
  const busy = redacting || live.detecting;
  const sendDisabled = busy || (!input.trim() && !attachments.some((a) => a.text.trim()));
  const liveCount =
    live.detection.items.filter((i) => !live.keepSet.has(i.value)).length +
    skillExtraCount(live.detection.items, skillCats);
  // The aperçu must never show a zero it hasn't finished computing.
  const hasSomething = !!input.trim() || skillCats.length > 0;
  const scanState = previewStatus(live.detecting, liveCount, hasSomething, t, live.modelGaveUp);

  const [showDone, setShowDone] = useState(false);
  const wasBusy = useRef(false);
  useEffect(() => {
    const finished = wasBusy.current && !busy;
    wasBusy.current = busy;
    if (!finished) return;
    if (liveCount === 0 && !attachments.some((a) => (a.redactPreview ?? 0) > 0)) return;
    setShowDone(true);
    const timer = window.setTimeout(() => setShowDone(false), 650);
    return () => window.clearTimeout(timer);
  }, [busy]);

  return { redacting, busy, sendDisabled, liveCount, scanState, showDone };
}

