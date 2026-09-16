import type { Messages } from "@openmasq/i18n";
import type { PdfDocument } from "../../../host";
import type { RedactLevelApi } from "../ComposerRedactMenu";
import type { AttachmentIntakeApi } from "./useAttachmentIntake";
import type { AttachmentsApi } from "./useAttachments";
import type { ConversationViewApi } from "./useConversationView";
import type { ForcedRedactionsApi } from "./useForcedRedactions";
import type { IntentChipsApi } from "./useIntentChips";
import type { KeyRetryApi } from "./useKeyRetry";
import type { PendingGatesApi } from "./usePendingGates";
import type { RedactPolicy } from "./useRedactPolicy";
import type { ScrollFollowApi } from "./useScrollFollow";
import type { SelectionActionsApi } from "./useSelectionActions";
import type { SendPipelineApi } from "./useSendPipeline";
import type { ChatViewProps } from "./types";

/** Everything the parts render from — built once by `useChatViewModel`, read-only below. */
export interface ChatViewModel {
  p: ChatViewProps;
  t: Messages;
  input: string;
  handleInput: (text: string) => void;
  redactPolicy: RedactPolicy;
  redactLevel: RedactLevelApi | undefined;
  view: ConversationViewApi;
  att: AttachmentsApi;
  intake: AttachmentIntakeApi;
  forced: ForcedRedactionsApi;
  intents: IntentChipsApi;
  sel: SelectionActionsApi;
  scroll: ScrollFollowApi;
  gates: PendingGatesApi;
  keys: KeyRetryApi;
  send: SendPipelineApi;
  /** Platform PDF typesetting when the host has the slot; absent ⇒ the card's own exporter. */
  renderPdf?: (doc: PdfDocument) => Promise<Uint8Array>;
  /** « Signaler un masquage incorrect » — absent when the host has no feedback surface. */
  reportRedaction?: (surface: "message" | "reponse", kind: string) => void;
  connectedMcpIds: string[];
  handleConnectIntegration: (id: string) => void;
}
