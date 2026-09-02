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
const REPO = join(MAIN, "..", "..", "..", "..");
const PACKAGES = join(REPO, "packages");

/**
 * Read OUTSIDE main, so they cannot be gated on the reading line — a package has no
 * `app.isPackaged`. Main neutralises them instead: `runtime/ocrAssets.ts` deletes each
 * before a packaged build reaches the code that reads it, so the in-code digest pins and
 * the bundled assets are the only pair that can apply. The deletion is asserted below.
 */
const DROPPED: Record<string, string> = {
  OPENMASQ_TESSERACT_LANG_PATH: "chooses the traineddata bytes fed to the native parser",
  OPENMASQ_TESSERACT_INTEGRITY: "replaces the digests those bytes are checked against",
  OPENMASQ_DOCTR_MODEL_PATH: "chooses the .onnx fed to onnxruntime",
};
const DROPS_IN = "runtime/ocrAssets.ts";

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
  // Read inside `@openmasq/redact`, in main's process or the OCR/NER child it spawns.
  OPENMASQ_DOCTR_INT8: "picks the int8 weights; both variants are pinned the same way",
  OPENMASQ_DOCTR_THREADS: "onnxruntime thread count; a performance knob",
  OPENMASQ_DOCTR_MIN_CONFIDENCE: "OCR acceptance threshold; changes yield, grants nothing",
  OPENMASQ_DOCTR_MIN_YIELD: "OCR acceptance threshold; changes yield, grants nothing",
  OPENMASQ_NER_REVISION: "names a model revision; the fetch is digest-pinned regardless",
  // The eval harness (`packages/ui/src/evals/**`) — an R&D loop a developer runs from a
  // checkout against their OWN provider key. Nothing here is read by the shipped app.
  OPENMASQ_EVAL_API_KEY: "the runner's own provider key, for the eval loop",
  OPENMASQ_EVAL_BASE_URL: "eval loop endpoint",
  OPENMASQ_EVAL_PROVIDER: "eval loop provider",
  OPENMASQ_EVAL_MODEL: "eval loop model",
  OPENMASQ_EVAL_RUNS: "eval loop repetition count",
  OPENMASQ_EVAL_ONLY: "eval loop case filter",
  OPENMASQ_EVAL_PARALLEL: "eval loop shard count",
  OPENMASQ_EVAL_DUMP: "eval loop transcript dump path",
  OPENMASQ_EVAL_SERVERS: "eval loop MCP server selection",
  OPENMASQ_EVAL_STRATEGY: "eval loop strategy selection",
  OPENMASQ_EVAL_REAL_PY: "eval loop: use the real Python jail rather than a double",
  OPENMASQ_EVAL_REAL_WEB: "eval loop: use the real browser rather than a double",
};

function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) {
      if (e !== "node_modules" && e !== "dist") walk(p, out);
    }
    else if (/\.tsx?$/.test(e) && !/\.test\.tsx?$/.test(e)) out.push(p);
  }
  return out;
}

type Hit = { file: string; line: number; name: string; text: string };

function hits(): Hit[] {
  const found: Hit[] = [];
  const roots = [MAIN, ...readdirSync(PACKAGES).map((p) => join(PACKAGES, p, "src"))];
  for (const root of roots) {
    let files: string[];
    try {
      files = walk(root);
    } catch {
      continue; // a package with no src/
    }
    for (const file of files) {
      const lines = readFileSync(file, "utf8").split("\n");
      lines.forEach((text, i) => {
        for (const m of text.matchAll(/process\.env\.(OPENMASQ_[A-Z0-9_]+)/g)) {
          // A comment mentioning the var is documentation, not a read.
          if (/^\s*(\/\/|\*|\/\*)/.test(text)) continue;
          found.push({ file: file.slice(REPO.length + 1), line: i + 1, name: m[1], text });
        }
      });
    }
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

  it("main neutralises every DROPPED hook before a packaged build can read it", () => {
    const src = readFileSync(join(MAIN, DROPS_IN), "utf8");
    const missing = Object.keys(DROPPED).filter(
      (n) => !src.includes(`delete process.env.${n}`),
    );
    expect(missing).toEqual([]);
  });

  it("a DROPPED hook is never ALSO honoured on a packaged path", () => {
    // The deletion must precede the read, so no reachable line may re-set one from
    // outside. Main may only assign it the bundled, in-code path.
    const src = readFileSync(join(MAIN, DROPS_IN), "utf8");
    for (const name of Object.keys(DROPPED)) {
      for (const line of src.split("\n")) {
        if (!line.includes(`process.env.${name} =`)) continue;
        expect(line).not.toMatch(/=\s*process\.env\./);
      }
    }
  });

  it("every env hook is classified (a new one must be declared CAPABILITY or BENIGN)", () => {
    const unknown = [...new Set(hits().map((h) => h.name))].filter(
      (n) => !CAPABILITY.has(n) && !(n in BENIGN) && !(n in DROPPED),
    );
    expect(unknown).toEqual([]);
  });
});
