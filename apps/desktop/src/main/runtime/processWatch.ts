import { execFile } from "node:child_process";
import { lstat, readdir } from "node:fs/promises";
import { join } from "node:path";

/**
 * A cap that HOLDS on a child's memory and on the folder it writes, where the system gives none.
 *
 * A jailed child (the extraction worker, `../ocr/extractSandbox.ts`; the Python interpreter,
 * `../python/sandbox.ts`) parses a hostile file or runs model-written code: left alone it can
 * allocate until the machine swaps, or fill the disk, for as long as its timeout lasts. On
 * Windows the jail's Job Object caps memory in the kernel. On macOS `ulimit -v` is not enforced
 * and a WebAssembly or V8 heap flag bounds one heap only, never native memory: so main MEASURES
 * the child's whole tree (`ps`, resident memory) and its work folder every two seconds, and past
 * a cap says why ONCE (`onOver`), for the owner to kill the tree and tell the person the true
 * reason. Fail closed: a `ps` that cannot run several times in a row is treated as over.
 *
 * Measuring is the parent's, outside the jail: nothing the child does can turn it off.
 */
export type Over = "memory" | "disk";

export interface WatchLimits {
  /** resident memory of the whole tree, MB */
  memoryMb: number;
  /** the folder the child writes, and what it may weigh (MB) and hold (files) */
  folder?: string;
  diskMb?: number;
  maxFiles?: number;
  everyMs?: number;
}

const EVERY_MS = 2000;
const MAX_FILES = 20_000;
/** this many measures in a row that could not be taken: the cap can no longer be held */
const BLIND_MAX = 5;

/** Resident memory (KB) of `pid` and everything it started, out of `ps -A -o pid=,ppid=,rss=`. */
export function treeRssKb(table: string, pid: number): number {
  const rows = table
    .split("\n")
    .map((l) => l.trim().split(/\s+/).map(Number))
    .filter((r) => r.length >= 3 && r.every(Number.isFinite)) as [number, number, number][];
  const children = new Map<number, number[]>();
  const rss = new Map<number, number>();
  for (const [p, parent, kb] of rows) {
    rss.set(p, kb);
    children.set(parent, [...(children.get(parent) ?? []), p]);
  }
  let total = 0;
  const seen = new Set<number>();
  const walk = [pid];
  while (walk.length) {
    const p = walk.pop() as number;
    if (seen.has(p)) continue;
    seen.add(p);
    total += rss.get(p) ?? 0;
    walk.push(...(children.get(p) ?? []));
  }
  return total;
}

/** A folder's weight (bytes) and file count, links never followed; stops counting past `maxFiles`. */
export async function folderWeight(folder: string, maxFiles = MAX_FILES): Promise<{ bytes: number; files: number }> {
  let bytes = 0;
  let files = 0;
  const walk = [folder];
  while (walk.length && files <= maxFiles) {
    const dir = walk.pop() as string;
    const names = await readdir(dir).catch(() => [] as string[]);
    for (const name of names) {
      const s = await lstat(join(dir, name)).catch(() => null);
      if (!s) continue;
      files++;
      if (s.isDirectory()) walk.push(join(dir, name));
      else bytes += s.size;
      if (files > maxFiles) break;
    }
  }
  return { bytes, files };
}

const psTable = () =>
  new Promise<string | null>((resolve) => {
    execFile("/bin/ps", ["-A", "-o", "pid=,ppid=,rss="], { timeout: 5000, maxBuffer: 8 * 1024 * 1024 }, (err, out) => resolve(err ? null : out));
  });

/**
 * Watch `pid`'s tree and its folder; `onOver` is called at most once. Returns the stop function.
 * A no-op on Windows, where the jail's Job Object holds the memory cap itself.
 */
export function watchProcess(pid: number | undefined, limits: WatchLimits, onOver: (why: Over) => void, table: () => Promise<string | null> = psTable): () => void {
  if (!pid || process.platform === "win32") return () => {};
  let done = false;
  let busy = false;
  let blind = 0;
  const stop = () => {
    done = true;
    clearInterval(timer);
  };
  const over = (why: Over) => {
    if (done) return;
    stop();
    onOver(why);
  };
  const timer = setInterval(async () => {
    if (done || busy) return;
    busy = true;
    try {
      const out = await table();
      blind = out === null ? blind + 1 : 0;
      if (blind >= BLIND_MAX) return over("memory");
      if (out !== null && treeRssKb(out, pid) > limits.memoryMb * 1024) return over("memory");
      if (limits.folder && limits.diskMb) {
        const w = await folderWeight(limits.folder, limits.maxFiles ?? MAX_FILES);
        if (w.bytes > limits.diskMb * 1024 * 1024 || w.files > (limits.maxFiles ?? MAX_FILES)) return over("disk");
      }
    } finally {
      busy = false;
    }
  }, limits.everyMs ?? EVERY_MS);
  timer.unref?.();
  return stop;
}
