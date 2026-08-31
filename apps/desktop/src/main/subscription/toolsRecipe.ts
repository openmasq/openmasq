/**
 * The CONTRACT for a tooled-turn recipe — what each CLI must provide so that the
 * skeleton in `toolsTurn.ts` can serve it: enough to launch the process, and enough to
 * leave nothing behind. No code, only types.
 *
 * This file exists to have NO import cycle: `toolsTurn.ts` imports the
 * recipes (values), the recipes only import from here. A cross `import type`
 * vanishes for most tools but not all of them — so the graph stays a
 * tree, to the letter.
 */
import type { CliProcessOptions } from "./spawnStream";
import type { ToolsBridge } from "./toolsBridge";

/** What a recipe receives to compose the spawn for THIS turn. */
export interface ToolsSpawnInput {
  /** The already-listening bridge: its loopback URL and the token required on every request. */
  bridge: Pick<ToolsBridge, "url" | "token">;
  /** The REAL names of the turn's tools — the allow-list to give the CLI. */
  toolNames: string[];
  prompt: string;
  system?: string;
  modelId?: string;
}

/** What a recipe returns: enough to launch the CLI, and enough to leave nothing behind. */
export interface ToolsSpawnPlan {
  args: string[];
  /** Variables ADDED to the child's minimal environment (never a secret in argv). */
  extraEnv?: Record<string, string>;
  cleanup?: () => Promise<unknown>;
}

export interface ToolsCliRecipe {
  /** The name shown in refusals ("Claude Code", "Codex"). */
  label: string;
  interpret: CliProcessOptions["interpret"];
  prepare: (input: ToolsSpawnInput) => Promise<ToolsSpawnPlan>;
}
