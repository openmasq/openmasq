// The command line is capped by the OS; the conversation must never depend on it. These pin
// the guard that SAYS so in words, the typed launch failures, and the stdin path that
// replaced `-p <prompt>` (a long document on Windows died on « spawn ENAMETOOLONG »).
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cliFailOf } from "@openmasq/llm";
import { describe, expect, it } from "vitest";
import { interpretClaudeEvent } from "./claudeStream";
import { argvOverBudget, spawnFailureCode } from "./spawnFailure";
import { streamCliProcess } from "./spawnStream";

describe("argvOverBudget — each OS's own cap", () => {
  it("Windows: the WHOLE line is capped near 32 767 UTF-16 units", () => {
    expect(argvOverBudget("win32", "C:\\claude.exe", ["-p", "x".repeat(20_000)])).toBe(false);
    expect(argvOverBudget("win32", "C:\\claude.exe", ["-p", "x".repeat(33_000)])).toBe(true);
  });
  it("Linux: ONE argument past 128 KiB is refused even if the total fits", () => {
    expect(argvOverBudget("linux", "/bin/claude", ["x".repeat(130_000)])).toBe(true);
    expect(argvOverBudget("linux", "/bin/claude", ["x".repeat(100_000)])).toBe(false);
  });
  it("macOS: counts BYTES of the total (an accented text weighs double)", () => {
    expect(argvOverBudget("darwin", "/bin/claude", ["x".repeat(800_000)])).toBe(false);
    expect(argvOverBudget("darwin", "/bin/claude", ["é".repeat(500_000)])).toBe(true);
  });
});

describe("spawnFailureCode — bounded, never the raw errno text", () => {
  it("maps the launch errnos and folds anything else into spawn_other", () => {
    expect(spawnFailureCode("E2BIG")).toBe("prompt_too_long");
    expect(spawnFailureCode("ENAMETOOLONG")).toBe("prompt_too_long");
    expect(spawnFailureCode("ENOENT")).toBe("spawn_missing");
    expect(spawnFailureCode("EACCES")).toBe("spawn_denied");
    expect(spawnFailureCode("EWHATEVER")).toBe("spawn_other");
    expect(spawnFailureCode(undefined)).toBe("spawn_other");
  });
});

function fakeCli(script: string): { bin: string; cwd: string } {
  const cwd = mkdtempSync(join(tmpdir(), "om-cli-launch-"));
  const bin = join(cwd, "cli");
  writeFileSync(bin, `#!/bin/sh\n${script}\n`);
  chmodSync(bin, 0o755);
  return { bin, cwd };
}

async function run(opts: Parameters<typeof streamCliProcess>[0]) {
  const it = streamCliProcess(opts);
  const text: string[] = [];
  try {
    for (let r = await it.next(); !r.done; r = await it.next()) text.push(r.value);
  } catch (err) {
    return { text, err: err as Error };
  }
  return { text, err: null };
}

const delta = (t: string) =>
  JSON.stringify({ type: "stream_event", event: { type: "content_block_delta", delta: { type: "text_delta", text: t } } });

describe.skipIf(process.platform === "win32")("streamCliProcess — the prompt on stdin", () => {
  it("a prompt FAR past every argv cap reaches the CLI whole, through stdin", async () => {
    // The fake CLI answers with the byte count it read on stdin.
    const { bin, cwd } = fakeCli(`n=$(wc -c | tr -d ' ')\necho '${delta("N=")}'\nprintf '%s\\n' "{\\"type\\":\\"stream_event\\",\\"event\\":{\\"type\\":\\"content_block_delta\\",\\"delta\\":{\\"type\\":\\"text_delta\\",\\"text\\":\\"$n\\"}}}"`);
    const prompt = "x".repeat(2_000_000);
    const { text, err } = await run({ cli: "claude", binPath: bin, args: ["-p"], cwd, interpret: interpretClaudeEvent, stdin: prompt });
    expect(err).toBeNull();
    expect(text.join("")).toBe("N=2000000");
  });

  it("onStarted fires once on the first output, and once again never", async () => {
    const { bin, cwd } = fakeCli(`cat >/dev/null\necho '${delta("a")}'\necho '${delta("b")}'`);
    let n = 0;
    await run({ cli: "claude", binPath: bin, args: [], cwd, interpret: interpretClaudeEvent, stdin: "p", onStarted: () => n++ });
    expect(n).toBe(1);
  });

  it("a command line past the cap is refused BEFORE the spawn, typed, and onStarted still runs", async () => {
    const { bin, cwd } = fakeCli("exit 0");
    let n = 0;
    const { err } = await run({ cli: "codex", binPath: bin, args: ["é".repeat(600_000)], cwd, interpret: interpretClaudeEvent, onStarted: () => n++ });
    expect(cliFailOf(err?.message ?? "")?.code).toBe("prompt_too_long");
    expect(n).toBe(1);
  });

  it("a binary gone since detection is spawn_missing, never a bare « spawn ENOENT »", async () => {
    const { err } = await run({ cli: "claude", binPath: "/nonexistent/claude", args: [], cwd: tmpdir(), interpret: interpretClaudeEvent });
    expect(cliFailOf(err?.message ?? "")?.code).toBe("spawn_missing");
  });

  it("a non-zero exit that is not a lost session is counted as exit", async () => {
    const { bin, cwd } = fakeCli("echo boom 1>&2\nexit 3");
    const { err } = await run({ cli: "claude", binPath: bin, args: [], cwd, interpret: interpretClaudeEvent });
    expect(cliFailOf(err?.message ?? "")?.code).toBe("exit");
  });
});
