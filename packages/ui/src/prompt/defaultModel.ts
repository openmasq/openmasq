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
 * ⚠️ « No choice » is the EMPTY seed, and only that. A fresh install seeds
 * `Settings.defaultModelId` to `""` and yields to the access path; ANY id the user picks
 * — Laguna included, the home marker, Réglages → Modèles, AUTO — is respected as is.
 * Seeding a real id here (Laguna) once made « choose Laguna » indistinguishable from
 * « never chose », so the picker showed the CLI. Pure — `defaultModel.test.ts`.
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

/** Is this the seeded default, i.e. no choice made? Only the EMPTY seed counts — an id
 *  equal to `DEFAULT_MODEL_ID` is a real, explicit pick of that model (the picker writes
 *  it like any other), and confusing the two made « choose Laguna » resolve to the access
 *  path's CLI. « No choice » is the empty seed alone. */
export function isFactoryDefault(id: string | undefined): boolean {
  return !id;
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
