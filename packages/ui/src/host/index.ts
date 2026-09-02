import { createContext, useContext } from "react";
import type { CompleteToolsResult, SubscriptionAccount } from "@openmasq/llm";
import type { Detection } from "@openmasq/redact";
import type {
  StartChatPayload,
  ChatHandlers,
  CompletePayload,
  DetectLocalPayload,
  CompleteToolsPayload,
  CompleteToolsHandlers,
} from "./chat";
import type { McpHost } from "./mcp";
import type { BrowserHost } from "./browser";
import type { DbHost, FilesHost } from "./files";
import type { EmbeddingsHost, MemoryIndexHost } from "./embeddings";
import type { CloudFsHost } from "./cloudFs";
import type { LocalFsHost } from "./localFs";
import type { AuthHost, SyncHost, OrgHost, FeedbackHost } from "./account";
import type { BillingHost } from "./billing";
import type { OrgSharesHost } from "./orgShares";
import type { AppHost, EnvHost, UpdatesHost } from "./updates";
import type {
  KeysHost,
  MediaHost,
  LinksHost,
  NotifyHost,
  ClaudeSkillsHost,
  PythonHost,
  PdfHost,
  WebHost,
} from "./platform";
import type { ModelsHost } from "./models";

// Public surface: every Host domain re-exported so `import … from "./"` is
// unchanged — the file just became a folder (split by domain, hard rule 2).
export * from "./chat";
export * from "./mcp";
export * from "./browser";
export * from "./files";
export * from "./embeddings";
export * from "./cloudFs";
export * from "./localFs";
export * from "./account";
export * from "./billing";
export * from "./orgShares";
export * from "./updates";
export * from "./platform";
export * from "./models";

/**
 * Platform abstraction. The UI never talks to Electron / a mobile shell
 * directly — it talks to a `Host`. Each platform provides an implementation:
 * the desktop app wraps its Electron preload bridge, a mobile shell would wrap
 * its own native bridge. This is what makes the UI reusable across platforms.
 *
 * The composite interface — each capability lives in its own domain file
 * (`chat`/`mcp`/`browser`/`files`/`account`/`updates`/`platform`); this barrel
 * assembles them and owns the React context.
 */
export interface Host {
  /** Stream a chat completion via the platform's transport. Returns cancel(). */
  startChat(payload: StartChatPayload, handlers: ChatHandlers): () => void;
  /** Optional app/runtime version metadata (desktop only). */
  app?: AppHost;
  /** Optional auto-update controls (desktop only). Absent = no updates UI. */
  updates?: UpdatesHost;
  /** Optional runtime environment (production/staging) + its switch (desktop only). */
  env?: EnvHost;
  /** Optional file text extraction for attachments. */
  files?: FilesHost;
  /** Optional embeddings store (local libSQL vectors on desktop). */
  embeddings?: EmbeddingsHost;
  /** Optional MÉMOIRE semantic index (on-device embeddings; see `files.ts`). */
  memoryIndex?: MemoryIndexHost;
  /** Optional durable storage (Turso). When absent, localStorage is used. */
  db?: DbHost;
  /**
   * Optional one-shot completion (non-streaming). Present only on platforms that
   * can reach a local/model endpoint; required for model-based redaction. When
   * absent, redaction falls back to the built-in pattern rules.
   */
  complete?(payload: CompletePayload): Promise<string>;
  /**
   * Optional LLM-free local PII detector (BERT NER via transformers.js, runs
   * in-process — desktop main / offscreen). Powers the "IA locale (hors-ligne)"
   * redaction engine: detects free-form PII (names/orgs/places) with NO network
   * and NO model completion. Returns verbatim `{value, category}` spans. Absent =
   * engine unavailable on this platform (falls back to the pattern rules).
   */
  detectLocalPii?(payload: DetectLocalPayload): Promise<Detection[]>;
  /**
   * Optional reachability probe for a self-hosted (openai-compat) endpoint — a short,
   * loopback/public-guarded request from MAIN (the renderer can't reach localhost under the
   * CSP). Resolves `true` if the server answered at all, `false` on network error/timeout.
   * Used to show "serveur joignable / injoignable" in the model picker. Absent on platforms
   * with no way to probe (browser preview) → the picker simply doesn't show the status.
   */
  probeLocalEndpoint?(baseUrl: string): Promise<boolean>;
  /**
   * Optional presence probe of the user's Claude Code CLI (the `claude-cli` provider —
   * their Claude SUBSCRIPTION, served by their own installed CLI in the desktop main).
   * `true` = installed on this machine. Absent (browser preview, mobile) or `false` ⇒
   * the `claude-cli` model is NOT offered — a platform that can't spawn the CLI must
   * not advertise it (fail-closed availability, like `detectLocalPii`).
   */
  probeClaudeCli?(): Promise<boolean>;
  /** Même sonde pour la CLI Codex (fournisseur `codex-cli` — l'abonnement ChatGPT
   *  de l'utilisateur via sa propre CLI). Mêmes règles fail-closed. */
  probeCodexCli?(): Promise<boolean>;
  /** Même sonde pour la CLI Antigravity `agy` (fournisseur `antigravity-cli` —
   *  l'abonnement Google de l'utilisateur). Mêmes règles fail-closed. */
  probeAntigravityCli?(): Promise<boolean>;
  /**
   * What a subscription CLI says about ITS account — plan, quota windows, models — read
   * by spawning the CLI (never its credentials). `null` = absent or silent, a NORMAL
   * state. Optional: a host that can't spawn simply shows no account card.
   */
  readSubscriptionAccount?(cli: "claude" | "codex" | "antigravity"): Promise<SubscriptionAccount | null>;
  /**
   * Mirror the per-CLI opt-in to the privileged process, which holds the AUTHORITATIVE
   * flag. The chat channels route on a renderer-supplied provider id, so "the user asked
   * for their own subscription CLI to be spawned" cannot be a fact the interface keeps to
   * itself — main defaults every CLI to off and refuses to build a turn environment for
   * one that was never mirrored on.
   */
  setSubscriptionEnabled?(cli: "claude" | "codex" | "antigravity", on: boolean): Promise<void>;
  /** Non-streaming agentic completion with tools (drives MCP). */
  completeTools?(payload: CompleteToolsPayload): Promise<CompleteToolsResult>;
  /**
   * STREAMING agentic tool turn: same as {@link completeTools} but the assistant
   * TEXT streams token-by-token via `onChunk` while any tool calls are assembled,
   * so the final answer (and interim reasoning) isn't held back as one blob after
   * a long turn. `onDone` carries the full {@link CompleteToolsResult} (text +
   * tool calls + usage). Returns a cancel fn (aborts the in-flight model call,
   * paired with the same `requestId` as `cancelTools`). Optional — when absent the
   * agentic loop falls back to `completeTools`; a platform whose provider can't
   * stream tools may implement it by delegating to the non-streaming path (single
   * `onDone`, no chunks). */
  streamChatTools?(
    payload: CompleteToolsPayload,
    handlers: CompleteToolsHandlers,
  ): () => void;
  /** Abort the in-flight `completeTools` call with this `requestId` (Stop during
   *  a tool-calling turn). No-op if the request already finished. */
  cancelTools?(requestId: string): void;
  /** Optional MCP connector capability (remote tools over HTTP+OAuth). */
  mcp?: McpHost;
  /** Optional browsing of the folders granted to the Filesystem connector — the
   *  Bibliothèque's « Dossiers » tab. Absent (browser preview, mobile) ⇒ the tab is
   *  not drawn. Deliberately NOT routed through `mcp.callTool`: see `./localFs.ts`. */
  localFs?: LocalFsHost;
  /** Parcours d'un stockage connecté (Drive, OneDrive). Absent ⇒ le groupe « Stockage
   *  connecté » n'est pas navigable — il reste listé avec son état. Voir `./cloudFs.ts`. */
  cloudFs?: CloudFsHost;
  /** Optional live view/control of the agent browser (the isolated Chromium the
   *  model drives). Powers the split-screen browser panel. Absent = no split view
   *  (e.g. the browser preview, which has no separate window to overlay). */
  browser?: BrowserHost;
  /** Optional account auth (Supabase on desktop). Absent = no login gate. */
  auth?: AuthHost;
  /** Optional cross-device sync (E2E vault sync + connected devices). Absent =
   *  no sync settings surface. */
  sync?: SyncHost;
  /** Optional organization authorization (membership/role + allowed-models &
   *  mandated-redaction policy). Absent = no org concept (solo app). */
  org?: OrgHost;
  /** Optional org SHARES (vault/skills toward the org, a team or a person, behind an
   *  approval). Absent ⇒ no « Partager » button and no approval box — the mirrors stay
   *  read-only. */
  orgShares?: OrgSharesHost;
  /** Optional individual (per-person) billing — subscription + prepaid credits +
   *  checkout/portal. Absent = no personal billing UI (e.g. browser preview). */
  billing?: BillingHost;
  /** Optional user-feedback transport ("Votre avis"). Absent = the rail's avis
   *  action is not rendered (there is nowhere to send it). */
  feedback?: FeedbackHost;
  /** Optional encrypted-at-rest API key store. Absent = keys live in settings. */
  keys?: KeysHost;
  /** Optional microphone access gate (macOS TCC). Absent = record directly. */
  media?: MediaHost;
  /** Optional OS notification when a reply lands off-screen (opt-out via
   *  `Settings.notifyOnReply`). Absent ⇒ no banner, and no setting to promise one. */
  notify?: NotifyHost;
  /** Optional read of the Claude Code skills already on this machine (import in two
   *  clicks). Absent ⇒ the button isn't drawn; dropping a folder still works. */
  claudeSkills?: ClaudeSkillsHost;
  /** Optional OpenGraph link-unfurl (opt-in via `Settings.linkPreviews`). */
  links?: LinksHost;
  /** Optional sandboxed Python execution (code interpreter). Present on the desktop;
   *  surfaced to the model as the `run_python` tool whenever this slot exists. */
  python?: PythonHost;
  /** Optional HTML→PDF typesetter for a model-authored ```document (real brand fonts,
   *  Unicode, tables). Absent ⇒ the card's PDF is built in-renderer with pdf-lib. */
  pdf?: PdfHost;
  /** Optional BATCH web reader — fetches several URLs concurrently over `safeFetch`.
   *  Present on the desktop; surfaced as the `web_fetch_many` tool when this exists. */
  web?: WebHost;
  /** Optional live model-catalogue reader (OpenRouter today). Absent ⇒ the pickers use
   *  the static registry baseline only. Fetch runs in main; DEGRADE, never fail. */
  models?: ModelsHost;
  /**
   * Optional build-time URL of the remote redaction function (`apps/gateway`).
   * When set (and the user picks the "remote" engine), model-grade redaction runs
   * server-side with the current Supabase token (`auth.getAccessToken`). A user
   * setting (`Settings.redactFnUrl`) overrides this. Absent while the "remote"
   * engine is selected = FAIL-CLOSED: the send is blocked (never downgraded).
   */
  redactFnUrl?: string;
  /**
   * Optional base URL of the backend's OpenAI-compatible INFERENCE proxy
   * (`<VITE_BACKEND_URL>/v1/inference`). Platform-provided models
   * (`isPlatformProvider`, e.g. Scaleway) send here with the user's Supabase
   * token as the bearer — the platform holds the provider key and meters credits.
   * Absent = platform models can't send (they have no user key).
   */
  inferenceUrl?: string;
  /**
   * Optional URL of the release-notes endpoint served by `apps/analytics-fn`
   * (`https://analytics.<domain>/release-notes`). Powers the "Nouveautés"
   * panel in Settings → Versions. The renderer derives it from the analytics-fn
   * base (VITE_ANALYTICS_RELAY_URL minus its `/e` suffix). Absent = the panel
   * degrades to a "unavailable" notice (browser preview, or relay not deployed).
   */
  releaseNotesUrl?: string;
}

const HostContext = createContext<Host | null>(null);

export const HostProvider = HostContext.Provider;

export function useHost(): Host {
  const host = useContext(HostContext);
  if (!host) {
    throw new Error("useHost must be used within a <HostProvider>");
  }
  return host;
}

