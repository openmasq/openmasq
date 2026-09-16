import { useEffect, useMemo, useRef, useState } from "react";
import {
  buildDetection,
  DETECT_DEBOUNCE_MS,
  detectRegex,
  makeToggleKeep,
  MIRROR_MAX_CHARS,
  MODEL_DEBOUNCE_MS,
  MODEL_DETECT_TIMEOUT_MS,
  splitDetected,
  type Cat,
  type Detected,
  type Item,
} from "../composerDetection";
import { redactTimeoutMs } from "../../../send/redactTimeout";
import type { ComposerProps } from "./types";

/**
 * The LIVE redaction preview: two detection layers MERGED for the highlight and the chips.
 * Layer 1 is the synchronous regex (always, short debounce); layer 2 the async model layer
 * (only with `onDetectPii`, longer debounce, aborted when superseded, timeout-bounded like the
 * send). Neither mutates the vault — the send re-redacts and fails closed. The send is blocked
 * while either layer settles, so the user sees the redaction before anything leaves.
 * Both re-run on a POLICY change: the preview is the surface the user trusts.
 */
export function useLiveDetection(p: ComposerProps) {
  const { input, onDetectPii, redactPolicy, forcedRedactions, onKeepListChange } = p;
  const [keepList, setKeepList] = useState<string[]>([]);
  const [regexCats, setRegexCats] = useState<Cat[]>([]);
  const [modelCats, setModelCats] = useState<Cat[]>([]);
  const [modelGaveUp, setModelGaveUp] = useState(false);
  const [regexPending, setRegexPending] = useState(false);
  const [modelPending, setModelPending] = useState(false);
  const detecting = regexPending || modelPending;

  // Rules read through a ref so the effects depend on the stable `policyKey` STRING, not a
  // fresh array identity each render (which would re-run the model round-trip per render).
  const policyKey = redactPolicy?.key ?? "";
  const disabledKindsRef = useRef(redactPolicy?.disabledKinds);
  disabledKindsRef.current = redactPolicy?.disabledKinds;

  useEffect(() => {
    if (!input.trim()) {
      setRegexCats([]);
      setRegexPending(false);
      return;
    }
    setRegexPending(true);
    const timer = setTimeout(() => {
      setRegexCats(detectRegex(input, disabledKindsRef.current));
      setRegexPending(false);
    }, DETECT_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input, policyKey]);

  useEffect(() => {
    if (!onDetectPii || !input.trim()) {
      setModelCats([]);
      setModelPending(false);
      return;
    }
    const ctrl = new AbortController();
    let guard: ReturnType<typeof setTimeout>;
    setModelPending(true);
    setModelGaveUp(false);
    const debounce = setTimeout(() => {
      // The budget SCALES like the send's (`redactTimeoutMs`, rule 9). FINISHED ≠ ABANDONED:
      // a give-up is said, otherwise a partial preview reads as total.
      guard = setTimeout(() => {
        ctrl.abort();
        setModelPending(false);
        setModelGaveUp(true);
      }, Math.max(MODEL_DETECT_TIMEOUT_MS, redactTimeoutMs(input)));
      onDetectPii(input, ctrl.signal)
        .then((res) => {
          if (!ctrl.signal.aborted) {
            setModelCats(res.matches.map((m) => ({ value: m.value, cat: m.category, uncertain: m.uncertain })));
          }
        })
        .catch(() => setModelGaveUp(true))
        .finally(() => {
          clearTimeout(guard);
          if (!ctrl.signal.aborted) setModelPending(false);
        });
    }, MODEL_DEBOUNCE_MS);
    return () => {
      ctrl.abort();
      clearTimeout(debounce);
      clearTimeout(guard);
    };
  }, [input, onDetectPii, policyKey]);

  // Forced values merge FIRST so their chosen category wins the hue over any detector.
  const forcedCats = useMemo<Cat[]>(
    () => (forcedRedactions ?? []).map((f) => ({ value: f.value, cat: f.category })),
    [forcedRedactions],
  );
  const detection = useMemo(
    () =>
      input.trim()
        ? buildDetection(input, [...forcedCats, ...regexCats, ...modelCats])
        : { items: [] as Item[], ranges: [] as Detected[] },
    [input, forcedCats, regexCats, modelCats],
  );

  useEffect(() => {
    if (!input) setKeepList([]);
  }, [input]);
  // Only kept values still present in the text count, matched CASE-INSENSITIVELY like the
  // send's `isKept`; published to the parent so the un-redaction persists at send.
  const keepSet = useMemo(() => {
    const lc = input.toLowerCase();
    return new Set(keepList.filter((v) => lc.includes(v.toLowerCase())));
  }, [keepList, input]);
  useEffect(() => {
    onKeepListChange?.([...keepSet]);
  }, [keepSet, onKeepListChange]);

  // Past MIRROR_MAX_CHARS the mirror renders ONE plain segment: repainting thousands of
  // spans per keystroke lags typing. Only the colouring pauses.
  const mirrorOn = input.length <= MIRROR_MAX_CHARS;
  const segments = useMemo(
    () => (mirrorOn ? splitDetected(input, detection.ranges, keepSet) : [{ text: input, off: 0 }]),
    [input, detection, keepSet, mirrorOn],
  );
  const toggleKeep = makeToggleKeep(detection.items, keepSet, setKeepList);

  return { detection, keepSet, toggleKeep, segments, mirrorOn, detecting, modelGaveUp, forcedCats, regexCats, modelCats };
}

export type LiveDetectionApi = ReturnType<typeof useLiveDetection>;
