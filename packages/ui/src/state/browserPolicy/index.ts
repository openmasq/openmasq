// The agent-browser security policy — the prompt-injection damage-limiters, grouped so the
// whole trust boundary reads as one family (root rule 10). Two halves:
//
//  • `tools.ts` — WHICH tools exist and where they may go: the read-only allow-list, the
//    browser/web-browse classification, the domain allow-list.
//  • `exfil.ts` — WHAT a call carries: the nav-URL and tool-arg exfiltration scans.
//  • `navData.ts` — whether a web call TOUCHES redacted data at all (the dynamic
//    browser-redaction decision: clear-mode results + no reveal card when it doesn't).
//
// Importers use this barrel (`state/browserPolicy`), so the split is invisible to them.
export {
  isBrowserTool,
  isWebBrowseTool,
  isWebBrowseEntryTool,
  isBrowserWriteTool,
  isBrowserNavigate,
  browserNavUrl,
  normalizeDomain,
  domainAllowed,
} from "./tools";
export { analyzeNavExfil, analyzeArgExfil } from "./exfil";
export { navCarriesRedactedData, navCarriesOfferableData } from "./navData";
export type { NavExfilFlag, NavExfilResult } from "./exfil";
