// The gate on capability-granting launch-env hooks, enforced mechanically.
//
// Individual gates drift: `OPENMASQ_DB_PLAINTEXT` was correctly reasoned about and
// gated on `!app.isPackaged`, and then ten sibling hooks were added over time with the
// same shape and no gate — including one that forks an arbitrary script as the signed
// app, and one that turns the Python jail off. Reviewing each new hook by hand is the
// process that already failed, so this test is the process instead.
//
// Every `process.env.OPENMASQ_*` read in `src/main/**` must be one of:
//   • CAPABILITY — gated on the same line by `devOnly(...)` or `!app.isPackaged`;
//   • BENIGN — listed below with the reason it grants nothing.
// A var in neither list fails: adding a hook forces the author to classify it.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const MAIN = join(dirname(fileURLToPath(import.meta.url)), "..");

/** Grants a capability ⇒ must never be honoured by a packaged build. */
const CAPABILITY = new Set([
  "OPENMASQ_BROKER_ENTRY", // forks an arbitrary entry AS the signed app
  "OPENMASQ_PYTHON_UNSAFE", // runs model-generated code with no jail
  "OPENMASQ_SANDBOX_LINUX_NET", // re-opens network inside the Linux jail
  "OPENMASQ_MCP_RAW_LOG", // writes the REAL, un-redacted tool arguments
  "OPENMASQ_E2E_ATTACH", // self-grants read on caller-chosen absolute paths
  "OPENMASQ_E2E_WIRE_LOG", // appends the outgoing conversation to a chosen path
  "OPENMASQ_DB_PLAINTEXT", // opens the DB + vault in cleartext
  "OPENMASQ_REAL_KEYCHAIN", // swaps the mock keychain for the real one
]);

/** Grants nothing: build-time identity, a path the app itself set, or a TIGHTENING. */
const BENIGN: Record<string, string> = {
  OPENMASQ_AUTH_URL: "build-time service address, not a capability",
  OPENMASQ_GITHUB_CLIENT_ID: "public OAuth client id baked at build",
  OPENMASQ_GOOGLE_CLIENT_ID: "public OAuth client id baked at build",
  OPENMASQ_GOOGLE_CLIENT_SECRET: "desktop-app OAuth client, non-confidential by design",
  OPENMASQ_MICROSOFT_CLIENT_ID: "public OAuth client id baked at build",
  OPENMASQ_SLACK_CLIENT_ID: "public OAuth client id baked at build",
  OPENMASQ_DB_ENCRYPT: "tightening: asks for encryption, never relaxes it",
  OPENMASQ_REQUIRE_DB_ENCRYPTION: "tightening: refuses to start unencrypted",
  OPENMASQ_DOCTR_INTEGRITY: "tightening: supplies the digests to verify against",
  OPENMASQ_DOCTR_REQUIRE_PIN: "tightening: refuses an unpinned model",
  OPENMASQ_DOCTR_MODEL_PATH: "set BY main after arming the pin; the dev override is deleted when packaged",
  OPENMASQ_TESSERACT_LANG_PATH: "set BY main to the bundled, digest-verified langs",
  OPENMASQ_E2E: "master test switch; the capability sub-hooks above carry their own gate",
  OPENMASQ_E2E_MCP_FIXTURES: "double-gated on OPENMASQ_E2E",
  OPENMASQ_E2E_MCP_ONLY: "double-gated on OPENMASQ_E2E",
  OPENMASQ_E2E_TOOLCALL_LOG: "double-gated on OPENMASQ_E2E",
  OPENMASQ_E2E_PICK_DIR: "double-gated on OPENMASQ_E2E",
  OPENMASQ_AGENT_BROWSER: "set BY main when it spawns the agent process",
  OPENMASQ_AGENT_CDP_PIPE: "set BY main when it spawns the agent process",
  OPENMASQ_AGENT_USERDATA: "set BY main when it spawns the agent process",
  OPENMASQ_AGENT_NO_STEALTH: "UA/stealth toggle inside the agent browser; grants no access",
  OPENMASQ_SANDBOX_NO_NET: "tightening: removes network from the jail",
  OPENMASQ_DISABLE_DB: "runs without persistence; opens nothing",
  OPENMASQ_PWMCP: "selects the bundled Playwright-MCP entry",
  OPENMASQ_PWMCP_OUTPUT_DIR: "output dir for the bundled Playwright-MCP",
  OPENMASQ_TEST_SUBSCRIPTION_CLI: "test double for the subscription CLI probe",
  OPENMASQ_TEST_SUBSCRIPTION_CODEX: "test double for the subscription CLI probe",
  OPENMASQ_TEST_SUBSCRIPTION_ANTIGRAVITY: "test double for the subscription CLI probe",
  OPENMASQ_USER_DATA_DIR: "relocates userData; the read gate is rooted on it either way",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) walk(p, out);
    else if (/\.tsx?$/.test(e) && !/\.test\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}

type Hit = { file: string; line: number; name: string; text: string };

function hits(): Hit[] {
  const found: Hit[] = [];
  for (const file of walk(MAIN)) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((text, i) => {
      for (const m of text.matchAll(/process\.env\.(OPENMASQ_[A-Z0-9_]+)/g)) {
        // A comment mentioning the var is documentation, not a read.
        if (/^\s*(\/\/|\*|\/\*)/.test(text)) continue;
        found.push({ file: file.slice(MAIN.length + 1), line: i + 1, name: m[1], text });
      }
    });
  }
  return found;
}

const gated = (text: string) => text.includes("devOnly(") || text.includes("!app.isPackaged");

describe("launch-env capability hooks are dev-only", () => {
  it("finds env hooks to check at all (the walker works)", () => {
    expect(hits().length).toBeGreaterThan(10);
  });

  it("every CAPABILITY hook is gated on the line that reads it", () => {
    const ungated = hits()
      .filter((h) => CAPABILITY.has(h.name) && !gated(h.text))
      .map((h) => `${h.file}:${h.line} ${h.name}`);
    expect(ungated).toEqual([]);
  });

  it("every env hook is classified (a new one must be declared CAPABILITY or BENIGN)", () => {
    const unknown = [...new Set(hits().map((h) => h.name))].filter(
      (n) => !CAPABILITY.has(n) && !(n in BENIGN),
    );
    expect(unknown).toEqual([]);
  });
});
