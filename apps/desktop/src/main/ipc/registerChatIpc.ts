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
 * Inject the encrypted-at-rest API key (the renderer no longer carries it) and
 * scrub any stored key from the outgoing messages — a defensive backstop so a key
 * a user pasted into a prompt never reaches the provider. `redaction` resolves the
 * dedicated redaction-model key first, then the provider's own key.
 */
function withKey<
  T extends {
    provider: string;
    apiKey?: string;
    model?: string;
    messages: { role: string; content: string; }[];
  }
>(options: T, redaction = false): T {
  // SECURITY (audit M4, hardened): do NOT seed the fetch-host allow-list from OUTGOING
  // renderer message text. A renderer XSS could inject `attacker.com` into a message, get
  // it whitelisted here (even if the send then errors), and exfiltrate the vault via
  // `files:fetch-url`/`links:preview` (the secret rides the outbound query string, which
  // leaves BEFORE any response check). The allow-list is now seeded ONLY from content main
  // RECEIVED — the streamed provider reply (below) and MCP tool results (`callTool.ts`) —
  // which a renderer cannot forge. Residual: previewing a link the user only ever TYPED
  // (never received) needs a future explicit per-URL user grant.
  const rendererKey = options.apiKey; // supplied by the renderer (BYO key, or a platform Supabase token)



  // ⛔ Managed account: a STORED personal key is no longer injected — refusing only the
  // WRITE would do nothing against a key set before joining. The REDACTION model's key
  // stays injected: removing it would degrade protection (`store/keysPolicy.ts`).
  const storedProviderKey = isByoKeysBlocked() ? undefined : getKey(options.provider);
  const apiKey = rendererKey || (redaction ? getKey("redactModel") : undefined) || storedProviderKey;
  // WHERE this call may be POSTed, and with which key — audit H1/H-2/M5, decided in ONE
  // place (`net/providerEndpoint.ts`, the egress family) so the rule is an allow-list and
  // a provider id nobody enumerated can't fall through it. Throws on a refused endpoint.
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
      // Manual iteration so we can capture the generator's RETURN value (token
      // usage) — `for await` would discard it. The final next() carries usage.
      // The model's live reflection rides its OWN channel — never appended to `reply`.
      const onReasoning = (delta: string) => send("chat:reasoning", delta);
      // `claude-cli`/`codex-cli`: one of the user's local CLIs (subscription/) — neither
      // key nor endpoint, so neither `withKey` nor an egress decision; CLI absent ⇒ `chat:error`.
      const cli = subscriptionCliFor(options.provider);
      const it = cli
        ? streamSubscriptionTurn(subscriptionTurnEnv(cli), {
          messages: options.messages,
          modelId: options.model,
          signal: controller.signal,
          onReasoning,
          // The subscription quota rides the turn (claude): remembered, not streamed —
          // Réglages → Modèles reads it back through `subscription:account`.
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
      // Record hosts in the model's reply too (a link the model surfaced can be previewed) —
      // before `chat:done` reaches the renderer, so `links:preview` finds the host (audit M4).
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

  // One-shot, non-streaming completion. Used by the optional model-based
  // redaction proxy to ask a local model which spans of a message are sensitive.
  // Reuses the streaming providers and just accumulates the full reply.
  ipcMain.handle(
    "chat:complete",
    async (_event, options: Omit<StreamChatOptions, "signal">) => {
      let out = "";
      // Same routing as `chat:start`: the subscription also serves out-of-band
      // completions (memory extraction, compaction).
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

  // Agentic completion with tool-calling (drives MCP). Non-streaming: returns
  // the assistant text + any tool calls the model wants to run this turn.
  // The agentic turn isn't streamed, so a renderer AbortSignal can't cross IPC.
  // Correlate each call by `requestId` and let `chat:complete-tools-cancel` abort
  // the in-flight provider fetch — so Stop works mid tool-loop, like `chat:cancel`
  // does for streaming.
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

  // STREAMING agentic tool turn: same as chat:complete-tools but the assistant text
  // streams (so the final answer isn't held back as one blob after a long turn).
  // Emits `chat:tools-chunk:<id>` deltas, then `chat:tools-done:<id>` with the full
  // result, or `chat:tools-error:<id>`. Reuses `toolControllers` + the SAME
  // `chat:complete-tools-cancel` channel so Stop aborts both paths. Providers whose
  // tool turn can't stream (Anthropic/Google) fall back to a single non-streamed done.
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
          // Live progress of the tool-call ARGUMENT length + the tool NAME (a big
          // write_file HTML streams for seconds with no assistant text) → the renderer's
          // Debug Log AND the chat "thinking" indicator (a concrete action).
          onToolArgs: (chars: number, name?: string) => send("chat:tools-args", chars, name),
          // Same live reflection as the plain stream (`chat:start`), for the agentic turn.
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
        // On abort the renderer already settled its promise (its signal fired) and
        // removed listeners; a late error here is harmless (the loop returns null
        // because its own signal is aborted). Non-abort errors surface normally.
        send("chat:tools-error", err instanceof Error ? err.message : String(err));
      } finally {
        if (requestId) toolControllers.delete(requestId);
      }
    }
  );

  return () => controllers.size > 0;
}
