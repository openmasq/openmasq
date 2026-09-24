/**
 * THE MASKING POLICY — one global level, and a level per connector that may differ.
 *
 * A single level is the wrong grain for a machine that serves a filesystem read AND a web
 * search: one carries the user's own files, the other carries a stranger's page. So a
 * connector may mask at its own level, and this is the one home of what that MEANS — the
 * shape of the document, and how a connector's effective masking is resolved from it.
 *
 * Shared because BOTH surfaces edit it: the desktop's MCP and Privacy panes, and the proxy's
 * console. They phrase their errors differently (the app ships in two languages, the CLI in
 * one) and the proxy carries two keys of its own on top — which side provides a server, and
 * how its writes are gated. Neither of those is masking, so neither is here.
 *
 * ⚠️ A connector entry ADDS to the global settings, it does not replace them. `disable` and
 * `keep` are unions, not overrides: a run that keeps a term in clear everywhere keeps it in
 * clear for this connector too, and a connector cannot re-mask what the run globally spared.
 * The LEVEL is the one field that replaces — that is what "its own level" means.
 */
import { categoriesForLevel, type RedactionLevel } from "./levels";

/** What a connector may say about how ITS results are masked. Every field optional: an
 *  absent one follows the global setting, which is what the pickers call "Default". */
export interface ConnectorMasking {
  /** Replaces the global level for this connector's results. */
  level?: RedactionLevel;
  /** Kinds left in clear for this connector, ON TOP of what the run already leaves. */
  disable?: string[];
  /** Exact values never masked for this connector, on top of the run's own. */
  keep?: string[];
}

/** The keys a connector entry may carry here. A surface with more of its own (the proxy has
 *  `source` and `writes`) keeps its own list — this one says what MASKING is. */
export const MASKING_KEYS = ["level", "disable", "keep"] as const;

/** The whole policy, as the two JSON editors render it. */
export interface MaskingPolicy {
  /** What every connector follows unless it says otherwise. */
  level: RedactionLevel;
  disable?: string[];
  keep?: string[];
  /** Connector id → what it does differently. An id absent here follows the default. */
  connectors?: Record<string, ConnectorMasking>;
}

/** What a connector is ACTUALLY masked at, the global settings folded in. The union rule
 *  lives here and nowhere else: every caller that resolves a connector's masking — a masker
 *  set, a settings row, a policy preview — must get the same answer. */
export function effectiveMasking(
  policy: MaskingPolicy,
  connectorId: string,
): Required<Pick<ConnectorMasking, "level">> & { disable: string[]; keep: string[] } {
  const own = policy.connectors?.[connectorId] ?? {};
  return {
    level: own.level ?? policy.level,
    disable: union(policy.disable, own.disable),
    keep: union(policy.keep, own.keep),
  };
}

/** Does this connector ask for a masker of its own, or can it share the global one? Asked
 *  before building anything: a connector that differs in nothing must not get a second
 *  masker, or two identical maskers mint two identities for one value. */
export const overridesMasking = (m: ConnectorMasking): boolean =>
  m.level !== undefined || !!m.disable?.length || !!m.keep?.length;

/** The connectors whose masking genuinely differs from the default — what a summary pane
 *  lists, and what a policy document needs to carry. Sorted, so a serialised policy does not
 *  churn on rewrite. */
export function overriddenConnectors(policy: MaskingPolicy): string[] {
  return Object.entries(policy.connectors ?? {})
    .filter(([, m]) => overridesMasking(m))
    .map(([id]) => id)
    .sort();
}

/** Deduplicated, order-preserving: the global settings first, the connector's after. */
function union(a: readonly string[] | undefined, b: readonly string[] | undefined): string[] {
  const out: string[] = [];
  for (const v of [...(a ?? []), ...(b ?? [])]) if (!out.includes(v)) out.push(v);
  return out;
}

/**
 * The categories a connector's results are ACTUALLY masked at — the level's set, minus what
 * is left in clear. Computed rather than named, because that is the only comparable form: two
 * settings can differ in their level AND their disables and still protect the same things.
 */
export function maskedCategories(m: {
  level: RedactionLevel;
  disable?: readonly string[];
}): Set<string> {
  const on = categoriesForLevel(m.level);
  const out = new Set<string>();
  for (const [key, isOn] of Object.entries(on)) if (isOn) out.add(key);
  for (const key of m.disable ?? []) out.delete(key);
  return out;
}

/**
 * Does moving from `before` to `after` EXPOSE MORE than before?
 *
 * The question a surface must ask before applying a change it was handed — and the reason it
 * is asked on the sets rather than on the level name: dropping from `strict` to `renforce`
 * loosens, but so does staying at `strict` while adding one category to `disable`, or adding
 * a value to `keep`. A rule written on the level alone would wave both of those through.
 *
 * Fails toward TRUE: anything this cannot prove to be at least as protective counts as a
 * loosening, so the caller's gate is asked rather than skipped.
 */
export function loosensMasking(
  before: { level: RedactionLevel; disable?: readonly string[]; keep?: readonly string[] },
  after: { level: RedactionLevel; disable?: readonly string[]; keep?: readonly string[] },
): boolean {
  const was = maskedCategories(before);
  const now = maskedCategories(after);
  // A category that WAS masked and no longer is.
  for (const key of was) if (!now.has(key)) return true;
  // A value newly spared everywhere is exposure too, whatever the categories say.
  const kept = new Set(before.keep ?? []);
  for (const value of after.keep ?? []) if (!kept.has(value)) return true;
  return false;
}
