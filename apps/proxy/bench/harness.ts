// The two processes a run drives: the proxy under test, and a real `claude -p` pointed at it.
//
// The agent runs in an EMPTY directory with tools disallowed and one turn: the bench measures
// what the masking does to an answer, not what an agent does to a repository. It also keeps
// the run cheap — the subscription pays for every call.
import { spawn } from "node:child_process";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface ProxyRun {
  /** One entry per relayed request, in order, from the proxy's `--json` stream. */
  requests: { masked: number; categories: Record<string, number> }[];
  stop(): void;
}

const SERVER = join(import.meta.dirname, "..", "dist", "server.js");
const NO_TOOLS = [
  "Bash",
  "Read",
  "Write",
  "Edit",
  "Glob",
  "Grep",
  "WebFetch",
  "WebSearch",
  "Task",
  "TodoWrite",
];

/** Start the proxy on `port` with `flags`; resolves once it is listening. */
export function startProxy(port: number, flags: string[]): Promise<ProxyRun> {
  return new Promise((resolve, reject) => {
    const child = spawn("node", [SERVER, "--port", String(port), "--json", ...flags], {
      stdio: ["ignore", "pipe", "pipe"],
      detached: true,
    });
    const requests: ProxyRun["requests"] = [];
    let buffer = "";
    let ready = false;
    const onData = (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (line.includes(`http://127.0.0.1:${port}`) && !ready) {
          ready = true;
          resolve({ requests, stop });
        }
        try {
          const o = JSON.parse(line) as { masked?: number; categories?: Record<string, number> };
          if (typeof o.masked === "number")
            requests.push({ masked: o.masked, categories: o.categories ?? {} });
        } catch {
          // a human line (the fail-closed message, a warning): not our business here
        }
      }
    };
    const stop = () => {
      try {
        process.kill(-child.pid!, "SIGKILL");
      } catch {
        // already gone
      }
    };
    child.stdout.on("data", onData);
    child.stderr.on("data", onData);
    child.on("exit", (code) => {
      if (!ready)
        reject(
          new Error(
            `the proxy exited with ${code} before listening (build it: pnpm --filter @openmasq/proxy build)`,
          ),
        );
    });
    setTimeout(() => {
      if (!ready) {
        stop();
        reject(new Error("the proxy did not start within 90 s"));
      }
    }, 90_000).unref();
  });
}

export interface AgentAnswer {
  text: string;
  ms: number;
  failed?: string;
}

/**
 * One `claude -p` call. `baseUrl` empty ⇒ the vendor directly (the baseline).
 * Authentication is the user's own subscription: no key is read or passed here.
 */
export function askAgent(
  prompt: string,
  baseUrl: string,
  model: string,
  timeoutMs = 180_000,
): Promise<AgentAnswer> {
  const cwd = mkdtempSync(join(tmpdir(), "openmasq-bench-"));
  const env = { ...process.env, ...(baseUrl ? { ANTHROPIC_BASE_URL: baseUrl } : {}) };
  const started = Date.now();
  return new Promise((resolve) => {
    const child = spawn(
      "claude",
      ["-p", prompt, "--model", model, "--max-turns", "1", "--disallowed-tools", ...NO_TOOLS],
      { cwd, env, stdio: ["ignore", "pipe", "pipe"] },
    );
    let out = "";
    let err = "";
    child.stdout.on("data", (d) => (out += d));
    child.stderr.on("data", (d) => (err += d));
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve({ text: out, ms: Date.now() - started, failed: "timeout" });
    }, timeoutMs);
    child.on("error", (e) => {
      clearTimeout(timer);
      resolve({ text: "", ms: Date.now() - started, failed: e.message });
    });
    child.on("exit", (code) => {
      clearTimeout(timer);
      resolve({
        text: out.trim(),
        ms: Date.now() - started,
        ...(code === 0 ? {} : { failed: err.trim().slice(0, 200) || `exit ${code}` }),
      });
    });
  });
}
