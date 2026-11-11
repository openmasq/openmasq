/**
 * The command that starts the extraction worker shut in by the system (`extractSandbox.ts`):
 * pure, and pinned by its test, because a jail IS its argv.
 *
 * Every way runs the Node shipped beside the app under Node's own permissions (what it may read
 * and write; native addons and threads, which the OCR engines need), then:
 * - `seatbelt` (macOS): `sandbox-exec` with `workerSeatbelt` below: EVERYTHING denied, then what
 *   the worker needs and nothing of the user's;
 * - `jail` (Windows): the AppContainer launcher (`../python/winJail.ts`), granted the same
 *   folders: nothing else exists for the child, no socket at all, memory and processes capped.
 *   Node is told to take paths as given (`--preserve-symlinks*`): resolving a module's real path
 *   reads every folder above it, which the container may not.
 *
 * Node's own heap is capped on every way (`--max-old-space-size`); what holds against native
 * memory is the Job Object on Windows and main's measure elsewhere (`../runtime/processWatch.ts`).
 */
export const SANDBOX_EXEC = "/usr/bin/sandbox-exec";

export type WorkerWay = "seatbelt" | "jail";

const quote = (s: string) => JSON.stringify(s);

/**
 * The Seatbelt profile: `(deny default)`, then an ALLOW-list. Apple's base profile for its own
 * daemons (`system.sb`: the system's libraries and its logging) is the start; on top, the one
 * program it runs, the folders it reads (granted by the caller) and the one it writes. So: no
 * network, no other program and no fork, no service of the session (the pasteboard, opening a
 * URL or a file through LaunchServices, Apple events: `workerJailProfile.test.ts` probes it
 * live), no file outside its grants: not the home folder, not a disk plugged in, not /tmp, not
 * /Users/Shared. Names and sizes stay readable along the way (Node resolves its paths through
 * the folders above them); never a file's bytes.
 */
export function workerSeatbelt(o: { read: string[]; write: string[]; exec: string }): string {
  const within = (list: string[]) => list.map((p) => `(subpath ${quote(p)})`).join(" ");
  // a folder that holds everything is never one of them: the worker is not given the whole disk
  const read = o.read.filter((p) => p !== "/" && p !== "");
  return [
    "(version 1)",
    "(deny default)",
    // « deny default » alone leaves mapping a file as code allowed: denied, then re-allowed for
    // the system's libraries (system.sb) and the granted folders only
    "(deny file-map-executable)",
    '(import "system.sb")',
    `(allow process-exec (literal ${quote(o.exec)}))`,
    "(allow process-info* (target self))",
    "(allow signal (target self))",
    "(allow sysctl-read)",
    "(allow file-read-metadata)",
    `(allow file-read* ${within(read)})`,
    `(allow file-map-executable ${within(read)})`,
    // never code from the folder it writes: a library dropped there is not loaded
    `(deny file-map-executable ${within(o.write)})`,
    `(allow file-write* (literal "/dev/null") ${within(o.write)})`,
    // system.sb lets its daemons read the accounts' files: never this process (last: the later rule wins)
    '(deny file-read* (literal "/private/etc/passwd") (literal "/private/etc/master.passwd") (literal "/etc/passwd"))',
  ].join("\n");
}

export interface WorkerCommandOptions {
  way: WorkerWay;
  /** the Node to run, and its real path (what the sandbox lets it execute) */
  node: string;
  nodeReal: string;
  /** the Windows launcher, for `jail` */
  jail?: string;
  script: string;
  read: string[];
  write: string[];
  /** the whole process's cap (the Windows Job Object's), and V8's heap inside it */
  memoryMb: number;
  heapMb: number;
}

export function workerCommand(o: WorkerCommandOptions): { cmd: string; args: string[] } {
  const node = [
    `--max-old-space-size=${o.heapMb}`,
    "--permission",
    ...o.read.map((p) => `--allow-fs-read=${p}`),
    ...o.write.map((p) => `--allow-fs-write=${p}`),
    "--allow-addons",
    "--allow-worker",
    o.script,
  ];
  if (o.way === "jail") {
    if (!o.jail) throw new Error("no jail launcher");
    const grants = [...o.read.flatMap((p) => ["--allow-read", p]), ...o.write.flatMap((p) => ["--allow-write", p])];
    return {
      cmd: o.jail,
      args: [...grants, "--memory-mb", String(o.memoryMb), "--active-processes", "8", "--", o.node, "--preserve-symlinks", "--preserve-symlinks-main", ...node],
    };
  }
  return { cmd: SANDBOX_EXEC, args: ["-p", workerSeatbelt({ read: o.read, write: o.write, exec: o.nodeReal }), o.nodeReal, ...node] };
}
