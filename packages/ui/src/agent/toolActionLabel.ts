/**
 * A CONCRETE, PLAYFUL FR description of the tool the model is currently calling —
 * shown LIVE on the "thinking" indicator while it streams the tool-call arguments (a
 * big `run_python`/`write_file` body streams with no prose, so `onText` never fires).
 * The tool name is known early (it streams before its args); `chars` = the streamed
 * argument length so far, so the label EVOLVES.
 *
 * The wording is CONTEXTUAL per connector / per browser gesture ("Exploration de la
 * toile…", "Fouille de la boîte mail…") so a long wait reads as the app doing something
 * specific + fun, not a generic spinner. Pure + unit-tested.
 *
 * ⚠️ **A connector with no sentence of its own must NOT fall back to its raw tool name.**
 * `CONNECTOR_LABEL` covers 20 of the catalogue's 57, so the fallback is the COMMON case,
 * not the exotic one — and it used to print `Vercel · get deployment…`, the developer
 * name with spaces. It now composes `humanToolLabel`, the single vocabulary the trace
 * rows already speak, and names the connector in parentheses (the loader is a bare line,
 * with no card above it to say where the call is going).
 */

import { baseConnector, humanToolLabel, INTERCEPTED } from "./humanToolLabel";
import { isWriteTool } from "./mcpAgentClassify";
import { connectorBrandName } from "@openmasq/catalog/mcp";

/** Fun, contextual labels for well-known connectors, keyed on the connector id (the
 *  prefix before `__`). A multi-account instance (`gmail--a1b2`) is normalised first.
 *  The BROWSER is handled by {@link browserLabel} (it has many distinct gestures).
 *
 *  ⚠️ **Every one of these is a READING verb, so they may only label a READ.** Keyed on
 *  the connector, the tool name was discarded — and « Fouille de la boîte mail » then
 *  showed while the agent SENT an e-mail in the user's name, « Farfouille dans le Drive »
 *  while it DELETED a file. The live loader is the only signal a write gets in mode
 *  `standard` (the card fires once per conversation), so that line understated an
 *  outward, irreversible act — and the trace row it turns into a second later said
 *  « Envoi ». {@link connectorReadLabel} is the guard; `toolLabelParity.test.ts` pins it. */
const CONNECTOR_LABEL: Record<string, string> = {
  gmail: "Fouille de la boîte mail",
  "microsoft-outlook": "Fouille des mails Outlook",
  "google-calendar": "Coup d'œil à l'agenda",
  "google-drive": "Farfouille dans le Drive",
  "microsoft-onedrive": "Farfouille dans OneDrive",
  "google-docs": "Lecture des documents",
  "google-sheets": "Épluchage du tableur",
  "google-tasks": "Revue des tâches",
  "google-analytics": "Lecture des statistiques",
  notion: "Feuilletage de Notion",
  slack: "Aux aguets sur Slack",
  github: "Plongée dans le code GitHub",
  linear: "Tri des tickets Linear",
  stripe: "Comptage de la caisse Stripe",
  fireflies: "Réécoute des réunions",
  canva: "Coup de crayon sur Canva",
  webflow: "Bricolage sur Webflow",
  // Public web-search connectors.
  exa: "Ratissage du web",
  tavily: "Ratissage du web",
  firecrawl: "Aspiration de pages web",
};

/** The fun connector phrase, but ONLY for a read — a write keeps the verb-accurate
 *  vocabulary of the trace row. `isWriteTool` is the ONE definition of what a write is
 *  (`mcpAgentClassify.ts`, the same the confirm gate uses), so the label can never
 *  disagree with the gate about what is about to happen. */
function connectorReadLabel(connector: string, tool: string): string | undefined {
  if (isWriteTool(tool)) return undefined;
  return CONNECTOR_LABEL[connector];
}

/** The controllable browser exposes many tools — give the verb the actual gesture
 *  rather than a flat "Browser · …" so "recherche sur la toile" shows during a search. */
function browserLabel(tool: string): string {
  if (/search/.test(tool)) return "Recherche sur la toile";
  if (/navigate|goto|open/.test(tool)) return "Exploration de la toile";
  if (/click|type|fill|press|select|drag|upload|submit/.test(tool)) return "Pilotage du navigateur";
  if (/snapshot|screenshot|read|content|text|accessib/.test(tool)) return "Lecture de la page";
  if (/tab/.test(tool)) return "Jonglage entre les onglets";
  return "Exploration de la toile";
}


/**
 * The INSTANT narration seeded on the live trace row the moment a tool call is
 * DISPATCHED — before the LLM summariser lands (it takes seconds and may fail), so
 * the row never sits on a bare « en cours… ». Same playful vocabulary as
 * {@link toolActionLabel}, phrased as the action happening now; the richer LLM
 * narration overwrites it when (if) it arrives.
 *
 * `navHost` is the REAL hostname the browser is opening (already computed by the
 * loop's domain gate from the un-redacted wire URL) — a hostname names WHERE we go,
 * not what the conversation contains, and the user watches the same host load in the
 * live browser panel anyway. Nothing else from the args ever rides this string: arg
 * VALUES are wire fakes, and painting a fake name into the trace would read as a bug.
 */
export function toolStartNarration(
  bareTool: string,
  connectorId: string,
  navHost?: string,
): string {
  // ONE name per intercepted tool, `INTERCEPTED` — `run_python` used to have its own
  // string here AND a third in `toolActionLabel`, so the same call was « Analyse des
  // données », « Analyse de données » and « Analyse & graphiques » depending on which
  // surface you were looking at.
  if (INTERCEPTED[bareTool]) return INTERCEPTED[bareTool];
  const base = baseConnector(connectorId);
  if (base === "browser") {
    if (/navigate|goto|open|tab/.test(bareTool) && navHost) return `Ouverture de ${navHost}`;
    if (/search/.test(bareTool)) return "Recherche sur le web";
    if (/click|type|fill|press|select|drag|upload|submit/.test(bareTool))
      return "Action sur la page";
    if (/snapshot|screenshot|read|content|text|accessib/.test(bareTool))
      return "Lecture de la page";
    return "Navigation web";
  }
  const fun = connectorReadLabel(base, bareTool);
  if (fun) return fun;
  // No sentence for this connector — say what the CALL does, in the same words the trace
  // row will use. `${base}` alone ("Lecture · vercel") named the connector the card above
  // already names, and said nothing about the action.
  return humanToolLabel(base, bareTool);
}

export function toolActionLabel(name?: string, chars = 0): string | undefined {
  const size = chars > 0 ? ` (${chars} car.)` : "";
  if (!name) return chars > 0 ? `Rédaction…${size}` : undefined;
  // The app's OWN intercepted tools — ONE table (`INTERCEPTED`), so the loader and the
  // trace row cannot call the same tool two different things. The `run_python` exception
  // that used to sit here is what proved a comment cannot hold that invariant:
  // `toolLabelParity.test.ts` does.
  if (INTERCEPTED[name]) return `${INTERCEPTED[name]}…${size}`;

  // A connector tool is `connector__tool` (the redacting client stamps the transport id;
  // the real connector is the name prefix) → a fun, contextual verb when we know it,
  // else the neutral "Connector · tool name".
  const i = name.indexOf("__");
  if (i > 0) {
    const connector = baseConnector(name.slice(0, i));
    const tool = name.slice(i + 2);
    if (connector === "browser") return `${browserLabel(tool)}…${size}`;
    const fun = connectorReadLabel(connector, tool);
    if (fun) return `${fun}…${size}`;
    // The action first (that is what the wait is about), the connector in parentheses —
    // one separator level, where `Connector · verb · object` would have had two.
    // ⚠️ The catalogue's DISPLAY name, never the id capitalised: that produced
    // « Google-drive » / « Microsoft-onedrive », and this branch now carries every WRITE
    // of a well-known connector (it used to hide behind the fun phrase), so the wart went
    // from exotic to routine. Unknown id ⇒ the old capitalisation, it is still a name.
    const Connector =
      connectorBrandName(connector) ?? connector.charAt(0).toUpperCase() + connector.slice(1);
    return `${humanToolLabel(connector, tool)} (${Connector})…${size}`;
  }
  return `${humanToolLabel("", name)}…${size}`;
}
