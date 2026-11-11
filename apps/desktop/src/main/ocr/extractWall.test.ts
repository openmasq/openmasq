import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * A PACKAGED app reads a document inside the system's wall or not at all (`extractWall.ts`):
 * no jail, a jail that does not start, a bundle that does not match its digest are each a
 * REFUSAL, never the utilityProcess, and nothing downgrades the session. A worker main stopped
 * for its memory says so; an answer that is not one is refused.
 */
class FakeChild extends EventEmitter {
  posted: unknown[] = [];
  killed = false;
  stderr = null;
  over: "memory" | "disk" | null = null;
  postMessage(m: unknown) {
    this.posted.push(m);
  }
  kill() {
    this.killed = true;
    return true;
  }
  stopped = () => this.over;
}

let forks = 0;
vi.mock("electron", () => ({
  app: { isPackaged: true },
  utilityProcess: {
    fork: () => {
      forks++;
      return new FakeChild();
    },
  },
}));
vi.mock("node:fs", async (orig) => ({ ...(await orig<typeof import("node:fs")>()), existsSync: () => true }));
const reported = vi.fn();
vi.mock("../runtime/errorReport", () => ({ reportMainError: reported }));
vi.mock("@openmasq/redact", () => ({ extractTimeoutMs: (pages: number) => 6 * 60_000 + pages * 60_000 }));
vi.mock("./extractStream", () => ({ checkStreamMessage: () => null }));
vi.mock("../runtime/quitState", () => ({ isAppQuitting: () => false }));
let sandboxed: (() => FakeChild | null) | null = null;
let jailed = 0;
vi.mock("./extractSandbox", () => ({
  SandboxUnbornError: class SandboxUnbornError extends Error {},
  sandboxedWorker: () => {
    jailed++;
    return sandboxed?.() ?? null;
  },
  sandboxMissing: () => "sandboxed bundle does not match its sealed digest",
}));

const req = { kind: "bytes" as const, data: "", name: "x.pdf", locale: "fr" };
const fileOk = { name: "x.pdf", kind: "pdf", text: "ok", chars: 2 };
const over = { memory: "trop de mémoire", disk: "trop de place" };

async function client() {
  vi.resetModules();
  return import("./extractClient");
}

beforeEach(() => {
  forks = 0;
  jailed = 0;
  sandboxed = null;
  reported.mockClear();
});
afterEach(() => vi.useRealTimers());

describe("a packaged app's document reader, without the system's wall", () => {
  it("no jail here (or a bundle that does not match): the document is refused, never read by a plain process", async () => {
    const { runInWorker, inWorkerOnly } = await client();
    await expect(inWorkerOnly(() => runInWorker(req), "lecteur indisponible")).rejects.toThrow("lecteur indisponible");
    expect(forks).toBe(0);
    // reported with why, once
    expect(String(reported.mock.calls[0]?.[2])).toMatch(/does not match its sealed digest/);
  });

  it("a jail that dies before ready refuses THIS document, and the next one tries the jail again", async () => {
    const { runInWorker, inWorkerOnly, extractIsolation } = await client();
    sandboxed = () => {
      const c = new FakeChild();
      queueMicrotask(() => c.emit("exit", 1));
      return c;
    };
    await expect(inWorkerOnly(() => runInWorker(req), "lecteur indisponible")).rejects.toThrow("lecteur indisponible");
    expect(extractIsolation().sandboxFailed).toBeNull(); // nothing remembered that would downgrade the session
    sandboxed = () => {
      const c = new FakeChild();
      queueMicrotask(() => {
        c.emit("message", { ready: true });
        c.emit("message", { id: 2, ok: true, file: fileOk });
      });
      return c;
    };
    await expect(inWorkerOnly(() => runInWorker(req), "lecteur indisponible")).resolves.toEqual(fileOk);
    expect(jailed).toBe(2);
    expect(forks).toBe(0);
    expect(extractIsolation().isolation).toBe("system");
  });

  it("a jail that is not ready in time is a refusal too", async () => {
    vi.useFakeTimers();
    const { runInWorker, inWorkerOnly } = await client();
    const made: FakeChild[] = [];
    sandboxed = () => {
      made.push(new FakeChild());
      return made[made.length - 1]!;
    };
    const settled = expect(inWorkerOnly(() => runInWorker(req), "lecteur indisponible")).rejects.toThrow("lecteur indisponible");
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    await settled;
    expect(made[0]!.killed).toBe(true);
    expect(forks).toBe(0);
  });
});

describe("what main does with a worker it does not trust", () => {
  const ready = (then: (c: FakeChild) => void) => () => {
    const c = new FakeChild();
    queueMicrotask(() => {
      c.emit("message", { ready: true });
      then(c);
    });
    return c;
  };

  it("stopped for its memory (or its folder): the person is told that, not that the reader is unavailable", async () => {
    const { runInWorker, inWorkerOnly } = await client();
    sandboxed = ready((c) => {
      c.over = "memory";
      c.emit("exit", null);
    });
    await expect(inWorkerOnly(() => runInWorker(req), "lecteur indisponible", over)).rejects.toThrow("trop de mémoire");
    sandboxed = ready((c) => {
      c.over = "disk";
      c.emit("exit", null);
    });
    await expect(inWorkerOnly(() => runInWorker(req), "lecteur indisponible", over)).rejects.toThrow("trop de place");
  });

  it("an answer that is not a document is refused, and a `path` it names is never kept", async () => {
    const { runInWorker } = await client();
    sandboxed = ready((c) => c.emit("message", { id: 1, ok: true, file: { name: "x.pdf", kind: "pdf", text: 42, chars: 2 } }));
    await expect(runInWorker(req)).rejects.toThrow(/refusée/);
    sandboxed = null;
    const again = await client();
    sandboxed = ready((c) => c.emit("message", { id: 1, ok: true, file: { ...fileOk, path: "/etc/passwd", extra: { a: 1 } } }));
    await expect(again.runInWorker(req)).resolves.toEqual(fileOk);
  });

  it("messages nothing asked for, or not messages at all, stop the worker instead of reaching main's handlers", async () => {
    const { runInWorker } = await client();
    let child: FakeChild | null = null;
    sandboxed = ready((c) => {
      child = c;
      c.emit("message", null);
      c.emit("message", "text");
      c.emit("message", { id: 1, progress: null }); // malformed progress for the running job: ignored
      for (let i = 0; i < 40; i++) c.emit("message", { id: 999, ok: true, file: fileOk });
    });
    await expect(runInWorker(req)).rejects.toThrow(/arrêté/);
    expect(child!.killed).toBe(true);
  });
});
