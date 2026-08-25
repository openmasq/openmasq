// US "State" field detector — for the cross-field geo coherence (a form's City / State /
// Zip block). PRECISION-first (the codebase's no-over-redaction bar): a US state is emitted
// ONLY from a LABELED field ("State:", "Province:", "État:") whose value IS a US state — a
// bare "Washington"/"Georgia"/"TX" in prose is far too ambiguous to redact ungated. Emitted
// as {value, category:"REGION", country:"US", start} so `geoBlocks` anchors the block to US.
import type { Detection } from "../../types";
import { US_STATE_NAME_TO_ABBR, US_STATE_ABBR_TO_NAME } from "./usStates";

const STATE_LABEL = "state|province|état|etat";
// Full names longest-first (so "New York" wins over nothing), then a 2-letter code.
const STATE_NAMES = Object.keys(US_STATE_NAME_TO_ABBR).sort((a, b) => b.length - a.length);
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const STATE_ALT = STATE_NAMES.map(esc).join("|");
// The state at the START of the field value: a full name, or a 2-letter code at a boundary.
const LEADING_STATE = new RegExp(`^\\s*(?:(${STATE_ALT})|([A-Za-z]{2})(?![\\p{L}]))`, "iu");
const LABEL_RE = new RegExp(`(?<![\\p{L}])(?:${STATE_LABEL})\\s*[:：]\\s*([^\\n\\r]{1,40})`, "giu");

/** The US state at the start of a field value, normalised to a canonical value (the input
 *  spelling is kept as the vault key; this only validates it IS a state). Null otherwise. */
function leadingState(raw: string): string | null {
  const m = LEADING_STATE.exec(raw);
  if (!m) return null;
  if (m[1]) return m[1]; // a full name
  const abbr = m[2].toUpperCase();
  return US_STATE_ABBR_TO_NAME[abbr] ? m[2] : null; // a real 2-letter code
}

/** Detect a labeled US "State" field as REGION (country US). Verbatim → reversible. */
export function detectUsGeo(text: string): Detection[] {
  if (!text) return [];
  const out: Detection[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(LABEL_RE)) {
    const state = leadingState(m[1] ?? "");
    if (!state) continue;
    if (seen.has(state)) continue;
    seen.add(state);
    out.push({ value: state, category: "REGION", country: "US", start: m.index });
  }
  return out;
}
