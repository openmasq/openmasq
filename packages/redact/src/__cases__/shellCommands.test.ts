import { describe, it, expect } from "vitest";
import { pseudonymize } from "../index";

// A canned model detector: returns the given findings JSON verbatim.
const model = (json: string) => async () => json;

/**
 * REGRESSION — the DETECTION side of the incident `engine/vault/pathSegments.ts` closed on
 * the vault side. A conversation about a machine is dense with command names; a detector
 * tags one as an ORG or a NAME, and from the moment it is vaulted the agent's next shell
 * command runs a word that no longer exists. Nobody's data was protected in the trade.
 */
describe("a shell command line survives an over-flagging detector", () => {
  const SESSION = [
    "Voici ce que j'ai lancé :",
    "grep -R \"Berlioz\" /srv/app | awk '{print $2}'",
    "sudo systemctl restart nginx",
    "ls -la /var/log && rm build.log",
    "cat rapport.json | jq '.total'",
  ].join("\n");

  it("keeps every command verbatim, and none of them in the vault", async () => {
    const complete = model(
      JSON.stringify([
        { value: "grep", category: "ORG" },
        { value: "awk", category: "NAME" },
        { value: "systemctl", category: "ORG" },
        { value: "ls", category: "NAME" },
        { value: "rm", category: "NAME" },
        { value: "jq", category: "ORG" },
        { value: "cat", category: "NAME" },
      ]),
    );
    const vault: Record<string, string> = {};
    const r = await pseudonymize(SESSION, { complete, vault });
    for (const cmd of ["grep -R", "awk '{print", "systemctl restart", "ls -la", "rm build.log", "| jq"])
      expect(r.text).toContain(cmd);
    // The path segments keep obeying their own rule (`model/paths.ts`) — a command name
    // never enters the vault, which is what would rewrite it in every later turn.
    const commands = new Set(["grep", "awk", "systemctl", "ls", "rm", "jq", "cat", "nginx"]);
    expect(Object.values(vault).filter((v) => commands.has(v))).toEqual([]);
  });

  it("the real name on the SAME line is still redacted", async () => {
    const complete = model(JSON.stringify([{ value: "Berlioz", category: "NAME" }]));
    const r = await pseudonymize(SESSION, { complete, vault: {} });
    expect(r.text).not.toContain("Berlioz");
    expect(r.text).toContain("grep -R");
  });

  it("a person whose name is a command keeps her fake", async () => {
    const txt = "Ping Wei et Ruby Martin rejoignent l'équipe le 3 mars.";
    const complete = model(
      JSON.stringify([
        { value: "Ping Wei", category: "NAME" },
        { value: "Ruby Martin", category: "NAME" },
      ]),
    );
    const r = await pseudonymize(txt, { complete, vault: {} });
    expect(r.text).not.toContain("Ping Wei");
    expect(r.text).not.toContain("Ruby Martin");
  });
});
