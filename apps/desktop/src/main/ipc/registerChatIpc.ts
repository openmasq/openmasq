// The `chat:*` channels — streaming and one-shot completions, tool turns — and the key
// injection every provider call goes through (`withKey`: stored key, endpoint decision, scrub).
import { app, ipcMain } from "electron";
import { type StreamChatOptions, streamChat, type CompleteToolsOptions, completeWithTools, supportsStreamingTools, streamWithTools } from "@openmasq/llm";
import { e2eWireLog } from "./e2eWireLog";
import { noteFetchHostsFromText } from "../net/fetchAllow";
import { decideProviderEndpoint } from "../net/providerEndpoint";
import { getKey, scrubKeys } from "../store/keys";
import { isByoKeysBlocked } from "../store/keysPolicy";
import { noteClaudeRateLimit } from "../subscription/account";
import { subscriptionCliFor, subscriptionTurnEnv } from "../subscription/desktop";
import { subscriptionToolsRoute } from "../subscription/toolsRoute";
import { streamSubscriptionTurn } from "../subscription/turn";

interface ChatStartPayload extends Omit<StreamChatOptions, "signal"> {
  requestId: string;
}
/**
 * Inject the encrypted-at-rest API key (the renderer never carries it) and scrub any
 * stored key from the outgoing messages (a pasted key never reaches the provider).
 * `redaction` resolves the dedicated redaction-model key first.
 */
function withKey<
  T extends {
    provider: string;
    apiKey?: string;
    model?: string;
    messages: { role: string; content: string; }[];
  }
>(options: T, redaction = false): T {
  // SECURITY: the fetch-host allow-list is NEVER seeded from OUTGOING renderer text (an
  // XSS would whitelist `attacker.com` and exfiltrate through `files:fetch-url`), only
  // from content main RECEIVED (the reply below, MCP tool results). Residual: previewing
  // a link the user only TYPED needs an explicit per-URL grant.
  const rendererKey = options.apiKey; // BYO key, or a platform token
  // ⛔ Managed account: a STORED personal key is not injected (refusing only the WRITE
  // would do nothing against a key set before joining). The REDACTION model's key stays
  // injected: removing it would degrade protection (`store/keysPolicy.ts`).
  const storedProviderKey = isByoKeysBlocked() ? undefined : getKey(options.provider);
  const apiKey = rendererKey || (redaction ? getKey("redactModel") : undefined) || storedProviderKey;
  // WHERE this call may be POSTed, and with which key: decided in ONE place
  // (`net/providerEndpoint.ts`). Throws on a refused endpoint.
  const decided = decideProviderEndpoint(
    { provider: options.provider, apiKey, baseUrl: (options as { baseUrl?: string; }).baseUrl },
    { rendererSuppliedKey: !!rendererKey, packaged: app.isPackaged }
  );
  if (decided.warn) console.warn(`[keys] ${decided.warn}`);
  const out: T = {
    ...options,
    apiKey: decided.apiKey,
    messages: options.messages.map((m) => ({ ...m, content: scrubKeys(m.content) })),
  };
  // Absent ⇒ the provider's canonical host. Assign rather than delete: `undefined` is what
  // every `opts.baseUrl || default` in @openmasq/llm reads as "use the default".
  (out as { baseUrl?: string; }).baseUrl = decided.baseUrl;
  return out;
}
/** Returns an "any in-flight streams?" probe — an update's auto-install
 *  (`updates/autoInstall.ts`) holds off as long as a `chat:*` is streaming. */
export function registerChatHandlers(): () => boolean {
  const controllers = new Map<string, AbortController>();

  ipcMain.on("chat:start", async (event, payload: ChatStartPayload) => {
    const { requestId, ...options } = payload;
    const controller = new AbortController();
    controllers.set(requestId, controller);

    e2eWireLog(options);

    const send = (channel: string, ...args: unknown[]) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send(`${channel}:${requestId}`, ...args);
      }
    };

    try {
      // Manual iteration to capture the generator's RETURN value (token usage), which
      // `for await` would discard. Reasoning rides its OWN channel, never `reply`.
      const onReasoning = (delta: string) => send("chat:reasoning", delta);
      // A subscription CLI (subscription/): neither key nor endpoint, so neither
      // `withKey` nor an egress decision.
      const cli = subscriptionCliFor(options.provider);
      const it = cli
        ? streamSubscriptionTurn(subscriptionTurnEnv(cli), {
          messages: options.messages,
          modelId: options.model,
          signal: controller.signal,
          onReasoning,
          // The subscription quota rides the turn: remembered, read back via `subscription:account`.
          onRateLimit: noteClaudeRateLimit,
        })
        : streamChat({ ...withKey(options), signal: controller.signal, onReasoning });
      let r = await it.next();
      let reply = "";
      while (!r.done) {
        if (typeof r.value === "string") reply += r.value;
        send("chat:chunk", r.value);
        r = await it.next();
      }
      // Hosts in the reply seed the allow-list BEFORE `chat:done` reaches the renderer.
      noteFetchHostsFromText(reply);
      send("chat:done", r.value);
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        send("chat:done");
      } else {
        send("chat:error", err instanceof Error ? err.message : String(err));
      }
    } finally {
      controllers.delete(requestId);
    }
  });

  ipcMain.on("chat:cancel", (_event, requestId: string) => {
    controllers.get(requestId)?.abort();
    controllers.delete(requestId);
  });

  // One-shot completion (the model-based redaction pass, memory extraction, compaction).
  ipcMain.handle(
    "chat:complete",
    async (_event, options: Omit<StreamChatOptions, "signal">) => {
      let out = "";
      // Same routing as `chat:start`.
      const cli = subscriptionCliFor(options.provider);
      const it = cli
        ? streamSubscriptionTurn(subscriptionTurnEnv(cli), {
          messages: options.messages,
          modelId: options.model,
        })
        : streamChat(withKey(options, true));
      for await (const delta of it) out += delta;
      return out;
    }
  );

  // Agentic completion with tool-calling, non-streaming. A renderer AbortSignal can't
  // cross IPC: each call is correlated by `requestId` so `chat:complete-tools-cancel`
  // aborts the in-flight fetch.
  const toolControllers = new Map<string, AbortController>();
  ipcMain.handle(
    "chat:complete-tools",
    async (
      _e,
      options: Omit<CompleteToolsOptions, "signal"> & { requestId?: string; }
    ) => {
      const { requestId, ...rest } = options;
      const controller = new AbortController();
      if (requestId) toolControllers.set(requestId, controller);
      e2eWireLog(rest as Parameters<typeof e2eWireLog>[0]);
      try {
        // A subscription CLI serves this turn ⇒ neither key nor egress (`subscription/toolsRoute`).
        const sub = subscriptionToolsRoute(rest, { signal: controller.signal });
        if (sub) return await sub;
        return await completeWithTools({ ...withKey(rest), signal: controller.signal });
      } finally {
        if (requestId) toolControllers.delete(requestId);
      }
    }
  );
  ipcMain.on("chat:complete-tools-cancel", (_e, requestId: string) => {
    toolControllers.get(requestId)?.abort();
    toolControllers.delete(requestId);
  });

  // STREAMING agentic tool turn: `chat:tools-chunk:<id>` deltas, then `chat:tools-done:<id>`
  // or `chat:tools-error:<id>`. Same `toolControllers` + cancel channel, so Stop aborts both
  // paths. A provider whose tool turn can't stream falls back to a single done.
  ipcMain.on(
    "chat:stream-tools",
    async (event, options: Omit<CompleteToolsOptions, "signal"> & { requestId?: string; }) => {
      const { requestId, ...rest } = options;
      const controller = new AbortController();
      if (requestId) toolControllers.set(requestId, controller);
      e2eWireLog(rest as Parameters<typeof e2eWireLog>[0]);
      const send = (channel: string, ...args: unknown[]) => {
        if (requestId && !event.sender.isDestroyed()) {
          event.sender.send(`${channel}:${requestId}`, ...args);
        }
      };
      try {
        // Same routing, streaming the text: deltas as they arrive then ONE `done`.
        const sub = subscriptionToolsRoute(rest, {
          signal: controller.signal,
          onDelta: (text) => send("chat:tools-chunk", text),
          onReasoning: (delta) => send("chat:tools-reasoning", delta),
        });
        if (sub) return void send("chat:tools-done", await sub);
        const opts = {
          ...withKey(rest),
          signal: controller.signal,
          // Live progress of the tool-call ARGUMENT length + NAME (a big write streams
          // for seconds with no assistant text).
          onToolArgs: (chars: number, name?: string) => send("chat:tools-args", chars, name),
          onReasoning: (delta: string) => send("chat:tools-reasoning", delta),
        };
        if (supportsStreamingTools(opts.provider)) {
          const it = streamWithTools(opts);
          let r = await it.next();
          while (!r.done) {
            send("chat:tools-chunk", r.value);
            r = await it.next();
          }
          send("chat:tools-done", r.value);
        } else {
          // Non-streaming providers: one blob, delivered as a single done.
          send("chat:tools-done", await completeWithTools(opts));
        }
      } catch (err) {
        // On abort the renderer already settled; a late error here is harmless.
        send("chat:tools-error", err instanceof Error ? err.message : String(err));
      } finally {
        if (requestId) toolControllers.delete(requestId);
      }
    }
  );

  return () => controllers.size > 0;
}
