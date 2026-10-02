/**
 * A short, CONCRETE description of the tool the model is currently calling, in the UI
 * language — shown LIVE on the "thinking" indicator while it streams the tool-call
 * arguments (a big `run_python`/`write_file` body streams with no prose, so `onText` never
 * fires). The tool name is known early (it streams before its args); `chars` = the
 * streamed argument length so far, so the label EVOLVES.
 *
 * The wording is CONTEXTUAL per connector / per browser gesture ("Searching email",
 * "Reading Slack") so a long wait reads as the app doing something specific. Sober on
 * purpose: a status line states what happens, nothing more. Pure + unit-tested.
 *
 * ⚠️ **A connector with no sentence of its own must NOT fall back to its raw tool name.**
 * `connectorRead` covers 20 of the catalogue's 57, so the fallback is the COMMON case,
 * not the exotic one — and it used to print `Vercel · get deployment…`, the developer
 * name with spaces. It composes `humanToolLabel`, the single vocabulary the trace rows
 * already speak, and names the connector in parentheses (the loader is a bare line, with
 * no card above it to say where the call is going).
 */
import type { Messages } from "@openmasq/i18n";
import { connectorBrandName } from "@openmasq/catalog/mcp";
import { baseConnector, browserGesture, humanToolLabel, interceptedLabel } from "./humanToolLabel";
import { isWriteTool } from "./mcpAgentClassify";

type ConnectorReadId = keyof Messages["runtime"]["tools"]["connectorRead"];

/** The connector's own phrase, keyed on the connector id (the prefix before `__`; a
 *  multi-account instance `gmail--a1b2` is normalised first), but ONLY for a read.
 *
 *  ⚠️ **Every one of these is a READING verb, so they may only label a READ.** Keyed on
 *  the connector, the tool name was discarded — and « searching email » then showed while
 *  the agent SENT an e-mail in the user's name. The live loader is the only signal a write
 *  gets in mode `standard` (the card fires once per conversation), so that line understated
 *  an outward, irreversible act. `isWriteTool` is the ONE definition of what a write is
 *  (`mcpAgentClassify.ts`, the same the confirm gate uses); `toolLabelParity.test.ts` pins it. */
function connectorReadLabel(connector: string, tool: string, t: Messages): string | undefined {
  if (isWriteTool(tool)) return undefined;
  const own = t.runtime.tools.connectorRead;
  return Object.hasOwn(own, connector) ? own[connector as ConnectorReadId] : undefined;
}

/** The browser's live line: the row's gesture families, phrased as the action happening now. */
function browserLabel(tool: string, t: Messages): string {
  const g = browserGesture(tool);
  return t.runtime.tools.browserLive[g === "close" ? "browse" : g];
}

/**
 * The INSTANT narration seeded on the live trace row the moment a tool call is
 * DISPATCHED — before the LLM summariser lands (it takes seconds and may fail), so
 * the row never sits on a bare « en cours… ». Same vocabulary as {@link toolActionLabel};
 * the richer LLM narration overwrites it when (if) it arrives.
 *
 * `navHost` is the REAL hostname the browser is opening (already computed by the
 * loop's domain gate from the un-redacted wire URL) — a hostname names WHERE we go,
 * not what the conversation contains, and the user watches the same host load in the
 * live browser panel anyway. Nothing else from the args ever rides this string: arg
 * VALUES are wire fakes, and painting a fake name into the trace would read as a bug.
 */
export function toolStartNarration(bareTool: string, connectorId: string, t: Messages, navHost?: string): string {
  // ONE name per intercepted tool (`interceptedLabel`): the loader, the narration and the
  // trace row cannot call the same call three different things.
  const own = interceptedLabel(bareTool, t);
  if (own) return own;
  const base = baseConnector(connectorId);
  if (base === "browser") {
    if (/navigate|goto|open|tab/.test(bareTool) && navHost) return t.runtime.tools.openingHost(navHost);
    // Without a host, opening a page or a tab reads as browsing.
    if (/navigate|goto|open|tab/.test(bareTool)) return t.runtime.tools.browserLive.browse;
    return browserLabel(bareTool, t);
  }
  const read = connectorReadLabel(base, bareTool, t);
  if (read) return read;
  // No sentence for this connector — say what the CALL does, in the same words the trace
  // row will use. `${base}` alone ("Lecture · vercel") named the connector the card above
  // already names, and said nothing about the action.
  return humanToolLabel(base, bareTool, t);
}

export function toolActionLabel(t: Messages, name?: string, chars = 0): string | undefined {
  const tt = t.runtime.tools;
  const size = chars > 0 ? ` (${tt.chars(chars)})` : "";
  if (!name) return chars > 0 ? `${tt.writing}…${size}` : undefined;
  // The app's OWN intercepted tools — ONE table, so the loader and the trace row cannot
  // call the same tool two different things (`toolLabelParity.test.ts`).
  const own = interceptedLabel(name, t);
  if (own) return `${own}…${size}`;

  // A connector tool is `connector__tool` (the redacting client stamps the transport id;
  // the real connector is the name prefix) → the connector's read phrase when we have
  // one, else the action label with the connector named.
  const i = name.indexOf("__");
  if (i > 0) {
    const connector = baseConnector(name.slice(0, i));
    const tool = name.slice(i + 2);
    if (connector === "browser") return `${browserLabel(tool, t)}…${size}`;
    const read = connectorReadLabel(connector, tool, t);
    if (read) return `${read}…${size}`;
    // The action first (that is what the wait is about), the connector in parentheses.
    // ⚠️ The catalogue's DISPLAY name, never the id capitalised: that produced
    // « Google-drive » / « Microsoft-onedrive ». Unknown id ⇒ the capitalised id, still a name.
    const Connector =
      connectorBrandName(connector) ?? connector.charAt(0).toUpperCase() + connector.slice(1);
    return `${humanToolLabel(connector, tool, t)} (${Connector})…${size}`;
  }
  return `${humanToolLabel("", name, t)}…${size}`;
}
