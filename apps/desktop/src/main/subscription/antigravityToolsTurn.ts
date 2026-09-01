/**
 * The ANTIGRAVITY recipe for the tooled turn: how `agy -p` receives the MCP bridge
 * (`toolsBridge.ts`) without a line written into the user's configuration. The turn's
 * skeleton — refusal, flattening, capture/end race — lives in `toolsTurn.ts` (rule 9);
 * the isolation flags stay in `antigravityEngine.ts`, shared with the text turn, and
 * its header carries the measurements. What is specific here (CLI 1.1.23, 01/09/2026):
 *
 * - **The bridge rides a PLUGIN in a disposable folder of ours**, passed through
 *   `--add-dir`: `<dir>/.agents/plugins/openmasq/{plugin.json, mcp_config.json}`. That is
 *   the one discovery path print mode honours (measured — the bare cwd is never read),
 *   and it keeps the user's global `~/.gemini/config/mcp_config.json` untouched, so no
 *   loopback server of ours ever leaks into their other sessions (rule 11).
 * - **`serverUrl` + `headers`** is the CLI's HTTP shape (its docs say SSE; measured, it
 *   speaks streamable HTTP: `server/discover`, `initialize`, a `GET` it tolerates being
 *   refused, then `tools/list` and `tools/call`, the Bearer on every request). The bridge
 *   receives the BARE tool name — the `openmasq/` prefix exists only in the permission
 *   rule (`ANTIGRAVITY_BRIDGE_RULE`).
 * - **The token lives in the plugin file (0600, disposable folder)**, never in argv: a
 *   process's command line is readable by any local process (`ps`). Same boundary as
 *   claude's config file.
 * - **No allow-list of tool NAMES to give the CLI** (codex's `enabled_tools`, claude's
 *   `--tools`): the perimeter is the permission rule plus the bridge's own refusal of
 *   unknown names. `init.tools` still announces the built-ins — see the engine header.
 */
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BRAND } from "@openmasq/branding";
import { buildAntigravityArgs } from "./antigravityEngine";
import { interpretAntigravityEvent } from "./antigravityStream";
import { promptWithSystem } from "./bridge";
import { TOOLS_SERVER_NAME } from "./toolsBridge";
import type { ToolsSpawnInput, ToolsSpawnPlan } from "./toolsRecipe";

/** Where the plugin sits under the `--add-dir` folder — the CLI's customization root. */
export const ANTIGRAVITY_PLUGIN_DIR = join(".agents", "plugins", TOOLS_SERVER_NAME);

/** The two files that make the folder a plugin the CLI loads: the marker, and the bridge. */
export function antigravityPluginFiles(url: string, token: string): Record<string, string> {
  return {
    "plugin.json": JSON.stringify({ name: TOOLS_SERVER_NAME }),
    "mcp_config.json": JSON.stringify({
      mcpServers: {
        [TOOLS_SERVER_NAME]: { serverUrl: url, headers: { Authorization: `Bearer ${token}` } },
      },
    }),
  };
}

export const antigravityToolsRecipe = {
  label: "Antigravity",
  interpret: interpretAntigravityEvent,
  async prepare(input: ToolsSpawnInput): Promise<ToolsSpawnPlan> {
    // Brand-prefixed disposable folder (the app-owned tmp convention). EMPTY apart from
    // the plugin: in-workspace reads need no permission on this CLI, so the workspace
    // must hold nothing worth reading.
    const dir = await mkdtemp(join(tmpdir(), `${BRAND.slug}-cli-tools-`));
    const pluginDir = join(dir, ANTIGRAVITY_PLUGIN_DIR);
    await mkdir(pluginDir, { recursive: true });
    for (const [name, body] of Object.entries(antigravityPluginFiles(input.bridge.url, input.bridge.token))) {
      await writeFile(join(pluginDir, name), body, { mode: 0o600 });
    }
    return {
      args: buildAntigravityArgs({
        prompt: promptWithSystem(input.system, input.prompt),
        addDir: dir,
      }),
      cleanup: () => rm(dir, { recursive: true, force: true }).catch(() => {}),
    };
  },
};
