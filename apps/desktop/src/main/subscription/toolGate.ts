/**
 * The ALLOW-LIST of a subscription turn's tools (rule 7) — and the net that holds it
 * when the user's CLI is no longer the one we measured.
 *
 * What a turn is allowed to have at hand is EXACTLY the app's tool bridge
 * (`toolsBridge.ts`), i.e. names prefixed `mcp__<server>__`. The TEXT turn
 * has none at all, the TOOLED turn has only those from its catalog: in both cases, any
 * name not carrying that prefix is a tool the CLI gave itself, not a tool
 * the app offered.
 *
 * ## Why a gate on top of the flags
 *
 * `--tools ""` is the CLI's real allow-list (measured 2.1.247: `tools: []` on the text
 * turn, `["mcp__openmasq__…"]` on the tooled turn) and IT is what does the work. But
 * a list of flags is a promise about the version on the other end: the removal-by-NAME
 * (`--disallowed-tools`) that preceded it left 18 tools standing on that same
 * version — including one that takes a shell command and returns its output to the model. A name that
 * changes, a capability that appears, and the guard drops to zero with nothing saying so.
 *
 * Hence the net: the `system/init` event ANNOUNCES the turn's perimeter BEFORE the first
 * tool call. It's read, compared against the bridge's prefix, and an intruder makes the
 * turn FAIL instead of letting it run. It's the only form that survives the next
 * CLI version, because it judges what IS there rather than what we thought to
 * remove.
 *
 * ## The gate's exact scope, stated honestly
 *
 * It judges what is ANNOUNCED. A `tools` field that's absent or of another shape gives NO
 * verdict and lets it pass: the first-line control remains `--tools ""`, and that one is
 * self-verifying — the CLI refuses an unknown flag, so a version that removed it
 * would make the spawn fail loudly, not silently. Refusing on a missing field
 * would buy nothing and would break chat on the first field rename.
 *
 * Holds for claude (the only CLI whose announcement we've measured). On codex's side, isolation
 * relies on `CODEX_DISABLED_FEATURES` (`codexEngine.ts`) and its stream doesn't announce a
 * perimeter: re-measure before putting the same net there.
 */
import { TOOLS_SERVER_NAME } from "./toolsBridge";

/** The prefix the CLI puts in front of every bridge tool (`mcp__<server>__<tool>`). */
const BRIDGE_PREFIX = `mcp__${TOOLS_SERVER_NAME}__`;

/** How many names to cite in the refusal — enough to diagnose, bounded to stay readable. */
const NAMED_IN_MESSAGE = 5;

/**
 * The announced tools the app did NOT offer. Empty = the perimeter is the bridge's
 * (including the text turn, which announces nothing). An announcement of another shape also
 * yields empty — no verdict, see the header.
 */
export function unexpectedCliTools(announced: unknown): string[] {
  if (!Array.isArray(announced)) return [];
  return announced.filter((t): t is string => typeof t === "string" && !t.startsWith(BRIDGE_PREFIX));
}

/** The refusal, as the user reads it. Names what's excess (bounded) so the
 *  diagnosis doesn't require restarting with a raw stream to look at. */
export function cliToolGateMessage(unexpected: string[]): string {
  const shown = unexpected.slice(0, NAMED_IN_MESSAGE).join(", ");
  const rest = unexpected.length - NAMED_IN_MESSAGE;
  const list = rest > 0 ? `${shown} (+${rest})` : shown;
  return (
    "Tour refusé : la CLI expose des outils hors du périmètre de l'app " +
    `(${list}). Mettez l'application à jour, ou choisissez un autre modèle.`
  );
}
