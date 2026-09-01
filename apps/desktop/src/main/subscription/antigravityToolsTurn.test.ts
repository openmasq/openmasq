import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ToolDef } from "@openmasq/llm";
import { ANTIGRAVITY_APP_DATA_DIR, ANTIGRAVITY_BRIDGE_RULE, ANTIGRAVITY_SETTINGS } from "./antigravityEngine";
import { ANTIGRAVITY_PLUGIN_DIR, antigravityPluginFiles } from "./antigravityToolsTurn";
import { completeSubscriptionTools } from "./toolsTurn";

const TOOLS: ToolDef[] = [
  { name: "dropbox_search", description: "Cherche.", parameters: { type: "object" } },
];

/**
 * A fake `agy`: a real executable that does what the measured one does — take the plugin
 * folder from `--add-dir`, read the bridge's URL and Bearer from ITS `mcp_config.json`,
 * then call the tool — with no subscription or network. `argvDump` pins down what the
 * child saw; `dirDump` records the plugin folder so the test can check it is gone after.
 */
function fakeAgy(dir: string, body: string): { binPath: string; argvDump: string; dirDump: string } {
  const argvDump = join(dir, "argv.json");
  const dirDump = join(dir, "adddir.txt");
  const script = join(dir, "fake-agy.mjs");
  writeFileSync(
    script,
    `import { readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
writeFileSync(${JSON.stringify(argvDump)}, JSON.stringify(process.argv.slice(2)));
const addDir = process.argv[process.argv.indexOf("--add-dir") + 1];
writeFileSync(${JSON.stringify(dirDump)}, addDir ?? "");
const cfg = JSON.parse(readFileSync(join(addDir, ${JSON.stringify(ANTIGRAVITY_PLUGIN_DIR)}, "mcp_config.json"), "utf8"));
const server = cfg.mcpServers.openmasq;
const url = server.serverUrl, auth = server.headers.Authorization;
${body}
`,
  );
  const binPath = join(dir, "fake-agy");
  writeFileSync(binPath, `#!/bin/sh\nexec "${process.execPath}" "${script}" "$@"\n`);
  chmodSync(binPath, 0o755);
  return { binPath, argvDump, dirDump };
}

let dir = "";
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("le tour outillé sur la CLI Antigravity", () => {
  it("capture l'appel d'outil du pont, tue la CLI, rend {toolCalls} et efface le plugin", async () => {
    dir = mkdtempSync(join(tmpdir(), "openmasq-agytools-"));
    const { binPath, argvDump, dirDump } = fakeAgy(
      dir,
      `await fetch(url, { method: "POST",
         headers: { authorization: auth, "content-type": "application/json" },
         body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call",
           params: { name: "dropbox_search", arguments: { query: "PERSONNE_1" } } }) });
       await new Promise(() => {});`,
    );
    const r = await completeSubscriptionTools(
      { cli: "antigravity", label: "Antigravity", binPath, cwd: dir },
      { messages: [{ role: "user", content: "Analyse mon Dropbox." }], tools: TOOLS },
    );
    expect(r.stopReason).toBe("tool_calls");
    expect(r.toolCalls[0].name).toBe("dropbox_search");
    // Arguments stay REDACTED exactly as emitted: de-redaction is the loop's (rule 11).
    expect(r.toolCalls[0].arguments).toEqual({ query: "PERSONNE_1" });

    const argv: string[] = JSON.parse(readFileSync(argvDump, "utf8"));
    // ⚠️ Boundary: the token NEVER passes through argv (readable via `ps`) — the fake CLI
    // found it only in the plugin file, which the capture above proves.
    expect(argv.join(" ")).not.toMatch(/[0-9a-f]{48}/);
    // …and the text turn's isolation holds: our data dir, never the machine handed over.
    expect(argv).toContain(`--app_data_dir=${ANTIGRAVITY_APP_DATA_DIR}`);
    expect(argv).not.toContain("--dangerously-skip-permissions");
    // The plugin folder is DISPOSABLE: distinct from the cwd, gone once the turn ends.
    const addDir = readFileSync(dirDump, "utf8");
    expect(addDir).not.toBe(dir);
    expect(existsSync(addDir)).toBe(false);
  }, 15_000);

  it("fin de flux sans appel ⇒ {text, stop} avec l'usage — le tour texte reste intact", async () => {
    dir = mkdtempSync(join(tmpdir(), "openmasq-agytools-"));
    const { binPath } = fakeAgy(
      dir,
      `const ev = (o) => process.stdout.write(JSON.stringify(o) + "\\n");
       ev({ event: "step_update", step_update: { step_type: "agent_response", state: "DONE", text_delta: "Bonjour." } });
       ev({ event: "result", result: { status: "SUCCESS", response: "Bonjour.", usage: { input_tokens: 7, output_tokens: 3 } } });`,
    );
    const r = await completeSubscriptionTools(
      { cli: "antigravity", label: "Antigravity", binPath, cwd: dir },
      { messages: [{ role: "user", content: "Dis bonjour." }], tools: TOOLS },
    );
    expect(r.toolCalls).toEqual([]);
    expect(r.text).toBe("Bonjour.");
    expect(r.stopReason).toBe("stop");
    expect(r.usage?.outputTokens).toBe(3);
  }, 15_000);
});

describe("le plugin et la règle — le pont, et rien d'autre", () => {
  it("écrit le marqueur et le serveur HTTP avec son Bearer, sous le nom du pont", () => {
    const files = antigravityPluginFiles("http://127.0.0.1:5123/mcp", "tok");
    expect(JSON.parse(files["plugin.json"])).toEqual({ name: "openmasq" });
    expect(JSON.parse(files["mcp_config.json"])).toEqual({
      mcpServers: {
        openmasq: { serverUrl: "http://127.0.0.1:5123/mcp", headers: { Authorization: "Bearer tok" } },
      },
    });
    expect(ANTIGRAVITY_PLUGIN_DIR).toBe(join(".agents", "plugins", "openmasq"));
  });

  it("la SEULE permission accordée est celle du pont — grammaire `mcp(server/tool)` mesurée", () => {
    expect(ANTIGRAVITY_BRIDGE_RULE).toBe("mcp(openmasq/*)");
    expect(ANTIGRAVITY_SETTINGS.permissions.allow).toEqual([ANTIGRAVITY_BRIDGE_RULE]);
    // No command, no file, no URL: anything else stays auto-denied by headless mode.
    expect(JSON.stringify(ANTIGRAVITY_SETTINGS)).not.toMatch(/command|read_file|write_file|read_url|unsandboxed/);
  });
});
