/**
 * The CODEX recipe for the tooled turn: how `codex exec` receives the MCP bridge
 * (`toolsBridge.ts`) and only it. The turn's skeleton — refusal, flattening,
 * capture/end race — lives in `toolsTurn.ts` (rule 9); the isolation flags, meanwhile,
 * stay in `codexEngine.ts`, shared with the text turn.
 *
 * Everything below was MEASURED on 26/08/2026 against CLI 0.149.1:
 *
 * - **MCP config goes through `-c`, and SURVIVES `--ignore-user-config`**: that flag
 *   only discards the machine's `config.toml`, not command-line overrides.
 *   The bridge is therefore the turn's ONLY MCP server — the equivalent of claude's
 *   `--strict-mcp-config`, obtained by construction rather than by a flag.
 * - **`default_tools_approval_mode="approve"`**: without it, the call goes out and DIES on
 *   "MCP tool call requires approval, but approval policy is never" — `codex exec` is
 *   non-interactive, nobody can answer the request. Approving here opens nothing:
 *   the bridge CAPTURES the call, it never executes it; it's the app's vault and write
 *   gate that decide, same as on a key model. (`auto`, measured, is not
 *   enough; the other values are `prompt` and `writes`.)
 * - **`enabled_tools=[…]` is an ALLOW-list** (rule 7): only this turn's tools
 *   are exposed, named one by one. Nothing else exists for the model.
 * - **The token travels through an ENVIRONMENT VARIABLE** (`bearer_token_env_var`), never
 *   in argv: a process's command line is readable by any local process
 *   (`ps`). The environment, by contrast, is readable only by the same account — the same
 *   boundary as the 0600 file on the claude side.
 *
 * ⚠️ The `CODEX_DISABLED_FEATURES` list ALSO matters for this turn: without it, measured,
 * a model asked about its Dropbox tries to install a codex connector instead
 * of calling the bridge's tool (access would then leave the vault — rule 11).
 */
import { buildCodexArgs, codexPrompt } from "./codexEngine";
import { interpretCodexEvent } from "./codexStream";
import { TOOLS_SERVER_NAME } from "./toolsBridge";
import type { ToolsSpawnInput, ToolsSpawnPlan } from "./toolsRecipe";

/** The environment variable where the CLI reads the bridge's Bearer token. Disposable: it
 *  only holds for THIS process, this turn, this port. */
export const CODEX_TOOLS_TOKEN_ENV = "OPENMASQ_TOOLS_TOKEN";

/**
 * The `-c` override that declares the bridge: a TOML value on ONE line (the CLI parses
 * `value` as TOML). Every string is JSON-serialized — a tool name therefore cannot
 * break the table, or open another one.
 */
export function codexToolsServerConfig(url: string, toolNames: string[]): string {
  const table = [
    `url=${JSON.stringify(url)}`,
    `bearer_token_env_var=${JSON.stringify(CODEX_TOOLS_TOKEN_ENV)}`,
    `default_tools_approval_mode="approve"`,
    `enabled_tools=[${toolNames.map((n) => JSON.stringify(n)).join(",")}]`,
  ].join(",");
  return `mcp_servers.${TOOLS_SERVER_NAME}={${table}}`;
}

export const codexToolsRecipe = {
  label: "Codex",
  interpret: interpretCodexEvent,
  // Nothing to write to disk, so nothing to clean up: the config lives in argv and
  // the secret in the child's environment.
  prepare: async (input: ToolsSpawnInput): Promise<ToolsSpawnPlan> => ({
    args: buildCodexArgs({
      prompt: codexPrompt(input.system, input.prompt),
      mcpServerConfig: codexToolsServerConfig(input.bridge.url, input.toolNames),
    }),
    extraEnv: { [CODEX_TOOLS_TOKEN_ENV]: input.bridge.token },
  }),
};
