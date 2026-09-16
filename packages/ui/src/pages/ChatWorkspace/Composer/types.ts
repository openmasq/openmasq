import type { ExtractedFile } from "../../../host";
import type { PdfReplacement } from "../../../containers/modals/viewers/pdf/pdfReplacements";
import type { UnavailableReason } from "../../../send/modelAvailability";
import type { Conversation, Skill } from "../../../types";
import type { RedactLevelApi } from "../ComposerRedactMenu";

export type Attachment = ExtractedFile & {
  redactPreview: number;
  /** Client id so async redaction updates can match the right item. */
  cid: string;
  /** Text extraction (PDF/OCR) still running — the chip is a placeholder shown INSTANTLY on pick. */
  extracting?: boolean;
  /** OCR page progress while `extracting`; absent ⇒ the chip's bar stays indeterminate. */
  extractProgress?: { done: number; total: number };
  /** Redaction is running for this file. */
  redacting?: boolean;
  /** Chunk progress of a large document's redaction. */
  redactProgress?: { done: number; total: number };
  redactError?: string;
  /** Engine + model that produced `replacements`; a later engine switch offers a re-run. */
  redactEngineSig?: string;
  /** Pre-computed real→fake map, reused by the preview and the send. */
  replacements?: PdfReplacement[];
  /** REAL values the user chose to un-redact in the preview → SENT IN CLEAR. */
  reveal?: string[];
};

/** The chip above the input for the intent staged on the next send. */
export interface ComposerTagInfo {
  /** Explicit glyph for the « Demander » target chip; the other chips pick their mark from `tone`. */
  glyph?: "folder" | "file";
  label: string;
  tone: string;
  /** The EXACT prompt the send will carry — enables the hover peek. */
  preview?: string;
  /** The staged routine's scoped connectors, shown beside the label. */
  servers?: { id: string; name: string; tone: string }[];
  /** The `{braces}` the prompt expects; shown because nothing fills them in. */
  slots?: string[];
}

type DetectPii = (
  text: string,
  signal?: AbortSignal,
) => Promise<{ matches: { value: string; category: string; uncertain?: boolean }[]; engine: string; error?: string }>;

export interface ComposerProps {
  input: string;
  onInput: (v: string) => void;
  onSubmit: () => void;
  tag?: ComposerTagInfo | null;
  onClearTag?: () => void;
  /** Open what the tag stands for. Absent ⇒ the chip is inert text. */
  onEditTag?: () => void;
  /** Absent/empty ⇒ no compétence picker. */
  competences?: Skill[];
  onPickSkill?: (c: Skill) => void;
  /** Manual redactions merged into the live highlight. */
  forcedRedactions?: { value: string; category: string }[];
  /** Absent ⇒ the manual-redaction menu is not shown. */
  onForceRedact?: (value: string, category: string) => void;
  /** When set, the "Redact" menu offers the Coffre scope. */
  onAddToVault?: (value: string, token: string) => void;
  /** Explicit « retiens que… » capture works here → show the passive hint chip. */
  memoryHint?: boolean;
  attachments: Attachment[];
  onRemoveAttachment: (index: number) => void;
  onRetryAttachment?: (cid: string) => void;
  /** Absent (no `extractAll`) ⇒ the chip states the truncation without offering the action. */
  onOcrAllAttachment?: (cid: string) => void;
  /** A chip whose file was redacted with a different signature offers a re-run. */
  currentRedactSig?: string;
  /** Categories currently OFF, disclosed by the preview so its view never reads as exhaustive. */
  inactiveCategories?: string[];
  conversation: Conversation | null;
  isStreaming: boolean;
  onChangeModel: (convId: string, modelId: string) => void;
  /** Shown with NO conversation yet — the new-chat default. */
  newChatModelId?: string;
  onChangeNewChatModel?: (modelId: string) => void;
  onAccessInfo?: (focus: "free" | "credits" | "key", providerLabel?: string) => void;
  onOpenModelSettings?: () => void;
  modelPickerSimple?: boolean;
  onModelPickerSimpleChange?: (simple: boolean) => void;
  favoriteModels?: string[];
  onToggleFavoriteModel?: (id: string) => void;
  defaultModelId?: string;
  onSetDefaultModel?: (id: string) => void;
  onStop: () => void;
  onAttach: () => void;
  canAttach: boolean;
  /** « + » → Dossier. Absent ⇒ no entry. */
  onAddFolder?: () => void;
  /** « + » → Connecteur. Absent ⇒ no entry. */
  onOpenConnectors?: () => void;
  allowedModelIds?: string[];
  unavailableModels?: ReadonlyMap<string, UnavailableReason>;
  /** The values kept IN CLEAR via the chips; the parent threads them into the send. */
  onKeepListChange?: (keep: string[]) => void;
  onRevealChange?: (cid: string, reveal: string[]) => void;
  onForceRedactDoc?: (cid: string, value: string, token: string) => void;
  onDeleteRedactionDoc?: (cid: string, value: string) => void;
  /** Async model layer of the live preview. Absent ⇒ regex-only. */
  onDetectPii?: DetectPii;
  /** The rules in force; `key` changes with the policy and re-runs the detection. */
  redactPolicy?: { disabledKinds: string[]; key: string };
  /** Absent ⇒ no level button (nowhere to write it). */
  redactLevel?: RedactLevelApi;
}
