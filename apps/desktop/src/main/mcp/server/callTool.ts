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

/** @playwright/mcp 0.0.77 externalises an action's page snapshot (+ console/network
 *  logs) to a `.yml`/`.log` file in our temp output dir and returns ONLY a markdown
 *  link, so the model would get NO page content after a navigate/click (the reported
 *  "web search returns nothing" bug — there is no config in this version to inline it).
 *  Read the linked file(s) back and fold their content into the result, then delete
 *  them (the accessibility tree of a possibly-authenticated page shouldn't linger on
 *  disk). Keyed by BASENAME under our own output dir → a `../` link can't escape it.
 *  Best-effort: an unreadable file leaves the link untouched (no regression). */
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

/** The connector/server a namespaced tool call belongs to (`gmail__send` → `gmail`). The
 *  classifier needs it to tell a connector we SHIP from a user-added endpoint whose tool
 *  names mean nothing to us. */
function serverIdOf(callName: string): string | undefined {
  const i = callName.indexOf("__");
  return i > 0 ? callName.slice(0, i) : undefined;
}

/** The text of an `isError` tool RESULT, for the recoverable-error classifier — pwmcp
 *  wraps its failures in one text part ("### Error\nError: …"); join defensively. */
function resultErrorText(result: McpToolResult): string {
  return result.content
    .map((p) => (p.type === "text" ? ((p as { text?: string }).text ?? "") : ""))
    .join("\n");
}

/**
 * MAIN-side write gate (audit M6, v2). A MUTATING non-browser tool must be confirmed on a
 * surface the untrusted renderer cannot script — its own card is UX, not a boundary. The
 * former renderer-minted approval-token path was a fail-OPEN (a renderer XSS self-minted a
 * matching token via `mcp:approve-write`, which required no user gesture, and skipped the
 * gate). It is REMOVED: an approval here means an explicit click on a MAIN-OWNED
 * confirmation window (`confirmWrite`) that the renderer can't auto-confirm or read. FAIL
 * CLOSED — refuse / close / timeout ⇒ the call is refused. Browser tools are exempt (own
 * allow-list/SSRF gate; confirmed renderer-side; a per-action prompt would break them).
 * Exported for unit tests (the confirm impl is injectable via `__setWriteConfirmImpl`).
 *
 * ⚠️ **Whether this window opens at all is decided by `CONFIRMATION_POLICY`**
 * (`@openmasq/catalog/mcp` `confirmationSurface` — the ONE declarative rule list main and
 * the renderer share), fed main's own facts: the persisted `confirmationMode`
 * (`../confirmationMode.ts`, main-owned — never a renderer flag) and the `writeRisk`
 * verdict. In **Mode renforcé** a risky write hits the window and a `"low"` one is
 * confirmed by the in-conversation card, exactly the historical behaviour.
 *
 * ⚠️ ACCEPTED RESIDUAL (product decision): in the default **standard** mode the policy
 * routes NO write to this window — the only confirmation is the renderer card (one per
 * conversation, after a web search, plus the exfil/attachment floors), so a renderer XSS
 * could dispatch a write unconfirmed. What bounds it: the mode itself is main-owned and
 * DOWNGRADING it needs a click on this same un-spoofable window; every other main-side
 * gate (browser allow-list, SSRF floor, key custody, read gate) is unchanged. Users who
 * want the boundary back opt into Mode renforcé (Réglages → MCP).
 */
export async function assertWriteAllowed(
  call: McpToolCall,
  route: { realName: string; annotations?: McpTool["annotations"] },
): Promise<void> {
  if (call.name.startsWith(`${BROWSER_ID}__`)) return; // browser: gated elsewhere
  if (!isWriteToolName(route.realName, route.annotations)) return; // read-only: no gate
  // The surface is decided by the SHARED policy, on main's own facts — never on a flag the
  // renderer sends. Main knows only `risk` (the conversation counters are renderer-side;
  // absent numeric facts read as 0), which is exactly enough to answer the one question
  // main owns: does THIS call get the un-spoofable window? The renderer evaluates the same
  // list to decide whether to draw its card, and its copy is UX (a drift there costs a
  // double prompt, not a bypass).
  const rule = confirmationSurface(getConfirmationMode(), {
    risk: writeRisk(route.realName, {
      serverId: serverIdOf(call.name),
      annotations: route.annotations,
    }),
  });
  if (rule?.surface !== "system-modal") return;
  // Session auto-approve (armed ONLY via the un-spoofable window, so this is not a renderer
  // bypass): the user chose to skip per-action confirmation for this session — globally,
  // or for THIS exact tool (« Toujours pour cet outil », also window-armed only).
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
  // Browser tools first SELF-HEAL a stale @playwright/mcp connection (the agent-browser
  // child can be stopped/respawned under it — window close, crash — leaving pwmcp on a
  // dead CDP endpoint where every call fails in ~10 ms). BEFORE route resolution: the
  // heal reconnects and rebuilds the routes.
  if (call.name.startsWith(`${BROWSER_ID}__`)) await ensureBrowserConnLive();
  let route = routes.get(call.name);
  if (!route) {
    await refreshRoutes();
    route = routes.get(call.name);
  }
  if (!route) throw new Error(`Unknown MCP tool: ${call.name}`);
  // Org MCP policy, replayed HERE and not only in the renderer's tool filter: that filter
  // is a UX one (a member could re-add the same service as a custom server, and a direct
  // IPC call skipped it entirely). Before any dispatch, and before the write gate — a
  // blocked connector must not even reach a confirmation. `orgPolicy.ts` states what this
  // does and does not close.
  const server = serverIdOf(call.name);
  if (isConnectorBlocked(server)) throw blockedConnectorError(server!);
  // Enforce the write-confirmation in MAIN (audit M6) — before any server dispatch.
  await assertWriteAllowed(call, route);
  // Hardening (defence in depth): a denied browser tool is never routed, but guard
  // the call path too, and restrict browser navigation to real web origins.
  if (call.name.startsWith(`${BROWSER_ID}__`)) {
    // Defence in depth (C1): a non-allow-listed browser tool is never routed, but a
    // renderer/XSS path could still call it by raw name — deny it at the call site too.
    if (!BROWSER_TOOL_ALLOWLIST.has(route.realName)) {
      throw new Error(`Outil navigateur non autorisé : ${route.realName}`);
    }
    // `browser_navigate` AND `browser_tabs` (its `action:"new"` opens a tab AT `args.url`)
    // both carry a model-supplied navigation URL (audit ELEC-2): gate BOTH with the scheme
    // check + SSRF floor + search rewrite, else the model reaches an internal/off-limits
    // host by opening a tab instead of navigating.
    if ((route.realName === "browser_navigate" || route.realName === "browser_tabs") &&
        typeof call.arguments?.url === "string" && call.arguments.url) {
      let url = call.arguments.url;
      // Steer Google web searches to DuckDuckGo (Google CAPTCHAs automation); mutate
      // the call so @playwright/mcp actually navigates there. Query is preserved.
      const rewritten = rewriteSearchEngine(url);
      if (rewritten !== url) {
        url = rewritten;
        call.arguments = { ...call.arguments, url };
      }
      if (!isAllowedBrowserUrl(url)) {
        throw new Error(`Navigation bloquée (schéma non autorisé) : ${url}`);
      }
      // SSRF floor: block navigation to internal/private hosts (cloud metadata
      // 169.254.169.254, localhost, LAN/CGNAT). A prompt-injected page could steer
      // the model into probing internal services; no legit public browsing hits
      // these. Skips about:blank (no host to resolve). Reuses the app SSRF guard.
      if (url.trim().toLowerCase() !== "about:blank") {
        try {
          await assertPublicUrl(url, "tool-result-fetch");
        } catch (e) {
          // Both outcomes BLOCK (fail closed) — but they must not wear the same label.
          // A DNS/network outage reported as "adresse interne/privée" told the model a
          // security gate fired: it gave up on the browser entirely ("temporairement
          // indisponible") and the user was told their news site was a private address.
          // An honest message lets the model retry or say the truth: the network is down.
          if ((e as NodeJS.ErrnoException)?.code === "EDNS_UNRESOLVED") {
            throw new Error(
              // « injoignable »/« réseau » → classifyToolError: transport (retryable);
              // « indisponible » would have classified operational (dead end) — the wrong nudge.
              `Navigation impossible : réseau ou DNS injoignable (${new URL(url).hostname}). ` +
                `Vérifie la connexion, puis réessaie.`,
            );
          }
          throw new Error(`Navigation bloquée (adresse interne/privée) : ${url}`);
        }
      }
    }
  }
  // Opt-in RAW wire log (`OPENMASQ_MCP_RAW_LOG=1`). At this point args are ALREADY
  // un-redacted (the real payload the server receives) and the result is the RAW
  // server reply before any renderer-side redaction — so this is ground truth for
  // "did the pipeline alter the call?". OFF by default: it prints REAL data (PII),
  // so it's a deliberate debugging switch, never on in a normal run.
  const rawLog = !!process.env.OPENMASQ_MCP_RAW_LOG;
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
      // A LIVE-but-broken pwmcp connection (lost page / the zero-tab
      // `Target.createTarget` race) — the pre-dispatch staleness heal can't see it (the
      // endpoint is current). Reconnect (re-enumerates the browser's live tabs) and retry
      // ONCE; a genuine tool error (blocked nav, bad locator) is NOT recoverable → rethrow.
      if (!isRecoverableBrowserError(msg)) throw err;
      await reconnectBrowserConn("recoverable browser tool error");
      const r2 = routes.get(call.name);
      if (!r2) throw err;
      result = await dispatch(r2);
    }
    // ⚠️ The SAME heal on the RESULT path. @playwright/mcp reports a tool failure as a
    // NORMAL result with `isError:true` ("### Error\nError: … Target.createTarget …"),
    // not as a protocol throw — so the catch above never sees the zero-tab race, the
    // error rode back to the model as a plain tool result, and pwmcp stayed broken for
    // every later call ("unrecoverably", the reported bug). Electron never emits
    // `targetCreated` for a tab opened AFTER pwmcp connected, so this state is REACHED
    // in normal use (close the last tab: the child re-opens about:blank, pwmcp never
    // learns) — only a fresh connect re-enumerates the live tabs (the child guarantees
    // ≥1). Reconnect + retry ONCE; the retried result stands, whatever it is.
    if (result.isError && isRecoverableBrowserError(resultErrorText(result))) {
      await reconnectBrowserConn("recoverable browser tool error (isError result)");
      const r2 = routes.get(call.name);
      if (r2) result = await dispatch(r2);
    }
  } else {
    result = await dispatch(route);
  }
  // Fold @playwright/mcp's externalised snapshot/log FILES back inline so the model
  // actually receives the page content (0.0.77 returns only a link otherwise).
  if (call.name.startsWith(`${BROWSER_ID}__`)) {
    await inlineBrowserOutputFiles(result).catch(() => {});
  }
  if (rawLog) {
    const preview = JSON.stringify(result.content)?.slice(0, 800);
    console.log(`[mcp:raw] ← ${route.realName} isError=${result.isError ?? false} result=${preview}`);
  }
  // Record hosts in the tool result so a URL it surfaced (e.g. an export/image link) can be
  // downloaded via files:fetch-url without opening an arbitrary-host exfil channel (audit M4).
  //
  // ⚠️ EXCEPT the BROWSER. The M4 allow-list only holds because it is seeded from content we
  // RECEIVED from a server the user connected — never from anything an attacker chooses. A
  // browser result is the page's OWN text, so browsing evil.com would make evil.com
  // fetch-allowed for `files:fetch-url` / `links:preview` from then on: the attacker picks
  // the host, which is exactly the fail-open M4 was built to close. It widens one boundary
  // by walking through another, so the browser is excluded — a genuine export still arrives
  // via `onFileUrl`/`noteFetchHost`, which is structural, not attacker-authored prose.
  if (!call.name.startsWith(`${BROWSER_ID}__`)) {
    for (const part of result.content) {
      if (part.type === "text") noteFetchHostsFromText((part as { text?: string }).text);
    }
  }
  return result;
}
