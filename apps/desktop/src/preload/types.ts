import type { ChatMessage, ProviderId, StreamDone, ToolDef } from "@openmasq/llm";

export interface StartChatPayload {
  requestId: string;
  provider: ProviderId;
  model: string;
  messages: ChatMessage[];
  apiKey?: string;
  baseUrl?: string;
  temperature?: number;
}

export interface ChatHandlers {
  onChunk: (delta: string) => void;
  /** A delta of the model's live REFLECTION (`@openmasq/llm` `onReasoning`) — its own
   *  channel, so it is shown in place of the loader and never mixed into the answer.
   *  Optional: a model that doesn't reason simply never fires it. */
  onReasoning?: (delta: string) => void;
  /** Stream completion: usage (when reported) + why it ended (`finish`), so the
   *  renderer can flag a truncated (`length`/`cut`) reply as incomplete. */
  onDone: (done?: StreamDone) => void;
  onError: (message: string) => void;
}

export interface CompletePayload {
  provider: ProviderId;
  model: string;
  messages: ChatMessage[];
  apiKey?: string;
  baseUrl?: string;
  temperature?: number;
}

export interface DetectLocalPayload {
  text: string;
}

export interface AppVersions {
  app: string;
  electron?: string;
  chrome?: string;
  node?: string;
  v8?: string;
  os?: string;
}

export interface CompleteToolsPayload {
  provider: ProviderId;
  model: string;
  messages: ChatMessage[];
  tools: ToolDef[];
  apiKey?: string;
  baseUrl?: string;
  temperature?: number;
  /** Correlates the request so `cancelTools(requestId)` can abort it mid-loop. */
  requestId?: string;
  /** Force a tool call this turn (`"required"`); default `"auto"`. */
  toolChoice?: "auto" | "required";
}

export interface McpServerInfo {
  id: string;
  name: string;
  url: string;
  kind: "http" | "stdio";
  connected: boolean;
  authorized: boolean;
  toolCount?: number;
  error?: string;
}

export interface McpEnvField {
  key: string;
  label: string;
  secret?: boolean;
  required?: boolean;
  placeholder?: string;
}

export interface McpParamField {
  key: string;
  label: string;
  kind: "directory";
  required?: boolean;
  /** Accept several grants (e.g. multiple allowed folders). */
  multiple?: boolean;
}

/** The local broker sidecar's URL + the platforms it currently exposes. */
export interface McpBrokerInfo {
  url: string;
  platforms: { id: string; name: string; desc: string; mcpUrl: string }[];
}

/** Live auto-update status, pushed from main as electron-updater progresses. */
export interface UpdateStatus {
  state: "checking" | "available" | "not-available" | "downloading" | "downloaded" | "error";
  version?: string;
  percent?: number;
  message?: string;
}

export interface UpdatesCurrent {
  version: string;
  channel: string;
  installId: string;
}

/** One published desktop release (from the Worker's /desktop/:channel/releases). */
export interface DesktopRelease {
  version: string;
  checksum?: string;
  notes?: string | null;
  size_bytes?: number | null;
  created_at?: string;
  feed_url?: string;
}

export interface UpdatesReleaseList {
  channel: string;
  releases: DesktopRelease[];
}

/** Privileged cross-environment release list (staging + production channels). */
export interface AllDesktopReleases {
  privileged: boolean;
  channels: { channel: string; env: string; releases: DesktopRelease[] }[];
}

/** A local (stdio) server the user can install from the vetted catalog. */
export interface McpCatalogEntry {
  id: string;
  name: string;
  desc: string;
  tone: string;
  commandLine: string;
  inProcess?: boolean;
  env: McpEnvField[];
  params?: McpParamField[];
  note?: string;
  setupUrl?: string;
}
