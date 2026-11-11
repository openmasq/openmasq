import { spawnSync, type ChildProcess } from "node:child_process";

/** Kill a jailed child and everything it started (`sandbox.ts`: on its timeout, past a cap, and
 *  before its outputs are collected). */
export function killTree(child: ChildProcess): void {
  try {
    if (process.platform === "win32" && child.pid) {
      spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    } else if (child.pid) {
      // Kill the whole PROCESS GROUP (the child is spawned `detached`), so forked
      // grandchildren don't survive the wall-clock kill.
      try {
        process.kill(-child.pid, "SIGKILL");
      } catch {
        child.kill("SIGKILL");
      }
    } else {
      child.kill("SIGKILL");
    }
  } catch {
    /* already gone */
  }
}
