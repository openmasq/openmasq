import { existsSync, openSync, readSync, closeSync, statSync } from "node:fs";

/**
 * Follows a growing file — the equivalent of `tail -f`, in Node.
 *
 * ⚠️ **This is the half of the proof the ATTACHED mode would otherwise lose.** When the driver
 * spawns the app, it reads its pipes; when it ATTACHES to an app launched by someone
 * else (`devApp.ts` says why that's sometimes the only path), that output goes out into
 * THAT person's terminal. And `[mcp:raw]` — the REAL, un-redacted arguments received
 * by each tool — comes out precisely there, on stdout. Without this following, `D errors` and
 * `D toolcalls` would answer "nothing" on a perfectly chatty app, and the agent
 * would conclude a tool was never called.
 *
 * Hence the attached-mode convention: the app launches redirecting its output into
 * `.journey/main.log`, and that's the file we follow.
 */
const INTERVAL_MS = 400;

export function tailLog(filePath: string, note: (line: string) => void): () => void {
  // From the START of the file, not from now: what the app said on startup
  // (native modules, mounted connectors, first errors) is what explains the rest.
  let readCount = 0;
  let rest = "";
  let alive = true;

  const swallow = () => {
    if (!alive || !existsSync(filePath)) return;
    let fileSize: number;
    try {
      fileSize = statSync(filePath).size;
    } catch {
      return;
    }
    // TRUNCATED file (app relaunched into the same log): start over from zero rather than
    // reading at an offset that no longer exists — otherwise following goes silent for good.
    if (fileSize < readCount) {
      readCount = 0;
      rest = "";
    }
    if (fileSize === readCount) return;
    const fd = openSync(filePath, "r");
    try {
      const buffer = Buffer.alloc(fileSize - readCount);
      const n = readSync(fd, buffer, 0, buffer.length, readCount);
      readCount += n;
      const lines = (rest + buffer.subarray(0, n).toString("utf8")).split("\n");
      rest = lines.pop() ?? "";
      for (const l of lines) if (l.trim()) note(l);
    } finally {
      closeSync(fd);
    }
  };

  swallow();
  const t = setInterval(swallow, INTERVAL_MS);
  t.unref?.();
  return () => {
    alive = false;
    clearInterval(t);
  };
}
