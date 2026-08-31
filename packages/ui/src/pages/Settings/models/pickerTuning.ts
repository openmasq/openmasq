import type { ProviderId } from "@openmasq/llm";
import { PROVIDER_ORDER } from "../../../components/ModelSelector/providers";

/** A vendor family earns a chip once it has this many models — below it the
 *  chip row would fill with one-off vendors; the long tail stays searchable.
 *  ⚠️ The threshold used to be 3: on OpenRouter's ~400-model catalogue, that made for
 *  TWENTY chips across four rows before the list even started — the bar meant to declutter
 *  the screen cluttered it more than anything else (reported 11/08). At 10, what's left are the
 *  families people actually look for; the rest are found through search, which also scans
 *  the id. */
export const FAMILY_CHIP_MIN = 10;

/** Order the default-model picker groups. The chat picker's `PROVIDER_ORDER` is the
 *  single source (rule 9 — the two lists had already drifted); this screen only
 *  PREPENDS the keyless web-session providers, which the desktop chat picker has none
 *  of. Same for the group LABEL: `providerGroupLabel`, never a second ternary. */
export const MODEL_PROVIDER_ORDER: ProviderId[] = [
  "openai-session",
  "anthropic-session",
  ...PROVIDER_ORDER,
];
