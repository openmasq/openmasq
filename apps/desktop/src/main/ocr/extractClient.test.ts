import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Main never parses a file: a worker that cannot be born refuses the document (fail closed).
 * A job the FILE made fail (crash, OOM, stall) leaves that file in error and the worker path
 * in place; a stalled job is killed, so the next file gets a fresh worker instead of queueing
 * behind it.
 */

class FakeChild extends EventEmitter {
  posted: unknown[] = [];
  killed = false;
  stderr = null;
  postMessage(m: unknown) {
    this.posted.push(m);
  }
  kill() {
    this.killed = true;
    return true;
  }
}

const children: FakeChild[] = [];
let onFork: (c: FakeChild) => void = () => {};

vi.mock("electron", () => ({
  app: { isPackaged: false },
  utilityProcess: {
    fork: () => {
      const c = new FakeChild();
      children.push(c);
      onFork(c);
      return c;
    },
  },
}));
vi.mock("node:fs", async (orig) => ({ ...(await orig<typeof import("node:fs")>()), existsSync: () => true }));
vi.mock("../runtime/errorReport", () => ({ reportMainError: vi.fn() }));
vi.mock("@openmasq/redact", () => ({ extractTimeoutMs: (pages: number) => 6 * 60_000 + pages * 60_000 }));
vi.mock("./extractStream", () => ({ checkStreamMessage: () => null }));
vi.mock("../runtime/quitState", () => ({ isAppQuitting: () => false }));
// the system's jail (`extractSandbox.ts`): absent here, unless a test hands one over
let sandboxed: (() => unknown) | null = null;
vi.mock("./extractSandbox", () => ({ SandboxUnbornError: class SandboxUnbornError extends Error {}, sandboxedWorker: () => sandboxed?.() ?? null }));

const req = { kind: "bytes" as const, data: "", name: "x.xlsx", locale: "fr" };
const fileOk = { name: "x.xlsx", kind: "xlsx", text: "ok", chars: 2 };

async function client() {
  vi.resetModules();
  return import("./extractClient");
}

beforeEach(() => {
  children.length = 0;
  onFork = () => {};
  sandboxed = null;
});
afterEach(() => vi.useRealTimers());

describe("documents are parsed in the worker only", () => {
  it("a worker that dies DURING a job (after ready) fails the file, and the next file gets a new worker", async () => {
    const { runInWorker, inWorkerOnly } = await client();
    onFork = (c) => {
      queueMicrotask(() => {
        c.emit("message", { ready: true });
        c.emit("exit", 9); // the file crashed it
      });
    };
    await expect(inWorkerOnly(() => runInWorker(req), "indisponible")).rejects.toThrow(/arrêté/);
    onFork = (c) => {
      queueMicrotask(() => {
        c.emit("message", { ready: true });
        c.emit("message", { id: 2, ok: true, file: fileOk });
      });
    };
    await expect(inWorkerOnly(() => runInWorker(req), "indisponible")).resolves.toEqual(fileOk);
    expect(children).toHaveLength(2);
  });

  it("a job that answers an error is the file's error", async () => {
    const { runInWorker, inWorkerOnly } = await client();
    onFork = (c) => {
      queueMicrotask(() => {
        c.emit("message", { ready: true });
        c.emit("message", { id: 1, ok: false, error: "out of memory" });
      });
    };
    await expect(inWorkerOnly(() => runInWorker(req), "indisponible")).rejects.toThrow(/out of memory/);
  });

  it("a child that exits BEFORE ready refuses the document: main never reads it instead", async () => {
    const { runInWorker, inWorkerOnly } = await client();
    onFork = (c) => queueMicrotask(() => c.emit("exit", 1));
    await expect(inWorkerOnly(() => runInWorker(req), "lecteur indisponible")).rejects.toThrow("lecteur indisponible");
    // and again for the next file: no session-wide switch to another route
    await expect(inWorkerOnly(() => runInWorker(req), "lecteur indisponible")).rejects.toThrow("lecteur indisponible");
    expect(children).toHaveLength(2);
  });

  it("main does not load the document parsers at all", async () => {
    const { readFileSync } = await vi.importActual<typeof import("node:fs")>("node:fs");
    const jobs = readFileSync(new URL("./extractJobs.ts", import.meta.url), "utf8");
    expect(jobs).not.toMatch(/import\s*\{[^}]*\bextract(Text|Bytes)\b[^}]*\}\s*from\s*"@openmasq\/redact\/documents"/);
    expect(jobs).not.toMatch(/import\s*\{[^}]*\bscrubInPlace\b[^}]*\}\s*from\s*"\.\/inplaceScrub"/);
  });
});

describe("a job past its deadline is killed with its worker", () => {
  it("rejects, kills the spinning child, and the next job forks a fresh one", async () => {
    vi.useFakeTimers();
    const { runInWorker } = await client();
    onFork = (c) => queueMicrotask(() => c.emit("message", { ready: true }));
    const stuck = runInWorker(req);
    const settled = expect(stuck).rejects.toThrow(/délai dépassé/);
    await vi.advanceTimersByTimeAsync(60 * 60_000);
    await settled;
    expect(children[0]!.killed).toBe(true);
    void runInWorker(req).catch(() => {});
    expect(children).toHaveLength(2);
  });
});

describe("a worker the system's jail cannot start", () => {
  it("is tried once, then the job runs on the utilityProcess, for the rest of the session", async () => {
    const { runInWorker, extractIsolation } = await client();
    let jailed = 0;
    sandboxed = () => {
      jailed++;
      const c = new FakeChild();
      queueMicrotask(() => c.emit("exit", 1));
      return c;
    };
    onFork = (c) => {
      queueMicrotask(() => {
        c.emit("message", { ready: true });
        c.emit("message", { id: 2, ok: true, file: fileOk });
      });
    };
    await expect(runInWorker(req)).resolves.toEqual(fileOk);
    expect(jailed).toBe(1);
    expect(children).toHaveLength(1);
    expect(extractIsolation().isolation).toBe("process");
    expect(extractIsolation().sandboxFailed).toMatch(/code 1/);
  });

  it("runs the job shut in when it starts", async () => {
    const { runInWorker, extractIsolation } = await client();
    sandboxed = () => {
      const c = new FakeChild();
      queueMicrotask(() => {
        c.emit("message", { ready: true });
        c.emit("message", { id: 1, ok: true, file: fileOk });
      });
      return c;
    };
    await expect(runInWorker(req)).resolves.toEqual(fileOk);
    expect(children).toHaveLength(0);
    expect(extractIsolation().isolation).toBe("system");
  });

  it("retires the worker after a job it answered `recycle` (a workbook), and keeps it otherwise", async () => {
    const { runInWorker } = await client();
    let next = 1;
    onFork = (c) => {
      queueMicrotask(() => c.emit("message", { ready: true }));
      c.postMessage = (m: unknown) => {
        c.posted.push(m);
        const id = (m as { id: number }).id;
        const workbook = (m as { name?: string }).name?.endsWith(".xlsx");
        queueMicrotask(() => c.emit("message", { id, ok: true, file: fileOk, ...(workbook ? { recycle: true } : {}) }));
      };
      next++;
    };
    const pdf = { kind: "bytes" as const, data: "", name: "x.pdf", locale: "fr" };
    await runInWorker(pdf);
    await runInWorker(pdf);
    expect(children).toHaveLength(1); // a PDF leaves the worker in place
    await runInWorker(req); // x.xlsx → recycle
    expect(children[0].killed).toBe(true);
    await runInWorker(pdf);
    expect(children).toHaveLength(2); // the next document gets a fresh worker
    expect(children[1].killed).toBe(false);
    expect(next).toBe(3);
  });
});

