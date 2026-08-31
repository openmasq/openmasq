import { ipcRenderer, type IpcRendererEvent } from "electron";
import type { CompleteToolsResult, StreamDone } from "@openmasq/llm";
import type { Detection } from "@openmasq/redact";
import type {
  StartChatPayload,
  ChatHandlers,
  CompletePayload,
  DetectLocalPayload,
  CompleteToolsPayload,
} from "../types";

/** The chat/completion surface — spread at the TOP level of `window.openmasq`
 *  (not a namespace). Wire strings identical to the former inline preload. */
export const chat = {
  /**
   * Begin a streaming chat request. Returns a `cancel` function that aborts the
   * in-flight request and removes all listeners.
   */
  startChat(payload: StartChatPayload, handlers: ChatHandlers): () => void {
    const { requestId } = payload;

    const onChunk = (_e: IpcRendererEvent, delta: string) =>
      handlers.onChunk(delta);
    const onReasoning = (_e: IpcRendererEvent, delta: string) =>
      handlers.onReasoning?.(delta);
    const onDone = (_e: IpcRendererEvent, done?: StreamDone) => {
      cleanup();
      handlers.onDone(done);
    };
    const onError = (_e: IpcRendererEvent, message: string) => {
      cleanup();
      handlers.onError(message);
    };

    function cleanup() {
      ipcRenderer.removeListener(`chat:chunk:${requestId}`, onChunk);
      ipcRenderer.removeListener(`chat:reasoning:${requestId}`, onReasoning);
      ipcRenderer.removeListener(`chat:done:${requestId}`, onDone);
      ipcRenderer.removeListener(`chat:error:${requestId}`, onError);
    }

    ipcRenderer.on(`chat:reasoning:${requestId}`, onReasoning);
    ipcRenderer.on(`chat:chunk:${requestId}`, onChunk);
    ipcRenderer.once(`chat:done:${requestId}`, onDone);
    ipcRenderer.once(`chat:error:${requestId}`, onError);
    ipcRenderer.send("chat:start", payload);

    return () => {
      ipcRenderer.send("chat:cancel", requestId);
      cleanup();
    };
  },

  /** One-shot, non-streaming completion (used by model-based redaction). */
  complete(payload: CompletePayload): Promise<string> {
    return ipcRenderer.invoke("chat:complete", payload);
  },

  /** Offline local PII detection (GLiNER) for the "local AI (offline)" engine. */
  detectLocalPii(payload: DetectLocalPayload): Promise<Detection[]> {
    return ipcRenderer.invoke("redact:detect-local", payload);
  },

  /** Reachability probe of a self-hosted (openai-compat / Ollama) endpoint — true if the
   *  local server answered, false otherwise. Drives the picker's reachable/unreachable tag. */
  probeLocalEndpoint(baseUrl: string): Promise<boolean> {
    return ipcRenderer.invoke("chat:probe-endpoint", baseUrl);
  },

  /** Is the Claude Code CLI installed on this machine? A boolean only
   *  (never a path) — that's what makes the `claude-cli` model exist in the picker. */
  probeClaudeCli(): Promise<boolean> {
    return ipcRenderer.invoke("subscription:cli-available");
  },

  /** Same probe for the Codex CLI — a boolean, never a path. */
  probeCodexCli(): Promise<boolean> {
    return ipcRenderer.invoke("subscription:codex-available");
  },

  /** Non-streaming agentic completion with tool-calling (drives MCP). */
  completeTools(payload: CompleteToolsPayload): Promise<CompleteToolsResult> {
    return ipcRenderer.invoke("chat:complete-tools", payload);
  },

  /**
   * STREAMING agentic tool turn: the assistant text arrives via `onChunk` while the
   * turn is assembled; `onDone` carries the full result (text + tool calls + usage).
   * Returns a cancel fn (Stop) that aborts the in-flight model call — same
   * `requestId` + cancel channel as `cancelTools`, so both paths share one abort.
   */
  streamChatTools(
    payload: CompleteToolsPayload,
    handlers: {
      onChunk: (delta: string) => void;
      onDone: (result: CompleteToolsResult) => void;
      onError: (message: string) => void;
      /** Running char-count of the tool-call arguments the model is streaming + the tool
       *  NAME (a big write_file body arrives with no assistant text) — for the live Debug
       *  Log and the chat "thinking" indicator (a concrete action). */
      onToolArgs?: (chars: number, name?: string) => void;
      /** A delta of the model's live REFLECTION for this agentic turn. */
      onReasoning?: (delta: string) => void;
    },
  ): () => void {
    const requestId = payload.requestId ?? "";
    const onChunk = (_e: IpcRendererEvent, delta: string) => handlers.onChunk(delta);
    const onToolArgs = (_e: IpcRendererEvent, chars: number, name?: string) => handlers.onToolArgs?.(chars, name);
    const onReasoning = (_e: IpcRendererEvent, delta: string) => handlers.onReasoning?.(delta);
    const onDone = (_e: IpcRendererEvent, result: CompleteToolsResult) => {
      cleanup();
      handlers.onDone(result);
    };
    const onError = (_e: IpcRendererEvent, message: string) => {
      cleanup();
      handlers.onError(message);
    };
    function cleanup() {
      ipcRenderer.removeListener(`chat:tools-chunk:${requestId}`, onChunk);
      ipcRenderer.removeListener(`chat:tools-args:${requestId}`, onToolArgs);
      ipcRenderer.removeListener(`chat:tools-reasoning:${requestId}`, onReasoning);
      ipcRenderer.removeListener(`chat:tools-done:${requestId}`, onDone);
      ipcRenderer.removeListener(`chat:tools-error:${requestId}`, onError);
    }
    ipcRenderer.on(`chat:tools-chunk:${requestId}`, onChunk);
    ipcRenderer.on(`chat:tools-args:${requestId}`, onToolArgs);
    ipcRenderer.on(`chat:tools-reasoning:${requestId}`, onReasoning);
    ipcRenderer.once(`chat:tools-done:${requestId}`, onDone);
    ipcRenderer.once(`chat:tools-error:${requestId}`, onError);
    ipcRenderer.send("chat:stream-tools", payload);
    return () => {
      ipcRenderer.send("chat:complete-tools-cancel", requestId);
      cleanup();
    };
  },

  /** Abort an in-flight `completeTools` call (Stop pressed during a tool call). */
  cancelTools(requestId: string): void {
    ipcRenderer.send("chat:complete-tools-cancel", requestId);
  },
};
