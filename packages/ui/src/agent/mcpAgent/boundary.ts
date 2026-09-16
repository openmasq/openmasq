import { RedactingMcpClient, type McpConnection, type Vault } from "@openmasq/mcp";
import { redactionCategory, unredactArgs } from "@openmasq/redact";
import { navCarriesOfferableData, navCarriesRedactedData } from "../../state/browserPolicy";
import { WEBNAV_OFFER_KEYS } from "../../state/browserPolicy/webNavReveal";
import { isGovernedWebTool, isSearchTool } from "../mcpAgentClassify";
import { deredactArgs } from "../mcpAgentUtil";
import { makeNavClearRedactor } from "../navClearRedact";
import { makeCoalescingRedactor } from "../redactCoalesce";
import type { McpAgentParams } from "./types";

type ResultRedactor = (text: string, vault: Vault, tool?: string) => Promise<string>;

export interface LoopStats {
  toolCalls: number;
  loadToolsUnknown: number;
  navClear: number;
  navEscalated: number;
}

/**
 * THE redaction boundary of the loop (root rule 11): every connector's args leave UN-redacted
 * — the browser included — and every result comes back re-redacted through the SAME vault.
 * Everything that decides what leaves or what comes back in clear lives here, together.
 */
export interface RedactionBoundary {
  client: RedactingMcpClient;
  /** Tool RESULT redactor (engine when wired), engine passes SERIALISED + same-tool batches. */
  redactResult?: ResultRedactor;
  /** The client's OWN outgoing un-redactor — restores a fake's URL-ENCODED forms too. The nav
   *  scan, the confirm card and the clear-mode decision all derive from IT, never from
   *  `fromWireArgs`: a second un-redactor drifts and the card under-states what leaves. */
  wireArg: (text: string) => string;
  /** Clear-mode: a GOVERNED web tool whose call touches NO redacted data reads public content —
   *  replay-only results, no reveal card. Undecidable ⇒ full path (fail closed). */
  navClearFor: (callName: string, rawArgs: Record<string, unknown>) => boolean;
  /** Does THIS call's query carry a vault value the reveal card can actually offer?
   *  Gates the CARD only; undecidable ⇒ show it (never a leak). */
  navCarriesOfferable: (rawArgs: Record<string, unknown>) => boolean;
  navClearOpts: (
    callName: string,
    rawArgs: Record<string, unknown>,
  ) => { redactText: (text: string, vault: Vault) => Promise<string> } | undefined;
  /** Downloadable file URLs stripped from the model-facing text, fetched for the user after the call. */
  exportedUrls: { url: string; mime: string }[];
}

export function makeRedactionBoundary(p: McpAgentParams, loopStats: LoopStats): RedactionBoundary {
  const mcp = p.host.mcp!;
  // Main already namespaced tool names, so the redacting client must NOT namespace again.
  // `ipcConn.callTool` carries NO approval channel: main's write gate decides on its own facts.
  const ipcConn: McpConnection = {
    id: "ipc",
    listTools: () => mcp.listTools(),
    callTool: (call) => mcp.callTool(call),
    close: async () => {},
  };
  // A file RETURNED by a tool is extracted to text in main so the client can redact it.
  const extractBytes = p.host.files?.extractBytes;
  const extractFile = extractBytes
    ? (data: string, mime: string) => extractBytes(data, "file", mime).then((r) => r.text)
    : undefined;
  const exportedUrls: { url: string; mime: string }[] = [];
  const redactResult = p.redactResult
    ? makeCoalescingRedactor({ one: p.redactResult, many: p.redactResult.many })
    : undefined;
  const wireArg = (text: string): string => unredactArgs(text, p.vault);
  const navClearRedactor = redactResult
    ? makeNavClearRedactor({
        full: redactResult,
        secrets: p.secrets ?? [],
        // The LIVE array (the reveal gate mutates it in place), so the replay honours the
        // same per-tool clear policy as the full path.
        disabledKinds: p.disabledKinds ?? [],
        connectorMasking: p.connectorMasking,
        kinds: p.kinds,
        structuralUrlHosts: p.structuralUrlHosts,
        onEscalate: () => {
          loopStats.navEscalated += 1;
        },
        convId: p.convId,
      })
    : undefined;
  const navClearFor = (callName: string, rawArgs: Record<string, unknown>): boolean => {
    if (!navClearRedactor || !isGovernedWebTool(callName)) return false;
    try {
      const wireArgs = deredactArgs(rawArgs, wireArg) as Record<string, unknown>;
      const sensitive = [...Object.values(p.vault ?? {}), ...(p.secrets ?? [])];
      return !navCarriesRedactedData(rawArgs, wireArgs, sensitive);
    } catch {
      return false;
    }
  };
  const offerKeys = new Set<string>(WEBNAV_OFFER_KEYS);
  const navCarriesOfferable = (rawArgs: Record<string, unknown>): boolean => {
    try {
      const wireArgs = deredactArgs(rawArgs, wireArg) as Record<string, unknown>;
      const offerable = Object.values(p.vault ?? {}).filter((real) =>
        offerKeys.has(redactionCategory(p.kinds?.[real] ?? "")),
      );
      return navCarriesOfferableData(wireArgs, offerable);
    } catch {
      return true;
    }
  };
  const navClearOpts: RedactionBoundary["navClearOpts"] = (callName, rawArgs) => {
    if (!navClearFor(callName, rawArgs)) return undefined;
    loopStats.navClear += 1;
    return { redactText: (text, vault) => navClearRedactor!(text, vault, callName) };
  };
  const client = new RedactingMcpClient({
    connections: [ipcConn],
    vault: p.vault,
    secrets: p.secrets,
    disabledKinds: p.disabledKinds,
    redactResult,
    extractFile,
    // A web-search connector's results carry many page images that aren't user exports.
    onFileUrl: p.onExportedFile
      ? (url, mime, tool) => {
          if (!isSearchTool(tool ?? "")) exportedUrls.push({ url, mime });
        }
      : undefined,
    namespace: false,
  });
  return { client, redactResult, wireArg, navClearFor, navCarriesOfferable, navClearOpts, exportedUrls };
}
