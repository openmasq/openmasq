/**
 * The CLAUDE recipe for the tooled turn: the `claude -p` flags that make the MCP bridge
 * (`toolsBridge.ts`) the ONLY source of tools, and the config file that carries its
 * token. The turn's skeleton — refusal, flattening, capture/finish race — lives in
 * `toolsTurn.ts` and nowhere else (rule 9).
 *
 * Flags — the MEASURED difference from the plain turn (`engine.ts`):
 * - NO `--safe-mode`: measured (CLI 2.1.246), it cuts MCP servers even when passed
 *   explicitly — incompatible with the bridge. Isolation holds without it:
 *   `--setting-sources ""` alone is enough to skip reading the cwd's CLAUDE.md (measured canary);
 *   `--strict-mcp-config` makes the bridge the ONLY MCP source (allow-list by construction).
 *   Accepted residual: `~/.claude/CLAUDE.md` memory and user hooks, absent from the
 *   measurement machine — to re-verify on a machine that has them before widening.
 * - **`--tools ""` is WHAT bounds the perimeter**, as in the plain turn (`engine.ts` carries
 *   the reasoning). Measured on 2.1.247 with the bridge wired: `system/init`
 *   announces `["mcp__openmasq__<tool>"]` and NOTHING else — the bridge's tools survive
 *   the flag, the built-in ones disappear. ⚠️ `--allowedTools` does NOT bound the perimeter
 *   (measured: the announced list is the same with and without it); it stays set for
 *   permission, and `--disallowed-tools` as a belt-and-braces — neither one is
 *   the guard. The execution net that judges the announcement is `toolGate.ts`.
 * - The bridge token lives in the config FILE (0600, disposable folder), never in
 *   argv: a process's command line is readable by any local process (`ps`).
 */
import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { BRAND } from "@openmasq/branding";
import { CHAT_DISALLOWED_TOOLS } from "./engine";
import { interpretClaudeEvent } from "./claudeStream";
import { TOOLS_SERVER_NAME } from "./toolsBridge";
import { cliModelAlias } from "./turn";
import type { ToolsSpawnInput, ToolsSpawnPlan } from "./toolsRecipe";

/** The `--mcp-config` file: the bridge is the ONLY server, token in the header. */
function toolsMcpConfig(url: string, token: string): string {
  return JSON.stringify({
    mcpServers: {
      [TOOLS_SERVER_NAME]: {
        type: "http",
        url,
        headers: { Authorization: `Bearer ${token}` },
      },
    },
  });
}

export function buildToolsArgs(opts: {
  prompt: string;
  system?: string;
  model?: string;
  sessionId: string;
  mcpConfigPath: string;
  toolNames: string[];
}): string[] {
  return [
    "-p",
    opts.prompt,
    ...(opts.system ? ["--system-prompt", opts.system] : []),
    ...(opts.model ? ["--model", opts.model] : []),
    "--output-format",
    "stream-json",
    "--verbose",
    "--include-partial-messages",
    "--setting-sources",
    "",
    "--strict-mcp-config",
    // The perimeter ALLOW-LIST: no built-in tool, the MCP bridge still gets through.
    "--tools",
    "",
    "--mcp-config",
    opts.mcpConfigPath,
    "--allowedTools",
    opts.toolNames.map((n) => `mcp__${TOOLS_SERVER_NAME}__${n}`).join(","),
    "--disallowed-tools",
    ...CHAT_DISALLOWED_TOOLS,
    "--session-id",
    opts.sessionId,
  ];
}

export const claudeToolsRecipe = {
  label: "Claude Code",
  interpret: interpretClaudeEvent,
  async prepare(input: ToolsSpawnInput): Promise<ToolsSpawnPlan> {
    // Brand-prefixed disposable folder (the app-owned tmp convention), 0600 config:
    // the token appears neither in argv nor in a file readable by another account.
    const dir = await mkdtemp(join(tmpdir(), `${BRAND.slug}-cli-tools-`));
    const mcpConfigPath = join(dir, "mcp.json");
    await writeFile(mcpConfigPath, toolsMcpConfig(input.bridge.url, input.bridge.token), {
      mode: 0o600,
    });
    return {
      args: buildToolsArgs({
        prompt: input.prompt,
        system: input.system,
        model: cliModelAlias(input.modelId),
        sessionId: randomUUID(),
        mcpConfigPath,
        toolNames: input.toolNames,
      }),
      cleanup: () => rm(dir, { recursive: true, force: true }).catch(() => {}),
    };
  },
};
