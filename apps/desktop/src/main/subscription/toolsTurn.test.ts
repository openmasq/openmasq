import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { ToolDef } from "@openmasq/llm";
import { buildToolsArgs } from "./claudeToolsTurn";
import { completeSubscriptionTools, renderToolHistory } from "./toolsTurn";

const TOOLS: ToolDef[] = [
  { name: "recherche", description: "Cherche.", parameters: { type: "object" } },
];

/**
 * Une fausse CLI : un vrai exécutable (sh → node absolu, aucun PATH requis) qui fait ce
 * que fait la vraie — lire `--mcp-config`, appeler le pont — sans abonnement ni réseau.
 * `argvDump` épingle la ligne de commande VUE par l'enfant : c'est là que vivent les
 * assertions de frontière (jeton hors argv, drapeaux d'isolement).
 */
function fakeCli(dir: string, body: string): { binPath: string; argvDump: string } {
  const argvDump = join(dir, "argv.json");
  const script = join(dir, "fake.mjs");
  writeFileSync(
    script,
    `import { readFileSync, writeFileSync } from "node:fs";
writeFileSync(${JSON.stringify(argvDump)}, JSON.stringify(process.argv.slice(2)));
const at = process.argv.indexOf("--mcp-config");
const cfg = at >= 0 ? JSON.parse(readFileSync(process.argv[at + 1], "utf8")) : null;
const srv = cfg?.mcpServers?.openmasq;
${body}
`,
  );
  const binPath = join(dir, "fake-cli");
  writeFileSync(binPath, `#!/bin/sh\nexec "${process.execPath}" "${script}" "$@"\n`);
  chmodSync(binPath, 0o755);
  return { binPath, argvDump };
}

let dir = "";
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("completeSubscriptionTools — la primitive completeTools sur la CLI", () => {
  it("capture l'appel d'outil du pont, tue la CLI et rend {toolCalls} — jamais d'exécution CLI", async () => {
    dir = mkdtempSync(join(tmpdir(), "openmasq-toolsturn-"));
    const { binPath, argvDump } = fakeCli(
      dir,
      `await fetch(srv.url, { method: "POST", headers: { ...srv.headers, "content-type": "application/json" },
         body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call",
           params: { name: "recherche", arguments: { q: "PERSONNE_1" } } }) });
       await new Promise(() => {});`,
    );
    const r = await completeSubscriptionTools(
      { binPath, cwd: dir },
      { messages: [{ role: "user", content: "Cherche PERSONNE_1." }], tools: TOOLS },
    );
    expect(r.stopReason).toBe("tool_calls");
    expect(r.toolCalls).toHaveLength(1);
    expect(r.toolCalls[0].name).toBe("recherche");
    // Les arguments restent REDACTED tels que le modèle les a émis : le un-redaction
    // appartient à la boucle (règle 11), jamais à ce chemin.
    expect(r.toolCalls[0].arguments).toEqual({ q: "PERSONNE_1" });

    const argv: string[] = JSON.parse(readFileSync(argvDump, "utf8"));
    // ⚠️ Frontière : le jeton du pont ne passe JAMAIS en argv (lisible via ps) ; et le
    // remplacement de --safe-mode (qui coupe MCP, mesuré) est bien l'allow-list stricte.
    expect(argv.join(" ")).not.toMatch(/[0-9a-f]{48}/);
    expect(argv).not.toContain("--safe-mode");
    expect(argv).toContain("--strict-mcp-config");
    expect(argv).toContain("--setting-sources");
    expect(argv[argv.indexOf("--allowedTools") + 1]).toBe("mcp__openmasq__recherche");
    expect(argv).toContain("--disallowed-tools");
  }, 15_000);

  it("fin de flux sans appel ⇒ {text, stop} avec l'usage — le tour texte reste intact", async () => {
    dir = mkdtempSync(join(tmpdir(), "openmasq-toolsturn-"));
    const { binPath } = fakeCli(
      dir,
      `const ev = (o) => process.stdout.write(JSON.stringify(o) + "\\n");
       ev({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: "Bonjour." } } });
       ev({ type: "result", is_error: false, usage: { input_tokens: 7, output_tokens: 3 }, stop_reason: "end_turn" });`,
    );
    const r = await completeSubscriptionTools(
      { binPath, cwd: dir },
      { messages: [{ role: "user", content: "Dis bonjour." }], tools: TOOLS },
    );
    expect(r.toolCalls).toEqual([]);
    expect(r.text).toBe("Bonjour.");
    expect(r.stopReason).toBe("stop");
    expect(r.usage?.outputTokens).toBe(3);
  }, 15_000);

  it("refuse les pièces jointes AVANT tout spawn, comme le tour simple", async () => {
    dir = mkdtempSync(join(tmpdir(), "openmasq-toolsturn-"));
    await expect(
      completeSubscriptionTools(
        { binPath: join(dir, "absent"), cwd: dir },
        {
          messages: [
            { role: "user", content: "vois", attachments: [{ kind: "image", mediaType: "image/png", dataBase64: "x" }] },
          ],
          tools: TOOLS,
        },
      ),
    ).rejects.toThrow(/pièces jointes/);
  });
});

describe("renderToolHistory — l'historique d'outils survit à l'aplatissement", () => {
  it("un tour assistant fait d'appels SANS texte devient un bloc lisible (sinon écarté)", () => {
    const out = renderToolHistory([
      { role: "user", content: "Cherche." },
      {
        role: "assistant",
        content: "",
        toolCalls: [{ id: "c1", name: "recherche", arguments: { q: "PERSONNE_1" } }],
      },
      { role: "tool", content: "2 résultats.", toolCallId: "c1" },
    ]);
    expect(out[1].content).toBe('[Appel d\'outil : recherche({"q":"PERSONNE_1"})]');
    expect(out[2]).toEqual({ role: "tool", content: "2 résultats.", toolCallId: "c1" });
  });
});

describe("buildToolsArgs", () => {
  it("chaque outil du tour est allow-listé sous son préfixe MCP, rien d'autre n'ouvre", () => {
    const args = buildToolsArgs({
      prompt: "p",
      sessionId: "s",
      mcpConfigPath: "/tmp/x.json",
      toolNames: ["a", "b__c"],
    });
    expect(args[args.indexOf("--allowedTools") + 1]).toBe("mcp__openmasq__a,mcp__openmasq__b__c");
  });

  // Le périmètre du tour outillé est le PONT et rien d'autre : `--tools ""` retire les
  // outils intégrés de la CLI, et les outils MCP y survivent (mesuré). `--allowedTools`
  // ne borne pas le périmètre — il ne peut donc pas tenir cette place (règle 7).
  it("borne le périmètre par ALLOW-LIST : aucun outil intégré, le pont reste (--tools \"\")", () => {
    const args = buildToolsArgs({
      prompt: "p",
      sessionId: "s",
      mcpConfigPath: "/tmp/x.json",
      toolNames: ["a"],
    });
    const at = args.indexOf("--tools");
    expect(at).toBeGreaterThan(-1);
    expect(args[at + 1]).toBe("");
    expect(args).toContain("--mcp-config");
  });
});
