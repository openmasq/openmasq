import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ToolDef } from "@openmasq/llm";
import { CODEX_DISABLED_FEATURES } from "./codexEngine";
import { CODEX_TOOLS_TOKEN_ENV, codexToolsServerConfig } from "./codexToolsTurn";
import { completeSubscriptionTools } from "./toolsTurn";

const TOOLS: ToolDef[] = [
  { name: "dropbox_search", description: "Cherche.", parameters: { type: "object" } },
];

/**
 * Une fausse CLI codex : un vrai exécutable qui fait ce que fait la vraie — lire l'URL du
 * pont dans l'override `-c`, le jeton dans SON ENVIRONNEMENT, puis appeler l'outil — sans
 * abonnement ni réseau. `argvDump`/`envDump` épinglent ce que l'enfant a réellement vu :
 * c'est là que vivent les assertions de frontière.
 */
function fakeCodex(dir: string, body: string): { binPath: string; argvDump: string } {
  const argvDump = join(dir, "argv.json");
  const script = join(dir, "fake-codex.mjs");
  writeFileSync(
    script,
    `import { writeFileSync } from "node:fs";
writeFileSync(${JSON.stringify(argvDump)}, JSON.stringify(process.argv.slice(2)));
const cfg = process.argv[process.argv.indexOf("-c") + 1] ?? "";
const url = /url="([^"]+)"/.exec(cfg)?.[1];
const token = process.env[${JSON.stringify(CODEX_TOOLS_TOKEN_ENV)}];
${body}
`,
  );
  const binPath = join(dir, "fake-codex");
  writeFileSync(binPath, `#!/bin/sh\nexec "${process.execPath}" "${script}" "$@"\n`);
  chmodSync(binPath, 0o755);
  return { binPath, argvDump };
}

let dir = "";
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("le tour outillé sur la CLI Codex", () => {
  it("capture l'appel d'outil du pont, tue la CLI et rend {toolCalls} — jamais d'exécution CLI", async () => {
    dir = mkdtempSync(join(tmpdir(), "openmasq-codextools-"));
    const { binPath, argvDump } = fakeCodex(
      dir,
      `await fetch(url, { method: "POST",
         headers: { authorization: "Bearer " + token, "content-type": "application/json" },
         body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call",
           params: { name: "dropbox_search", arguments: { query: "PERSONNE_1" } } }) });
       await new Promise(() => {});`,
    );
    const r = await completeSubscriptionTools(
      { cli: "codex", label: "Codex", binPath, cwd: dir },
      { messages: [{ role: "user", content: "Analyse mon Dropbox." }], tools: TOOLS },
    );
    expect(r.stopReason).toBe("tool_calls");
    expect(r.toolCalls[0].name).toBe("dropbox_search");
    // Les arguments restent REDACTED tels que le modèle les a émis : le un-redaction
    // appartient à la boucle (règle 11), jamais à ce chemin.
    expect(r.toolCalls[0].arguments).toEqual({ query: "PERSONNE_1" });

    const argv: string[] = JSON.parse(readFileSync(argvDump, "utf8"));
    // ⚠️ Frontière : le jeton du pont ne passe JAMAIS en argv (lisible via `ps`) — il n'a
    // atteint la fausse CLI que par son environnement, ce que prouve la capture ci-dessus.
    expect(argv.join(" ")).not.toMatch(/[0-9a-f]{48}/);
    // …et l'isolement du tour texte tient : ni config du poste, ni règles, ni exécution.
    expect(argv).toContain("--ignore-user-config");
    expect(argv).toContain("--ignore-rules");
    expect(argv).toContain("--ephemeral");
    expect(argv[argv.indexOf("--sandbox") + 1]).toBe("read-only");
    for (const f of CODEX_DISABLED_FEATURES) {
      expect(argv.slice(argv.indexOf("--disable")).includes(f), `--disable ${f}`).toBe(true);
    }
  }, 15_000);

  it("fin de flux sans appel ⇒ {text, stop} avec l'usage — le tour texte reste intact", async () => {
    dir = mkdtempSync(join(tmpdir(), "openmasq-codextools-"));
    const { binPath } = fakeCodex(
      dir,
      `const ev = (o) => process.stdout.write(JSON.stringify(o) + "\\n");
       ev({ type: "item.completed", item: { type: "agent_message", text: "Bonjour." } });
       ev({ type: "turn.completed", usage: { input_tokens: 7, output_tokens: 3 } });`,
    );
    const r = await completeSubscriptionTools(
      { cli: "codex", label: "Codex", binPath, cwd: dir },
      { messages: [{ role: "user", content: "Dis bonjour." }], tools: TOOLS },
    );
    expect(r.toolCalls).toEqual([]);
    expect(r.text).toBe("Bonjour.");
    expect(r.stopReason).toBe("stop");
    expect(r.usage?.outputTokens).toBe(3);
  }, 15_000);

  it("refuse les pièces jointes AVANT tout spawn, sous le nom de SA CLI", async () => {
    dir = mkdtempSync(join(tmpdir(), "openmasq-codextools-"));
    await expect(
      completeSubscriptionTools(
        { cli: "codex", label: "Codex", binPath: join(dir, "absent"), cwd: dir },
        {
          messages: [
            {
              role: "user",
              content: "vois",
              attachments: [{ kind: "image", mediaType: "image/png", dataBase64: "x" }],
            },
          ],
          tools: TOOLS,
        },
      ),
    ).rejects.toThrow(/Codex.*pièces jointes/s);
  });
});

describe("codexToolsServerConfig — le pont est le SEUL serveur MCP, en allow-list", () => {
  it("nomme chaque outil du tour, approuve leur appel, et garde le jeton hors de la valeur", () => {
    const cfg = codexToolsServerConfig("http://127.0.0.1:5123/mcp", ["a", "b_c"]);
    expect(cfg.startsWith("mcp_servers.openmasq={")).toBe(true);
    expect(cfg).toContain('enabled_tools=["a","b_c"]');
    // Sans « approve », l'appel MEURT sur « requires approval, but approval policy is
    // never » : `codex exec` est non interactif (mesuré, CLI 0.149.1).
    expect(cfg).toContain('default_tools_approval_mode="approve"');
    // Le jeton est NOMMÉ, jamais écrit : la CLI le lit dans l'environnement de son process.
    expect(cfg).toContain(`bearer_token_env_var="${CODEX_TOOLS_TOKEN_ENV}"`);
  });

  it("un nom d'outil biscornu ne peut pas casser la table TOML ni en ouvrir une autre", () => {
    const cfg = codexToolsServerConfig("http://127.0.0.1:1/mcp", ['x",trust_level="all']);
    expect(cfg).toContain('enabled_tools=["x\\",trust_level=\\"all"]');
    expect(cfg).not.toMatch(/,trust_level="all"/);
  });
});
