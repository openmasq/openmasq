import { join } from "node:path";
import { readFile, unlink } from "node:fs/promises";
import type { McpTool, McpToolCall, McpToolResult } from "@openmasq/mcp";
import { isWriteToolName } from "../writeGate";
import { confirmWrite, isToolWriteApproved, isWriteAutoApproved } from "../writeConfirmWindow";
import { confirmationSurface, writeRisk } from "@openmasq/catalog/mcp";
import { getConfirmationMode } from "../confirmationMode";
import { blockedConnectorError, isConnectorBlocked } from "../orgPolicy";
import { routes, refreshRoutes } from "./registry";
import { ensureBrowserConnLive, reconnectBrowserConn } from "./connect";
import { isRecoverableBrowserError } from "./browserHeal";
import { BROWSER_ID } from "./types";
import {
  browserMcpOutputDir,
  BROWSER_TOOL_ALLOWLIST,
  isAllowedBrowserUrl,
  rewriteSearchEngine,
} from "../browserTools";
import { outputLinkBasenames, inlineOutputLinks } from "../browser/snapshotInline";
import { noteFetchHostsFromText } from "../../net/fetchAllow";
import { assertPublicUrl } from "../../net/net";
import { devOnly } from "../../security/devOnly";

/** @playwright/mcp externalises a page snapshot to a file in our output dir and returns
 *  ONLY a link; fold the content back into the result, then delete the file (an
 *  authenticated page's tree shouldn't linger on disk). Keyed by BASENAME under our own
 *  dir, so a `../` link can't escape it. Best-effort. */
async function inlineBrowserOutputFiles(result: McpToolResult): Promise<void> {
  const dir = browserMcpOutputDir();
  for (const part of result.content) {
    if (part.type !== "text") continue;
    const p = part as { type: "text"; text: string };
    if (typeof p.text !== "string" || !p.text) continue;
    const bases = outputLinkBasenames(p.text);
    if (!bases.length) continue;
    const contents = new Map<string, string>();
    await Promise.all(
      bases.map(async (b) => {
        try {
          contents.set(b, await readFile(join(dir, b), "utf-8"));
        } catch {
          /* file gone / unreadable → leave the link */
        }
      }),
    );
    if (!contents.size) continue;
    const { text, inlined } = inlineOutputLinks(p.text, (b) => contents.get(b));
    p.text = text;
    for (const b of inlined) void unlink(join(dir, b)).catch(() => {});
  }
}

/** The server a namespaced tool call belongs to (`gmail__send` → `gmail`). */
function serverIdOf(callName: string): string | undefined {
  const i = callName.indexOf("__");
  return i > 0 ? callName.slice(0, i) : undefined;
}

/** The text of an `isError` tool RESULT, for the recoverable-error classifier. */
function resultErrorText(result: McpToolResult): string {
  return result.content
    .map((p) => (p.type === "text" ? ((p as { text?: string }).text ?? "") : ""))
    .join("\n");
}

/**
 * MAIN-side write gate. A MUTATING non-browser tool is confirmed on a surface the untrusted
 * renderer cannot script: an explicit click on a MAIN-OWNED window (`confirmWrite`). FAIL
 * CLOSED — refuse / close / timeout ⇒ refused. Browser tools are exempt (own allow-list +
 * SSRF gate). The confirm impl is injectable for tests (`__setWriteConfirmImpl`).
 *
 * Whether the window opens is decided by the ONE policy main and the renderer share
 * (`@openmasq/catalog/mcp` `confirmationSurface`), fed main's own facts: the main-owned
 * `confirmationMode` and the `writeRisk` verdict.
 *
 * ⚠️ ACCEPTED RESIDUAL: in the default standard mode the policy routes NO write here, so a
 * renderer XSS could dispatch a write confirmed only by the renderer card. What bounds it:
 * DOWNGRADING the mode needs a click on this same un-spoofable window, and every other
 * main-side gate is unchanged. Mode renforcé restores the boundary.
 */
export async function assertWriteAllowed(
  call: McpToolCall,
  route: { realName: string; annotations?: McpTool["annotations"] },
): Promise<void> {
  if (call.name.startsWith(`${BROWSER_ID}__`)) return; // browser: gated elsewhere
  if (!isWriteToolName(route.realName, route.annotations)) return; // read-only: no gate
  // Main's own facts only, never a renderer flag. Main knows only `risk` (absent counters
  // read as 0): enough to answer the one question it owns. The renderer's copy is UX.
  const rule = confirmationSurface(getConfirmationMode(), {
    risk: writeRisk(route.realName, {
      serverId: serverIdOf(call.name),
      annotations: route.annotations,
    }),
  });
  if (rule?.surface !== "system-modal") return;
  // Session auto-approve, armed ONLY via the un-spoofable window (not a renderer bypass).
  if (isWriteAutoApproved() || isToolWriteApproved(route.realName)) return;
  const approved = await confirmWrite({ toolName: route.realName, args: call.arguments });
  if (!approved) {
    throw new Error(
      `Action d'écriture refusée par l'utilisateur : ${route.realName}. Ne relance pas ` +
        `cette écriture sans nouvelle instruction — propose une alternative ou demande ` +
        `à l'utilisateur comment procéder.`,
    );
  }
}

export async function mcpCallTool(call: McpToolCall): Promise<McpToolResult> {
  // Browser tools first SELF-HEAL a stale @playwright/mcp connection (the child can be
  // respawned under it). BEFORE route resolution: the heal rebuilds the routes.
  if (call.name.startsWith(`${BROWSER_ID}__`)) await ensureBrowserConnLive();
  let route = routes.get(call.name);
  if (!route) {
    await refreshRoutes();
    route = routes.get(call.name);
  }
  if (!route) throw new Error(`Unknown MCP tool: ${call.name}`);
  // Org policy, replayed HERE (the renderer's filter is UX). Before the write gate: a
  // blocked connector must not even reach a confirmation. `orgPolicy.ts` states the scope.
  const server = serverIdOf(call.name);
  if (isConnectorBlocked(server)) throw blockedConnectorError(server!);
  await assertWriteAllowed(call, route);
  if (call.name.startsWith(`${BROWSER_ID}__`)) {
    // Defence in depth: a non-allow-listed browser tool is never routed, but a renderer
    // XSS could call it by raw name — deny at the call site too.
    if (!BROWSER_TOOL_ALLOWLIST.has(route.realName)) {
      throw new Error(`Outil navigateur non autorisé : ${route.realName}`);
    }
    // `browser_navigate` AND `browser_tabs` (`action:"new"` opens a tab AT `args.url`)
    // both carry a model-supplied URL: gate BOTH, else opening a tab bypasses the floor.
    if ((route.realName === "browser_navigate" || route.realName === "browser_tabs") &&
        typeof call.arguments?.url === "string" && call.arguments.url) {
      let url = call.arguments.url;
      // Steer Google searches to DuckDuckGo (Google CAPTCHAs automation); query preserved.
      const rewritten = rewriteSearchEngine(url);
      if (rewritten !== url) {
        url = rewritten;
        call.arguments = { ...call.arguments, url };
      }
      if (!isAllowedBrowserUrl(url)) {
        throw new Error(`Navigation bloquée (schéma non autorisé) : ${url}`);
      }
      // SSRF floor: a prompt-injected page could steer the model into probing internal
      // services. Skips about:blank (no host).
      if (url.trim().toLowerCase() !== "about:blank") {
        try {
          await assertPublicUrl(url, "tool-result-fetch");
        } catch (e) {
          // Both outcomes BLOCK (fail closed), but a network outage must not wear the
          // security label: the model would give up on the browser instead of retrying.
          if ((e as NodeJS.ErrnoException)?.code === "EDNS_UNRESOLVED") {
            throw new Error(
              // « injoignable »/« réseau » → classifyToolError: transport (retryable).
              `Navigation impossible : réseau ou DNS injoignable (${new URL(url).hostname}). ` +
                `Vérifie la connexion, puis réessaie.`,
            );
          }
          throw new Error(`Navigation bloquée (adresse interne/privée) : ${url}`);
        }
      }
    }
  }
  // Opt-in RAW wire log (`OPENMASQ_MCP_RAW_LOG=1`), DEV-ONLY: it prints the REAL,
  // un-redacted arguments and the raw reply.
  const rawLog = !!devOnly(process.env.OPENMASQ_MCP_RAW_LOG);
  if (rawLog) {
    console.log(`[mcp:raw] → ${route.realName} args=${JSON.stringify(call.arguments)}`);
  }
  const dispatch = (r: NonNullable<typeof route>): Promise<McpToolResult> =>
    r.server.callTool({ id: call.id, name: r.realName, arguments: call.arguments });
  let result: McpToolResult;
  if (call.name.startsWith(`${BROWSER_ID}__`)) {
    try {
      result = await dispatch(route);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      // A LIVE-but-broken pwmcp connection (lost page / zero-tab race) the staleness
      // heal can't see. Reconnect and retry ONCE; a genuine tool error is rethrown.
      if (!isRecoverableBrowserError(msg)) throw err;
      await reconnectBrowserConn("recoverable browser tool error");
      const r2 = routes.get(call.name);
      if (!r2) throw err;
      result = await dispatch(r2);
    }
    // ⚠️ The SAME heal on the RESULT path: pwmcp reports a tool failure as a NORMAL
    // result with `isError:true`, not a throw, and this state is REACHED in normal use
    // (Electron never emits `targetCreated` for a tab opened after the connect). Only a
    // fresh connect re-enumerates the live tabs. Retry ONCE; the retried result stands.
    if (result.isError && isRecoverableBrowserError(resultErrorText(result))) {
      await reconnectBrowserConn("recoverable browser tool error (isError result)");
      const r2 = routes.get(call.name);
      if (r2) result = await dispatch(r2);
    }
  } else {
    result = await dispatch(route);
  }
  // Fold the externalised snapshot FILES back inline so the model receives the page.
  if (call.name.startsWith(`${BROWSER_ID}__`)) {
    await inlineBrowserOutputFiles(result).catch(() => {});
  }
  if (rawLog) {
    const preview = JSON.stringify(result.content)?.slice(0, 800);
    console.log(`[mcp:raw] ← ${route.realName} isError=${result.isError ?? false} result=${preview}`);
  }
  // Record hosts in the tool result so a URL it surfaced can be downloaded via
  // files:fetch-url without an arbitrary-host exfil channel.
  //
  // ⚠️ EXCEPT the BROWSER. The allow-list only holds because it is seeded from content
  // RECEIVED from a server the user connected. A browser result is the page's OWN text:
  // browsing evil.com would make evil.com fetch-allowed, the attacker picking the host. A
  // genuine export still arrives via `onFileUrl`/`noteFetchHost`, which is structural.
  if (!call.name.startsWith(`${BROWSER_ID}__`)) {
    for (const part of result.content) {
      if (part.type === "text") noteFetchHostsFromText((part as { text?: string }).text);
    }
  }
  return result;
}
