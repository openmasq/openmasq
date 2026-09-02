// What this pins: the dev env loader closes the gap where `.env.development` documented
// variables the defines never read — WITHOUT ever reaching a packaged build.
import { describe, it, expect } from "vitest";
import { parseEnvFile, applyDevEnvFiles, isDevCommand } from "./devEnv";
import { writeFileSync, mkdtempSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

describe("parseEnvFile", () => {
  it("reads assignments, skips comments, strips quotes", () => {
    const env = parseEnvFile(
      `# commentaire\nOPENMASQ_SLACK_CLIENT_ID=123.456\nexport A="x y"\nB='z'\n\nMAL FORMÉ\n`,
    );
    expect(env).toEqual({ OPENMASQ_SLACK_CLIENT_ID: "123.456", A: "x y", B: "z" });
  });

  it("does not read a commented-out variable — the placeholder stays a placeholder", () => {
    expect(parseEnvFile("#   OPENMASQ_SLACK_CLIENT_ID=           # Slack connector")).toEqual({});
  });
});

describe("applyDevEnvFiles", () => {
  it("fills missing keys only — the shell wins, then .local, then the file", () => {
    const dir = mkdtempSync(join(tmpdir(), "devenv-"));
    writeFileSync(join(dir, ".env.development.local"), "A=local\nB=local\n");
    writeFileSync(join(dir, ".env.development"), "A=file\nB=file\nC=file\n");
    const env: Record<string, string | undefined> = { A: "shell" };
    applyDevEnvFiles(env, [join(dir, ".env.development.local"), join(dir, ".env.development")]);
    expect(env).toEqual({ A: "shell", B: "local", C: "file" });
  });

  it("tolerates an absent file", () => {
    const env: Record<string, string | undefined> = {};
    applyDevEnvFiles(env, ["/nulle/part/.env.development.local"]);
    expect(env).toEqual({});
  });
});

describe("isDevCommand", () => {
  it("matches dev (explicit, default, or flagged) and nothing that packages", () => {
    expect(isDevCommand(["node", "electron-vite", "dev"])).toBe(true);
    expect(isDevCommand(["node", "electron-vite"])).toBe(true);
    expect(isDevCommand(["node", "electron-vite", "--watch"])).toBe(true);
    expect(isDevCommand(["node", "electron-vite", "build"])).toBe(false);
    expect(isDevCommand(["node", "electron-vite", "preview"])).toBe(false);
  });
});
