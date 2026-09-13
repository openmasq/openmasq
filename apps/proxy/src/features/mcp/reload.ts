// A connection made through openmasq takes effect in the RUNNING proxy, not at the next
// start. `mcp login notion`, `mcp add`, `mcp remove` and an edit of the servers file all land
// in `~/.openmasq` (`mcp.json`, the credential store); this watches that directory and, on a
// change, resolves the server list again exactly as start-up did — the same precedence, the
// same policy — and hands the upstream what differs. Only what differs: a server whose entry
// and credentials did not move keeps its connection and any call in flight.
//
// The wrapped client's own servers stay switched off for the run (exclusivity is decided
// once, at start), so a server signed in here replaces the adopted one in place: the agent
// keeps the tool, and it now runs through openmasq's own credential. The agent learns of the
// change by `notifications/tools/list_changed` (`routes.ts`), which is how a tool appears
// or disappears mid-session without a restart.
import { type FSWatcher, watch } from "node:fs";
import { basename } from "node:path";
import type { ServerSpec } from "./servers.js";

/** The files whose change means "the servers, their credentials, or how they are masked
 *  moved". `proxy.json` is here for its `mcp` section ALONE — see `policyReload.ts`: nothing
 *  else in that file is re-read while the proxy runs, because a port or a host cannot move
 *  under a listening server and a masking level can. */
export const WATCHED = new Set(["mcp.json", "mcp-auth.enc", "proxy.json"]);

export interface ReloadDeps {
  /** The state directory (`lib/stateDir.ts`). */
  dir: string;
  /** Start-up's resolution, re-run: the servers this run has NOW. Throws on a bad file. */
  resolve: () => ServerSpec[];
  /** A fingerprint of a server's credentials: two equal strings mean "nothing to reconnect
   *  for". Never the credential itself — a boolean and a length are plenty. */
  credentials: (id: string) => string;
  /** Bring the upstream to `specs`, reconnecting `changed` (`upstream.ts`). */
  apply: (specs: ServerSpec[], changed: ReadonlySet<string>) => Promise<string[]>;
  /** Something moved: the agent's tool list is stale. */
  onChanged: (moved: string[]) => void;
  /** Re-read how the servers are MASKED and apply it, returning the ids that moved. Absent
   *  ⇒ the run keeps the masking it started with. Kept apart from `resolve`/`apply` because
   *  it touches no connection: a level change reconnects nothing. */
  remask?: () => string[];
  note: (text: string, tone?: "info" | "warn" | "ok") => void;
  /** Injected by tests. */
  watchFn?: typeof watch;
  debounceMs?: number;
}

/** What identifies a server's state for the diff: its entry (credentials included — an env
 *  key or a header lives there) and what the store holds for it. */
const fingerprint = (spec: ServerSpec, credentials: (id: string) => string): string =>
  `${JSON.stringify(spec)}|${credentials(spec.id)}`;

/** "The tool list moved": the route sends `notifications/tools/list_changed` on every
 *  standalone stream an agent holds open. A set of listeners, nothing more. */
export interface Signal {
  on(listener: () => void): () => void;
  emit(): void;
}

export function createSignal(): Signal {
  const listeners = new Set<() => void>();
  return {
    on: (l) => {
      listeners.add(l);
      return () => void listeners.delete(l);
    },
    emit: () => {
      for (const l of listeners) l();
    },
  };
}

export interface Reloader {
  /** Run one reconciliation now. Exposed for the tests and for a signal. */
  reload(): Promise<void>;
  close(): void;
}

export function watchIntegrations(initial: ServerSpec[], deps: ReloadDeps): Reloader {
  const seen = new Map(initial.map((s) => [s.id, fingerprint(s, deps.credentials)]));
  /** The ids this PROCESS started — the only stdio commands the watcher may keep running. */
  const started = new Set(initial.map((s) => s.id));
  let timer: NodeJS.Timeout | undefined;
  let running: Promise<void> = Promise.resolve();

  const reload = () =>
    (running = running.then(async () => {
      let specs: ServerSpec[];
      try {
        specs = deps.resolve();
      } catch (err) {
        // A half-written or broken file: the run keeps what it had, and says why.
        deps.note(
          `servers file not reloaded: ${err instanceof Error ? err.message : String(err)}`,
          "warn",
        );
        return;
      }
      const changed = new Set<string>();
      for (const s of specs) {
        const fp = fingerprint(s, deps.credentials);
        if (seen.has(s.id) && seen.get(s.id) !== fp) changed.add(s.id);
        seen.set(s.id, fp);
      }
      for (const id of [...seen.keys()]) if (!specs.some((s) => s.id === id)) seen.delete(id);
      // ⚠️ A STDIO server is a COMMAND, and connecting to it means SPAWNING that command. A
      // file in the state directory is not a human, so a stdio entry that appeared — or whose
      // command changed — is declared here and started at the next START, never launched by
      // the watcher on its own. What reloads live is everything that runs no process: a remote
      // server, and the credentials of one (`mcp login`, the case this watcher exists for).
      const held = specs.filter(
        (s) => s.transport === "stdio" && (!started.has(s.id) || changed.has(s.id)),
      );
      for (const s of held) {
        changed.delete(s.id);
        deps.note(
          `${s.id}: declared, not started — a local server is a command, and one is only ` +
            `launched when you start the proxy. Restart to run it.`,
          "warn",
        );
      }
      const runnable = specs.filter((s) => !held.some((h) => h.id === s.id));
      // Masking first, and on its OWN: it reconnects nothing, so it must still apply when
      // the servers themselves did not move — which is the common case, since the file that
      // carries a level is not the file that carries a server.
      if (deps.remask) {
        const remasked = deps.remask();
        if (remasked.length) deps.note(`masking updated: ${remasked.join(", ")}`, "ok");
      }
      const moved = await deps.apply(runnable, changed);
      for (const s of runnable) started.add(s.id);
      for (const id of [...started]) if (!specs.some((s) => s.id === id)) started.delete(id);
      if (moved.length) deps.onChanged(moved);
    }));

  let watcher: FSWatcher | undefined;
  try {
    watcher = (deps.watchFn ?? watch)(deps.dir, (_event, name) => {
      if (!name || !WATCHED.has(basename(String(name)))) return;
      // Editors and the CLI write in several steps (a temp file, a rename): one reload per
      // burst, once it has settled.
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => void reload(), deps.debounceMs ?? 400);
      timer.unref?.();
    });
    watcher.on("error", (err) => deps.note(`stopped watching ${deps.dir}: ${err.message}`, "warn"));
  } catch (err) {
    // No watcher on this filesystem: the run still works, at start-up's list.
    deps.note(
      `cannot watch ${deps.dir} (${err instanceof Error ? err.message : String(err)}): a new connection needs a restart`,
      "warn",
    );
  }

  return {
    reload,
    close: () => {
      if (timer) clearTimeout(timer);
      watcher?.close();
    },
  };
}
