import { SIMPLE_MODEL_IDS } from "@openmasq/catalog";
import { isModelAllowed } from "../privacy/orgAllowList";
import { DEFAULT_MODEL_ID, findModelAny } from "./models";

/**
 * What the chosen ACCESS PATH makes the natural default.
 *
 * A fresh install writes on `DEFAULT_MODEL_ID` (a free OpenRouter model) because it is
 * the one model that costs nothing and needs nothing. But someone who just switched on
 * their Claude Code or Codex CLI has SAID which model they want to write with — and the
 * app kept opening every new conversation on Laguna, with the CLI model buried in the
 * full view. So the default, and the short list's factory content, follow the access
 * path: a subscription CLI that is switched on AND found leads, in this order.
 *
 * ⚠️ READY, never merely enabled: `unavailable` is the store's `modelUnavailableReason`
 * map, so a CLI that is on but not installed (`cli_unavailable`) stays out — a default
 * that fails on the first send is worse than Laguna. And an ABSENT map (not computed yet)
 * offers nothing: the picker must not flip on load.
 *
 * ⚠️ The factory default is NOT a choice. A `Settings.defaultModelId` equal to
 * `DEFAULT_MODEL_ID` (what every install is seeded with) yields to the access path; any
 * OTHER id — the home marker, Réglages → Modèles, AUTO — is respected as is. The one
 * thing this cannot express is « I have a CLI on and still want Laguna »: pick any other
 * free model then. Pure — `defaultModel.test.ts`.
 */
export const ACCESS_MODEL_IDS: readonly string[] = ["claude-cli", "codex-cli", "antigravity-cli"];

/** The store's id → reason map is all this needs: membership. */
export interface UnavailableView {
  has(id: string): boolean;
}

/** The access-path models usable HERE, in preference order. */
export function readyAccessModelIds(
  unavailable: UnavailableView | undefined,
  allowedModelIds?: string[],
): string[] {
  if (!unavailable) return [];
  return ACCESS_MODEL_IDS.filter(
    (id) => !unavailable.has(id) && isModelAllowed(id, allowedModelIds) && !!findModelAny(id),
  );
}

/** Is this the seeded default, i.e. no choice made? */
export function isFactoryDefault(id: string | undefined): boolean {
  return !id || id === DEFAULT_MODEL_ID;
}

/** The model NEW conversations open on: the person's choice, else the access path's, else the seed. */
export function effectiveDefaultModelId(
  chosen: string | undefined,
  unavailable: UnavailableView | undefined,
  allowedModelIds?: string[],
): string {
  if (!isFactoryDefault(chosen)) return chosen as string;
  return readyAccessModelIds(unavailable, allowedModelIds)[0] ?? DEFAULT_MODEL_ID;
}

/** The simplified view's FACTORY list: the ready access models first, then the governable
 *  catalogue (`SIMPLE_MODEL_IDS`). What `favoriteModels` replaces when set. */
export function factorySimpleIds(
  unavailable: UnavailableView | undefined,
  allowedModelIds?: string[],
): readonly string[] {
  const ready = readyAccessModelIds(unavailable, allowedModelIds);
  return ready.length ? [...ready, ...SIMPLE_MODEL_IDS.filter((id) => !ready.includes(id))] : SIMPLE_MODEL_IDS;
}
