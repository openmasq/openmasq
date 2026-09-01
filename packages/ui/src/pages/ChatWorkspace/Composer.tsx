import { BRAND } from "@openmasq/branding";
import { useT } from "../../i18n";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { placeSlashPalette, SLASH_MAX, type SlashPlacement } from "./slashPlacement";
import {
  detectRegex, buildDetection,
  splitDetected,
  previewStatus,
  markAtCaret,
  chipValueFor,
  longTextStats,
  LONG_TEXT_THRESHOLD,
  MIRROR_MAX_CHARS,
  DETECT_DEBOUNCE_MS,
  MODEL_DEBOUNCE_MS,
  MODEL_DETECT_TIMEOUT_MS,
  makeToggleKeep,
  competenceExtraCount,
  type Detected,
  type Item,
  type Cat,
} from "./composerDetection";
import { HighlightedTextarea } from "./HighlightedTextarea";
import { MarkKeepMenu } from "./MarkKeepMenu";
import { ComposerTextModal } from "./ComposerTextModal";
import { DetectChips, LongTextCard } from "./ComposerChips";
import { useUtilityRisk } from "./useUtilityRisk";
import { AttachmentChips } from "./AttachmentChips";
import { ModelSelector } from "../../components/ModelSelector";
import {
  SendIcon,
  StopIcon,
  ShieldIcon,
  CheckIcon,
  IconButton,
  PaperclipIcon,
  ActivityIcon,
  MessageIcon,
  SparklesIcon,
  WorkflowIcon,
  FolderIcon,
  FileIcon,
} from "../../components/brand";
import { AttachmentPreviewHost } from "./AttachmentPreviewHost";
import { useTextareaSelection } from "./useTextareaSelection";
import { SelectionMenu } from "../../components/SelectionMenu";
import { ComposerSkillMenu } from "./ComposerSkillMenu";
import { ComposerRedactButton } from "./ComposerRedactButton";
import type { RedactLevelApi } from "./ComposerRedactMenu";
import { slashQuery, slashMatches, clampSlashIndex, slashActionMatches, type SlashAction } from "./slashPalette";
import { useOpenCompetence } from "../../competences/competenceOpen";
import { useChatDoors } from "./chatGates";
import { cappedSlots } from "../../competences/launch";
import { isExplicitMemoryAsk } from "../../memory/extract";
import { MemoryIcon } from "../../components/brand";
import { Markdown } from "../../components/markdown/Markdown";
import { redactTimeoutMs } from "../../send/redactTimeout";
import type { UnavailableReason } from "../../send/modelAvailability";
import type { ExtractedFile } from "../../host";
import type { Competence, Conversation } from "../../types";
import type { PdfReplacement } from "../../containers/modals/viewers/pdf/pdfReplacements";

export type Attachment = ExtractedFile & {
  redactPreview: number;
  /** Client id so async redaction updates can match the right item. */
  cid: string;
  /** Text extraction (PDF/OCR) is still running — the chip is a placeholder, shown
   *  INSTANTLY on pick so a slow extraction doesn't delay the file's appearance. */
  extracting?: boolean;
  /** Page progress of the OCR while `extracting` (scans only) — absent when the
   *  source reports none, and the chip's bar stays indeterminate then. */
  extractProgress?: { done: number; total: number };
  /** Redaction (AI redaction) is running for this file. */
  redacting?: boolean;
  /** Chunk progress for a MULTI-page/large document's redaction (drives a bar). */
  redactProgress?: { done: number; total: number };
  /** Redaction failed (e.g. no/invalid redaction-model key). */
  redactError?: string;
  /** The redaction engine (engine + model) used to produce `replacements`. Lets
   *  the chip offer a re-run when the user later switches redaction engine/model. */
  redactEngineSig?: string;
  /** Pre-computed real→fake map, reused by the preview (no re-run). */
  replacements?: PdfReplacement[];
  /** REAL values the user chose to un-redact in the preview → SENT IN CLEAR. The
   *  send skips painting/faking these (image + text paths). Default: none. */
  reveal?: string[];
};

/**
 * The bottom composer: attachment chips, the auto-growing textarea, and the
 * action row (model picker, "will be redacted" preview, attach / voice, send /
 * stop). Owns its textarea ref + auto-resize; all logic is passed in.
 */
export function Composer({
  input,
  onInput,
  onSubmit,
  attachments,
  onRemoveAttachment,
  onRetryAttachment,
  onOcrAllAttachment,
  currentRedactSig,
  inactiveCategories,
  conversation,
  isStreaming,
  onChangeModel,
  newChatModelId,
  onChangeNewChatModel,
  onAccessInfo,
  onOpenModelSettings,
  modelPickerSimple,
  onModelPickerSimpleChange,
  favoriteModels,
  onToggleFavoriteModel,
  defaultModelId,
  onSetDefaultModel,
  onStop,
  onAttach,
  canAttach,
  allowedModelIds,
  unavailableModels,
  onKeepListChange,
  onRevealChange,
  onForceRedactDoc,
  onDeleteRedactionDoc,
  onDetectPii,
  redactPolicy,
  redactLevel,
  tag,
  onClearTag,
  onEditTag,
  competences,
  onPickCompetence,
  forcedRedactions,
  onForceRedact,
  onAddToCoffre,
  memoryHint,
}: {
  input: string;
  onInput: (v: string) => void;
  onSubmit: () => void;
  /** Active action tag injected from the message text-selection menu ("Graphique" /
   *  "Préciser") or the staged compétence: a removable chip above the input. Owned by
   *  ChatView. `preview` (the compétence's prompt) enables the hover peek — what will
   *  actually ride the send, visible without leaving the conversation. */
  tag?: {
    /** Explicit glyph for the « Demander » target chip (folder/file) — the other
     *  chips pick their mark from `tone`. */
    glyph?: "folder" | "file";
    label: string;
    tone: string;
    preview?: string;
    /** The staged WORKFLOW's scoped connectors — rendered as mini chips beside the
     *  label, so the chip shows WHICH connecteurs the guidance line will name. */
    servers?: { id: string; name: string; tone: string }[];
    /** The `{braces}` the workflow's prompt expects. They aren't filled in anywhere:
     *  they get specified in the message written beside it. Displaying them is what
     *  makes this rule visible — otherwise the prompt goes out with its braces as-is
     *  and nobody notices (journal entry of 27/07/2026). */
    slots?: string[];
  } | null;
  /** Remove the active tag (the chip's × button). */
  onClearTag?: () => void;
  /** Open what the tag stands for (a compétence's editor). Absent ⇒ the chip is inert
   *  text, as it is for the selection tags, which stand for nothing editable. */
  onEditTag?: () => void;
  /** The user's compétences — the composer's picker button lists them so one can be
   *  inserted from the chatbox. Absent/empty ⇒ the picker button is not shown. */
  competences?: Competence[];
  /** Insert a compétence's prompt into the composer (+ show its tag). Owned by ChatView. */
  onPickCompetence?: (c: Competence) => void;
  /** The conversation's manual (user-forced) redactions — merged into the live
   *  preview highlight so the user sees their manual marks. */
  forcedRedactions?: { value: string; category: string }[];
  /** Force-redact the selected span AS `category` (the text-selection → "Redact"
   *  → type menu). Absent ⇒ the manual-redaction menu is not shown. */
  onForceRedact?: (value: string, category: string) => void;
  /** Add the selected span to the global COFFRE (always redacted) AS `token`. When set,
   *  the "Redact" menu shows a Cette conversation / Coffre scope toggle. */
  onAddToCoffre?: (value: string, token: string) => void;
  /** Explicit « retiens que… » capture works here → show the passive « sera noté en
   *  mémoire » hint chip when the draft matches the phrasing. */
  memoryHint?: boolean;
  attachments: Attachment[];
  onRemoveAttachment: (index: number) => void;
  /** Re-run redaction for an attachment (by cid) — on failure or engine change. */
  onRetryAttachment?: (cid: string) => void;
  /** "Lire tout" for an attachment truncated by the OCR ceiling (`ocrShortfall`).
   *  Absent (host with no `extractAll`) ⇒ the chip states the truncation without offering the action. */
  onOcrAllAttachment?: (cid: string) => void;
  /** Current redaction engine signature — a chip whose file was redacted with a
   *  different one shows a "reredact" button. */
  currentRedactSig?: string;
  /** Labels of the redaction categories currently OFF (global ⊕ conversation ⊕ org),
   *  disclosed by the attachment preview so its "Redacted" view never reads as
   *  exhaustive when names/addresses/companies are in fact left in clear. */
  inactiveCategories?: string[];
  conversation: Conversation | null;
  isStreaming: boolean;
  onChangeModel: (convId: string, modelId: string) => void;
  /** Model to show when there's NO conversation yet (empty app) — the new-chat default. */
  newChatModelId?: string;
  /** Pick a model with no conversation open → set the new-chat default. */
  onChangeNewChatModel?: (modelId: string) => void;
  /** Open the « Modèles gratuits » explainer (badge click in the picker). */
  onAccessInfo?: (focus: "free" | "credits" | "key", providerLabel?: string) => void;
  /** Open Réglages → Modèles from the picker's gear. */
  onOpenModelSettings?: () => void;
  /** Simplified view of the model picker + its toggle (persisted in Settings). */
  modelPickerSimple?: boolean;
  onModelPickerSimpleChange?: (simple: boolean) => void;
  /** Favorite models (the short list) + the star toggle, persisted in Settings. */
  favoriteModels?: string[];
  onToggleFavoriteModel?: (id: string) => void;
  /** Default model + "set as default" from the menu, persisted in Settings. */
  defaultModelId?: string;
  onSetDefaultModel?: (id: string) => void;
  onStop: () => void;
  onAttach: () => void;
  canAttach: boolean;
  /** Org-disallowed model ids — hidden from the picker. */
  allowedModelIds?: string[];
  /** Model id → why it can't send — flagged in the picker; only a `pickerBlocks` reason disables the row (`store.unavailableModels`). */
  unavailableModels?: ReadonlyMap<string, UnavailableReason>;
  /** The values the user chose to KEEP IN CLEAR (un-redacted via the chips).
   *  ChatView threads these into the send so they're not redacted at send time. */
  onKeepListChange?: (keep: string[]) => void;
  /** Set the per-value reveal (send-in-clear) selection for an attachment (by cid),
   *  edited in the document preview modal → threaded into the send by ChatView. */
  onRevealChange?: (cid: string, reveal: string[]) => void;
  /** Manually redact a SELECTED zone of a not-yet-sent document (by cid) AS a
   *  chosen type — the doc-preview analogue of the composer's "Redact" menu. */
  onForceRedactDoc?: (cid: string, value: string, token: string) => void;
  /** DELETE a document's redaction element entirely (false positive) — removed
   *  from its replacements; the value stays visible and leaves in clear. */
  onDeleteRedactionDoc?: (cid: string, value: string) => void;
  /** Read-only live detection (same engine as the send, no vault mutation) for the
   *  async model/local/remote highlight layer. Absent ⇒ regex-only live preview. */
  onDetectPii?: (
    text: string,
    signal?: AbortSignal,
  ) => Promise<{ matches: { value: string; category: string; uncertain?: boolean }[]; engine: string; error?: string }>;
  /** The redaction rules IN FORCE for this conversation (global ⊕ per-conversation
   *  override ⊕ org-mandated), as the send computes them. `disabledKinds` = the
   *  categories left in clear; `key` is a stable string that CHANGES when the policy
   *  changes, and is what re-runs the detection effects — without it, toggling a rule
   *  left the preview showing the previous analysis until the next keystroke. */
  redactPolicy?: { disabledKinds: string[]; key: string };
  /** The redaction LEVEL (`ComposerRedactButton`). Absent ⇒ no button: a
   *  preview build with no settings would have nowhere to write it. */
  redactLevel?: RedactLevelApi;
}) {
  const t = useT();
  const taRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const [previewCid, setPreviewCid] = useState<string | null>(null);
  // The compétence picker dropdown (a button in the action row → a list of the user's
  // compétences). Closed on pick, on Escape, or on a click outside the wrapper (which
  // holds BOTH the toggle button and the menu, so clicking the button never self-closes).
  const [skillOpen, setSkillOpen] = useState(false);
  const skillWrapRef = useRef<HTMLDivElement>(null);
  const inputWrapRef = useRef<HTMLDivElement>(null);
  // The "/" palette's placement — recomputed on every opening AND every keystroke that
  // changes the item count: the card grows, but the room above it doesn't move.
  const [slashPlace, setSlashPlace] = useState<SlashPlacement>({ below: false, maxHeight: SLASH_MAX });
  // Navigate to the Compétences page (create the first one) — the empty menu's CTA.
  // Context, not a prop: null outside the shell → the CTA simply doesn't render.
  const openCompetencePage = useOpenCompetence();
  useEffect(() => {
    if (!skillOpen) return;
    const onDown = (e: MouseEvent) => {
      if (skillWrapRef.current && !skillWrapRef.current.contains(e.target as Node)) setSkillOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSkillOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [skillOpen]);

  // The "/" palette: typing "/" at the START of the draft opens the same compétence
  // list, filtered as you type, arrows + Enter to stage. `slashQuery` (pure, tested)
  // owns when it opens; Escape dismisses UNTIL the draft stops being a slash lookup
  // (so it doesn't pop right back on the next keystroke of the same text).
  const [slashIdx, setSlashIdx] = useState(0);
  const [slashDismissed, setSlashDismissed] = useState(false);
  // Open on a "/" lookup whenever a picker exists — with ZERO compétences the palette
  // still lists the built-in ACTIONS (« /retenir »), so "/" is never a dead key.
  const slashQ = onPickCompetence && !slashDismissed ? slashQuery(input) : null;
  // Two families governed separately (`chatGates.ts`); both empty ⇒ nothing opens.
  const { skillsUsable, memoryOpen } = useChatDoors();
  const slashItems = useMemo(
    () => (slashQ === null || !skillsUsable ? null : slashMatches(competences ?? [], slashQ)),
    [slashQ, competences, skillsUsable],
  );
  // Built-in palette actions (« Retenir en mémoire »…) — listed ABOVE the compétences;
  // the keyboard cursor spans actions THEN compétences as one list. There is no longer a
  // third section: routines ARE compétences, they come out of the same filter.
  const slashActs = useMemo(() => (slashQ === null ? null : slashActionMatches(slashQ, t, memoryOpen)), [slashQ, t, memoryOpen]);
  const slashActCount = slashActs?.length ?? 0;
  const slashItemCount = slashItems?.length ?? 0;
  const slashCount = slashActCount + slashItemCount;
  useEffect(() => {
    if (slashQuery(input) === null) setSlashDismissed(false);
  }, [input]);
  useEffect(() => {
    setSlashIdx(0);
  }, [slashQ]);
  const pickSlash = (c: Competence) => {
    onInput(""); // consume the "/query" draft — the compétence rides as a chip, not text
    onPickCompetence?.(c);
  };
  const pickSlashAction = (a: SlashAction) => {
    onInput(a.insert); // the draft becomes the phrase — no longer a "/" lookup, palette closes
    taRef.current?.focus();
  };
  const pickSlashAt = (idx: number) => {
    if (slashActs && idx < slashActCount) pickSlashAction(slashActs[idx]);
    else if (idx < slashActCount + slashItemCount) {
      if (slashItems) pickSlash(slashItems[idx - slashActCount]);
    }
  };

  // Hover peek on the staged-compétence chip: the prompt that will ride the send,
  // rendered with the SAME Markdown the chat uses, without leaving the conversation.
  const [tagPeek, setTagPeek] = useState(false);
  useEffect(() => {
    setTagPeek(false);
  }, [tag?.label]);
  // Resolve the previewed attachment LIVE (by cid) so a re-run's fresh redaction
  // shows in the open modal instead of a stale snapshot.
  const preview = previewCid ? attachments.find((a) => a.cid === previewCid) ?? null : null;

  // LIVE redaction preview: debounced regex detection → highlight ranges. The
  // typed text stays visible INSTANTLY (the textarea sits on top); only the
  // highlight — painted by a backdrop behind it — appears ~150ms after a keypress.
  const [keepList, setKeepList] = useState<string[]>([]);
  // Two live detection layers, MERGED for the highlight + chips:
  //  1. regex layer (ALWAYS) — structured secrets (emails/keys/cards…), synchronous,
  //     short debounce.
  //  2. async model layer (only when an AI engine is on, via `onDetectPii`) — free-
  //     form PII (names, orgs), longer debounce, superseded calls aborted. It NEVER
  //     mutates the vault; the send re-redacts + fail-closes, so this is preview-only.
  const [regexCats, setRegexCats] = useState<Cat[]>([]);
  const [modelCats, setModelCats] = useState<Cat[]>([]);
  const [modelGaveUp, setModelGaveUp] = useState(false); // layer 2 gave up ⇒ partial
  const [regexPending, setRegexPending] = useState(false);
  const [modelPending, setModelPending] = useState(false);
  // The SEND is blocked while either layer is settling, so the user sees the
  // redaction before anything leaves the machine. The model layer is bounded by a
  // timeout so a hung endpoint can never block the send forever.
  const detecting = regexPending || modelPending;

  // The rules in force, read through refs so the effects below depend on the stable
  // `policyKey` STRING rather than a fresh array identity each render (which would
  // re-run the detection — and the model round-trip — on every parent render).
  const policyKey = redactPolicy?.key ?? "";
  const disabledKindsRef = useRef(redactPolicy?.disabledKinds);
  disabledKindsRef.current = redactPolicy?.disabledKinds;

  // Layer 1 — synchronous regex, short debounce. Re-runs on a POLICY change too: the
  // rules modal can turn a category off while the draft sits untouched, and the preview
  // is the surface the user trusts — it must not keep showing the previous analysis.
  useEffect(() => {
    if (!input.trim()) {
      setRegexCats([]);
      setRegexPending(false);
      return;
    }
    setRegexPending(true);
    const t = setTimeout(() => {
      setRegexCats(detectRegex(input, disabledKindsRef.current));
      setRegexPending(false);
    }, DETECT_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [input, policyKey]);

  // Layer 2 — async model/local/remote, longer debounce, abortable + timeout-bounded.
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
      // Abort+unblock if it hangs. ⚠️ Budget SCALED like the SEND (`redactTimeoutMs`,
      // rule 9): frozen at 20s, the aperçu used to give up where the send had 45s (15/08).
      guard = setTimeout(() => {
        ctrl.abort();
        setModelPending(false);
        setModelGaveUp(true); // FINISHED ≠ ABANDONED — the badge must say so
      }, Math.max(MODEL_DETECT_TIMEOUT_MS, redactTimeoutMs(input)));
      onDetectPii(input, ctrl.signal)
        .then((res) => {
          if (!ctrl.signal.aborted) {
            setModelCats(res.matches.map((m) => ({ value: m.value, cat: m.category, uncertain: m.uncertain })));
          }
        })
        .catch(() => {
          setModelGaveUp(true); // rules only → we SAY so (otherwise partial reads as total)
        })
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
    // `policyKey` for the same reason as layer 1 — `onDetectPii` is render-stable by
    // design (it reads volatile state via refs), so nothing else here would notice a
    // rules change.
  }, [input, onDetectPii, policyKey]);

  // User-FORCED manual redactions (the composer "Redact" menu). Merged FIRST so
  // a forced value's chosen category wins the family hue over any detector, and
  // painted in the same backdrop as detected spans.
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

  // Text-selection → "Redact" menu (a textarea selection, not a DOM range).
  const { sel: redactSel, onSelect: onTaSelect, clear: clearRedactSel } = useTextareaSelection(taRef);
  // A collapsed selection / new keystroke drops the menu.
  useEffect(() => {
    clearRedactSel();
  }, [input, clearRedactSel]);

  // Clear the kept list when the composer is emptied (e.g. after a send).
  useEffect(() => {
    if (!input) setKeepList([]);
  }, [input]);

  // Only kept values still present in the text count; publish them to the send
  // so the un-redaction persists (ChatView's reviewWire restores their tokens).
  const keepSet = useMemo(() => {
    // Match CASE-INSENSITIVELY: a kept value ("france") must still count when the
    // text holds a different casing ("France"/"FRANCE") — the send's `isKept` is
    // case-insensitive, so the composer must not drop the variant before it gets there.
    const lc = input.toLowerCase();
    return new Set(keepList.filter((v) => lc.includes(v.toLowerCase())));
  }, [keepList, input]);
  useEffect(() => {
    onKeepListChange?.([...keepSet]);
  }, [keepSet, onKeepListChange]);

  // Past MIRROR_MAX_CHARS the mirror renders ONE plain segment (a fast native
  // textarea): repainting thousands of spans per keystroke lags typing. Detection,
  // chips and the send-time guarantee are unchanged — only the colouring pauses.
  const mirrorOn = input.length <= MIRROR_MAX_CHARS;
  const segments = useMemo(
    () => (mirrorOn ? splitDetected(input, detection.ranges, keepSet) : [{ text: input, off: 0 }]),
    [input, detection, keepSet, mirrorOn],
  );

  const toggleKeep = makeToggleKeep(detection.items, keepSet, setKeepList);

  // The utility warning — rules + tests: utilityRisk.ts; orchestration: the hook.
  const utilRisk = useUtilityRisk({
    input, forcedCats, regexCats, modelCats, attachments,
    competencePreview: tag?.preview, disabledKinds: redactPolicy?.disabledKinds,
    keepSet, toggleKeep, onRevealChange,
  });

  // A draft past the threshold collapses the inline box to a summary card — the
  // editing (and the markdown Aperçu) moves to the modal. Both render the SAME
  // segments; the auto-grow / scroll-sync live in `HighlightedTextarea`.
  const longStats = input.length > LONG_TEXT_THRESHOLD ? longTextStats(input) : null;
  const [editorOpen, setEditorOpen] = useState(false);
  // The one-tap un-redact popover on a CLICKED mark (`MarkKeepMenu`).
  const [markMenu, setMarkMenu] = useState<{ x: number; y: number; value: string; hue: string; uncertain?: boolean } | null>(null);

  /** Click in the textarea: a drag opens the force-redact menu (existing), a plain
   *  click INSIDE a highlighted span offers « garder en clair » right there. */
  const onTaMouseUp = (e: React.MouseEvent) => {
    if (onForceRedact) onTaSelect(e);
    const { clientX, clientY } = e;
    requestAnimationFrame(() => {
      const ta = taRef.current;
      if (!ta || ta.selectionStart !== ta.selectionEnd) return;
      const m = markAtCaret(detection.ranges, keepSet, ta.selectionStart ?? -1);
      setMarkMenu(m ? { x: clientX, y: clientY, value: m.value, hue: m.hue, uncertain: m.uncertain } : null);
    });
  };

  function onKeyDown(e: React.KeyboardEvent) {
    // The "/" palette owns the keys while it has matches. With ZERO matches Enter
    // falls through to the ordinary send — "/xyz" with no match is a message.
    if (slashCount > 0) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setSlashIdx((i) => clampSlashIndex(i + 1, slashCount));
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setSlashIdx((i) => clampSlashIndex(i - 1, slashCount));
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        setSlashDismissed(true);
        return;
      }
      if ((e.key === "Enter" && !e.shiftKey) || e.key === "Tab") {
        e.preventDefault();
        pickSlashAt(clampSlashIndex(slashIdx, slashCount));
        return;
      }
    }
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      // Don't send while redaction is still being computed (or a file redacted).
      if (!detecting && !redacting) onSubmit();
    }
  }

  const redacting = attachments.some((a) => a.redacting);
  const sendDisabled =
    redacting || detecting || (!input.trim() && !attachments.some((a) => a.text.trim()));

  // The send button IS the redaction indicator: a spinner while detecting/redacting
  // (button greyed via `sendDisabled`), then a brief "validé" check, then the send
  // icon. No separate pill. The check flashes only when something was actually
  // protected (so plain typing doesn't blink a ✓ on every debounce settle).
  const busy = redacting || detecting;
  // The live "N à redact" count — from the MERGED detection (regex + NER/model +
  // forced), i.e. the same source as the chips and the highlight, minus the values the
  // user chose to keep in clear. The `previewCount` prop is the regex-only synchronous
  // count: using it here made the pill say « 1 à redact » while three chips showed —
  // the same under-count the attachment chip had before `redactAttachment` re-stamped it.
  // …PLUS the staged COMPÉTENCE's prompt: it goes out in modelText, so it counts.
  const liveCount =
    detection.items.filter((i) => !keepSet.has(i.value)).length +
    competenceExtraCount(detection.items, utilRisk.competenceCats);
  // The aperçu must never show a zero it hasn't finished computing.
  const hasSomething = !!input.trim() || utilRisk.competenceCats.length > 0;
  const scanState = previewStatus(detecting, liveCount, hasSomething, t, modelGaveUp);
  const [showDone, setShowDone] = useState(false);
  const wasBusy = useRef(false);
  useEffect(() => {
    const finished = wasBusy.current && !busy;
    wasBusy.current = busy;
    if (!finished) return;
    if (liveCount === 0 && !attachments.some((a) => (a.redactPreview ?? 0) > 0)) return;
    setShowDone(true);
    const t = window.setTimeout(() => setShowDone(false), 650);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy]);

  // Measures the room actually available on BOTH sides — the window AND the ancestor that
  // clips (`.welcome` is a scroller: what overflows it gets cut, not only
  // what falls off the screen). `useLayoutEffect`: the palette is painted in the same commit,
  // otherwise it appears in the wrong place for one frame.
  useLayoutEffect(() => {
    const el = inputWrapRef.current;
    if (!slashCount || !el) return;
    const r = el.getBoundingClientRect();
    let topLimit = 0;
    let bottomLimit = window.innerHeight;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const o = getComputedStyle(p).overflowY;
      if (o === "auto" || o === "scroll" || o === "hidden") {
        const pr = p.getBoundingClientRect();
        topLimit = Math.max(topLimit, pr.top);
        bottomLimit = Math.min(bottomLimit, pr.bottom);
      }
    }
    setSlashPlace(placeSlashPalette(r.top - topLimit, bottomLimit - r.bottom));
  }, [slashCount]);

  return (
    <div className="composer">
      {attachments.length > 0 && (
        <AttachmentChips
          attachments={attachments}
          currentRedactSig={currentRedactSig}
          onRetry={onRetryAttachment}
          onOcrAll={onOcrAllAttachment}
          onRemove={onRemoveAttachment}
          onOpen={setPreviewCid}
        />
      )}
      {tag && (
        <div
          className={`composer-tag tone-${tag.tone}`}
          onMouseEnter={tag.preview ? () => setTagPeek(true) : undefined}
          onMouseLeave={tag.preview ? () => setTagPeek(false) : undefined}
        >
          {/* Hover peek: the EXACT prompt this chip will ride along with the send —
              plain positioned DOM (no dialog role: it must never trip the
              agent-browser modal gate), same Markdown renderer as the chat. */}
          {tagPeek && tag.preview && (
            <div className="composer-tag-pop">
              <div className="composer-tag-pop-body">
                <Markdown content={tag.preview} />
              </div>
              <div className="composer-tag-pop-hint">
                Envoyée avec votre message{onEditTag ? " · cliquez le nom pour éditer" : ""}
              </div>
            </div>
          )}
          {tag.glyph === "folder" ? (
            <FolderIcon size={13} />
          ) : tag.glyph === "file" ? (
            <FileIcon size={13} />
          ) : tag.tone === "lime" ? (
            <ActivityIcon size={13} />
          ) : tag.tone === "sky" ? (
            // `sky` IS the staged compétence (ChatView) — same mark as the picker it came from.
            <SparklesIcon size={13} />
          ) : tag.tone === "violet" ? (
            // `violet` = a compétence that drives connectors (`servers`).
            <WorkflowIcon size={13} />
          ) : (
            <MessageIcon size={13} />
          )}
          {onEditTag ? (
            <button
              type="button"
              className="composer-tag-edit"
              onClick={onEditTag}
              title={t.composer.editSkill}
            >
              {tag.label}
            </button>
          ) : (
            <span>{tag.label}</span>
          )}
          {/* The compétence's connectors, right beside the tag — the visible half
              of the instruction line the payload will carry. */}
          {tag.servers && tag.servers.length > 0 && (
            <span className="composer-tag-srvs">
              {tag.servers.map((s) => (
                <span key={s.id} className={`composer-tag-srv tone-${s.tone}`}>
                  {s.name}
                </span>
              ))}
            </span>
          )}
          {/* The blanks to fill in — dashed outline, CAPPED (`cappedSlots`): a
              template with 20 braces broke the row (13/08); the rest as "+N". */}
          {tag.slots && tag.slots.length > 0 && (() => {
            const { shown, hidden } = cappedSlots(tag.slots);
            return (
              <span className="composer-tag-srvs" title={t.composer.slotsToFill}>
                {shown.map((s) => <span key={s} className="composer-tag-slot">{`{${s}}`}</span>)}
                {hidden.length > 0 && (
                  <span className="composer-tag-slot" title={hidden.map((h) => `{${h}}`).join(" ")}>{`+${hidden.length}`}</span>
                )}
              </span>
            );
          })()}
          <button
            type="button"
            className="composer-tag-x"
            aria-label={t.composer.removeTool}
            onClick={onClearTag}
          >
            ×
          </button>
        </div>
      )}
      {/* Passive MÉMOIRE hint: the draft matches « retiens que… » → this send will be
          noted. Not the intent tag (no ×, nothing to clear — it derives from the text);
          it teaches that the phrase works, before the send. */}
      {memoryHint && isExplicitMemoryAsk(input) && (
        <div
          className="composer-tag tone-violet composer-memhint"
          title={t.composer.memoryHintTip}
        >
          <MemoryIcon size={13} />
          <span>{t.composer.memoryHint}</span>
        </div>
      )}
      <div className="composer-input-wrap" ref={inputWrapRef}>
        {/* The "/" palette — anchored over the input (the wrap is position:relative),
            so the lookup appears where the user is typing, not under the ✨ button. */}
        {slashCount > 0 && !skillOpen && (
          <div
            className={`composer-slash-pop${slashPlace.below ? " below" : ""}`}
            style={{ "--slash-max": `${slashPlace.maxHeight}px` } as React.CSSProperties}
          >
            <ComposerSkillMenu
              competences={slashItems ?? []}
              actions={slashActs ?? undefined}
              activeIndex={clampSlashIndex(slashIdx, slashCount)}
              onPick={pickSlash}
              onPickAction={pickSlashAction}
            />
          </div>
        )}
        {longStats ? (
          /* LONG draft: the inline box collapses to a summary card — editing (and
             the markdown Aperçu) happens in the modal. The send row below stays. */
          <LongTextCard stats={longStats} onOpen={() => setEditorOpen(true)} />
        ) : (
          /* Backdrop mirror + transparent-bg textarea — shared with the modal
             (`HighlightedTextarea`), so both surfaces paint the same marks. */
          <HighlightedTextarea
            taRef={taRef}
            backdropRef={backdropRef}
            value={input}
            onChange={onInput}
            segments={segments}
            /* Just the invitation. The privacy CLAIM is made ONCE, by the welcome
               subtitle two lines above this very box on an empty thread (`ChatView`) —
               spelling it out again here made the home screen say the same sentence
               twice. In a thread there is no subtitle and none is needed: the marks on
               what you type demonstrate it live, which beats asserting it. */
            placeholder={t.composer.placeholder(BRAND.name)}
            grow={200}
            onKeyDown={onKeyDown}
            onMouseUp={onTaMouseUp}
            onKeyUp={onForceRedact ? (e) => (e.shiftKey ? onTaSelect() : undefined) : undefined}
          />
        )}
        {markMenu && (
          <MarkKeepMenu
            {...markMenu}
            onKeep={() => toggleKeep(chipValueFor(detection.items, markMenu.value))}
            onClose={() => setMarkMenu(null)}
          />
        )}
        {redactSel && onForceRedact && (
          <SelectionMenu
            x={redactSel.x}
            y={redactSel.y}
            onPick={(token) => {
              onForceRedact(redactSel.text, token);
              clearRedactSel();
            }}
            onCoffre={
              onAddToCoffre
                ? (token) => {
                    onAddToCoffre(redactSel.text, token);
                    clearRedactSel();
                  }
                : undefined
            }
          />
        )}
      </div>
      {utilRisk.risk && utilRisk.dismissed !== utilRisk.risk.kind && (
        <div className="utility-risk" role="note">
          <span className="utility-risk-text">{utilRisk.risk.message}</span>
          <button
            type="button"
            className="utility-risk-keep"
            title={t.composer.keepInClearTip}
            onClick={() => utilRisk.keepInClear(utilRisk.risk!)}
          >
            {t.menus.markKeep.keep}
          </button>
          <button
            type="button"
            className="utility-risk-dismiss"
            aria-label={t.composer.dismissWarning}
            onClick={() => utilRisk.dismiss(utilRisk.risk!.kind)}
          >
            ×
          </button>
        </div>
      )}
      {detection.items.length > 0 && (
        <DetectChips items={detection.items} keepSet={keepSet} onToggle={toggleKeep} />
      )}
      <div className="composer-row">
        {/* Always shown — with no conversation yet (empty app) it displays the
            new-chat default so the send box is never a blank picker; picking one
            then sets the default (the first send creates the conversation with it). */}
        <ModelSelector
          value={conversation?.modelId ?? newChatModelId ?? ""}
          disabled={isStreaming}
          allowedModelIds={allowedModelIds}
          unavailableModels={unavailableModels}
          onAccessInfo={onAccessInfo}
          onOpenModelSettings={onOpenModelSettings}
          simple={modelPickerSimple}
          onSimpleChange={onModelPickerSimpleChange}
          favoriteModels={favoriteModels}
          onToggleFavorite={onToggleFavoriteModel}
          defaultModelId={defaultModelId}
          onSetDefault={onSetDefaultModel}
          onChange={(modelId) =>
            conversation ? onChangeModel(conversation.id, modelId) : onChangeNewChatModel?.(modelId)
          }
        />
        {/* The level, within reach of where you notice a send masks too much — or too little. */}
        {redactLevel && <ComposerRedactButton api={redactLevel} />}
        {/* Idle-only count of what WILL be redacted — the LIVE redaction state
            (running → done) is shown IN the send button itself (see below), which is
            why nothing is rendered here while a detection layer is still working. */}
        {!busy && !showDone && scanState.kind === "count" && (
          <span
            key="count"
            className={`protected-pill sm kx-pill-in${scanState.partial ? " partial" : ""}`}
            title={scanState.hint}
          >
            <ShieldIcon size={12} />
            {scanState.label}
          </span>
        )}
        <div className="flex-spacer" />
        {/* Visible even with ZERO compétences: the empty menu is where a chat-first
            user DISCOVERS the feature (its empty branch carries the create CTA) —
            gated on length, the concept was invisible outside the dedicated page. */}
        {skillsUsable && onPickCompetence && competences && (
          <div className="composer-skill-wrap" ref={skillWrapRef}>
            {/* THE SAME primitive as the paperclip beside it: two neighbouring glyph actions
                rendered as two different controls (34px bordered pill vs 30px ghost square,
                mismatched hovers) read as unrelated. `IconButton` carries the name on
                `aria-label` + its tooltip — an icon-only control is never label-less. */}
            <IconButton
              size="sm"
              label={t.composer.useSkill}
              active={skillOpen}
              expanded={skillOpen}
              haspopup="menu"
              onClick={() => setSkillOpen((o) => !o)}
            >
              <SparklesIcon size={16} />
            </IconButton>
            {skillOpen && (
              <ComposerSkillMenu
                competences={competences}
                onPick={(c) => {
                  setSkillOpen(false);
                  onPickCompetence(c);
                }}
                onCreate={
                  openCompetencePage
                    ? () => {
                        setSkillOpen(false);
                        // "" resolves to no compétence → just lands on the page, whose
                        // big empty state carries the real create CTA.
                        openCompetencePage("");
                      }
                    : undefined
                }
              />
            )}
          </div>
        )}
        {canAttach && (
          <IconButton size="sm" label={t.composer.attachFile} onClick={onAttach}>
            <PaperclipIcon size={18} />
          </IconButton>
        )}
        {isStreaming ? (
          <button className="send-btn stop" onClick={onStop} aria-label={t.composer.stop}>
            <StopIcon size={16} />
          </button>
        ) : (
          <motion.button
            layout
            className={`send-btn${busy ? " is-busy has-text" : ""}${showDone ? " is-done has-text" : ""}`}
            onClick={onSubmit}
            disabled={sendDisabled}
            aria-label={busy ? t.composer.redactingAria : showDone ? t.composer.redacted : t.composer.send}
            aria-busy={busy}
            whileTap={sendDisabled ? undefined : { scale: 0.94 }}
            transition={{ type: "spring", stiffness: 520, damping: 34 }}
          >
            {/* The button MORPHS between states (framer layout animates the width;
                the icons/label cross-fade + scale): send → "Redaction" (spinner)
                → "Redacted" ✓ (green) → send. */}
            <AnimatePresence mode="popLayout" initial={false}>
              {busy ? (
                <motion.span
                  key="busy"
                  layout
                  className="send-btn-content"
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={{ duration: 0.16 }}
                >
                  <span className="pill-spin" aria-hidden="true" />
                  {t.composer.redacting}
                </motion.span>
              ) : showDone ? (
                <motion.span
                  key="done"
                  layout
                  className="send-btn-content"
                  initial={{ opacity: 0, scale: 0.6 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.6 }}
                  transition={{ duration: 0.16 }}
                >
                  <CheckIcon size={16} />
                  {t.composer.redacted}
                </motion.span>
              ) : (
                <motion.span
                  key="send"
                  layout
                  className="send-btn-content"
                  initial={{ opacity: 0, scale: 0.6, rotate: -25 }}
                  animate={{ opacity: 1, scale: 1, rotate: 0 }}
                  exit={{ opacity: 0, scale: 0.6, rotate: 25 }}
                  transition={{ duration: 0.16 }}
                >
                  <SendIcon size={18} />
                </motion.span>
              )}
            </AnimatePresence>
          </motion.button>
        )}
      </div>

      <AttachmentPreviewHost
        preview={preview}
        currentRedactSig={currentRedactSig}
        inactiveCategories={inactiveCategories}
        convCategories={conversation?.redactCategories}
        onRetryAttachment={onRetryAttachment}
        onRevealChange={onRevealChange}
        onForceRedactDoc={onForceRedactDoc}
        onDeleteRedactionDoc={onDeleteRedactionDoc}
        onAddToCoffre={onAddToCoffre}
        onClose={() => setPreviewCid(null)}
      />
      <AnimatePresence>
        {editorOpen && (
          <ComposerTextModal
            input={input}
            onInput={onInput}
            segments={segments}
            mirrorOff={!mirrorOn}
            items={detection.items}
            ranges={detection.ranges}
            keepSet={keepSet}
            onToggleKeep={toggleKeep}
            keepValueOf={(occ) => chipValueFor(detection.items, occ)}
            liveCount={liveCount}
            onForceRedact={onForceRedact}
            onAddToCoffre={onAddToCoffre}
            onClose={() => setEditorOpen(false)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
