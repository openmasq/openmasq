import { createServer, type Server, type IncomingMessage } from "node:http";
import { randomBytes } from "node:crypto";
import type { Duplex } from "node:stream";
import { WebSocketServer, WebSocket } from "ws";

// ── CDP-over-pipe → gated-loopback-ws broker ─────────────────────────────────
// SECURITY: CDP on a TCP port has NO authentication and its `/json/version` is
// reachable by any same-user local process (port-scan). To close that, the agent
// child runs Electron with `--remote-debugging-pipe` (CDP over inherited fds 3/4 —
// NO TCP port, unreachable by other processes). But @playwright/mcp only connects
// to a TCP URL, so THIS broker (in the parent) exposes ONE ws endpoint gated by a
// random secret in the path and relays raw CDP messages between that ws and the
// pipe. A scanner that hits `/json/version` without the secret gets 404 and never
// touches the pipe. The secret only ever travels to @playwright/mcp via an env var
// (never argv), so it isn't in `ps`/cmdline.

export interface CdpBroker {
  /** The CDP endpoint URL to hand @playwright/mcp — carries the secret path. */
  endpoint: string;
  close(): void;
}

/**
 * Verify CDP actually flows through the broker → pipe → browser, by issuing one
 * `Browser.getVersion` over the ws and awaiting the reply. Rejects on timeout — so
 * the caller can fall back to the TCP-port transport if Electron didn't honour
 * `--remote-debugging-pipe` (the failure would otherwise only surface LATER, when
 * @playwright/mcp can't connect, with no fallback). Runs before @playwright/mcp
 * connects, so it transiently occupies the broker's single ws slot then releases it.
 */
export function probeCdpPipe(endpoint: string, timeoutMs = 4000): Promise<void> {
  const wsUrl = endpoint.replace(/^http/, "ws") + "/devtools/browser";
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(wsUrl);
    const done = (err?: Error) => {
      clearTimeout(timer);
      try {
        ws.close();
      } catch {
        /* noop */
      }
      err ? reject(err) : resolve();
    };
    const timer = setTimeout(() => done(new Error("cdp pipe probe timeout")), timeoutMs);
    ws.on("open", () => ws.send(JSON.stringify({ id: 1, method: "Browser.getVersion" })));
    ws.on("message", (data: Buffer) => {
      try {
        if (JSON.parse(data.toString("utf8"))?.id === 1) done();
      } catch {
        /* ignore non-JSON frames */
      }
    });
    ws.on("error", (e) => done(e instanceof Error ? e : new Error(String(e))));
  });
}

/**
 * Front an Electron `--remote-debugging-pipe` channel with a secret-gated loopback
 * ws endpoint. Chromium reads commands from fd 3 and writes events to fd 4, framed
 * as NUL-delimited JSON — so the parent WRITES to `pipeWrite` (child fd 3) and READS
 * from `pipeRead` (child fd 4).
 *
 * @param pipeWrite     stream the browser reads commands from (child stdio[3])
 * @param pipeRead      stream the browser writes events to  (child stdio[4])
 * @param browserLabel  the `Browser` string for `/json/version` (e.g. "Chrome/128…")
 */
export function startCdpBroker(
  pipeWrite: NodeJS.WritableStream,
  pipeRead: NodeJS.ReadableStream,
  browserLabel: string,
): Promise<CdpBroker> {
  const secret = randomBytes(18).toString("hex");
  const base = `/${secret}`;
  const wss = new WebSocketServer({ noServer: true });
  let live: WebSocket | null = null;
  let boundPort = 0;

  // pipe → ws: fd 4 output is NUL-delimited JSON. Accumulate BYTES (a multi-byte
  // UTF-8 char can straddle a chunk boundary) and only decode a COMPLETE message.
  let acc: Buffer = Buffer.alloc(0);
  pipeRead.on("data", (chunk: Buffer) => {
    acc = acc.length ? Buffer.concat([acc, chunk]) : chunk;
    let idx: number;
    while ((idx = acc.indexOf(0)) >= 0) {
      const msg = acc.subarray(0, idx).toString("utf8");
      acc = acc.subarray(idx + 1);
      if (msg && live && live.readyState === WebSocket.OPEN) live.send(msg);
    }
  });

  const server: Server = createServer((req, res) => {
    // ONLY the secret-pathed /json/version is answered; a scanner hitting an
    // un-secreted /json/version (or anything else) gets 404 and learns nothing.
    // Tolerate a TRAILING SLASH: playwright-core (via @playwright/mcp) requests
    // `${base}/json/version/` — an exact `=== ${base}/json/version` match 404s it,
    // and connectOverCDP then fails with "does not look like a DevTools server",
    // so the agent browser can't be piloted at all (the CDP-hardening regression).
    const path = (req.url ?? "").replace(/\/$/, "");
    if (req.method === "GET" && path === `${base}/json/version`) {
      const body = JSON.stringify({
        Browser: browserLabel,
        "Protocol-Version": "1.3",
        webSocketDebuggerUrl: `ws://127.0.0.1:${boundPort}${base}/devtools/browser`,
      });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(body);
      return;
    }
    res.writeHead(404);
    res.end();
  });

  server.on("upgrade", (req: IncomingMessage, socket: Duplex, head: Buffer) => {
    if ((req.url ?? "").replace(/\/$/, "") !== `${base}/devtools/browser`) {
      socket.destroy();
      return;
    }
    wss.handleUpgrade(req, socket, head, (ws) => {
      // Single consumer: a reconnect replaces the previous socket.
      if (live) {
        try {
          live.close();
        } catch {
          /* noop */
        }
      }
      live = ws;
      ws.on("message", (data: Buffer) => {
        // ws → pipe: forward the raw CDP command, NUL-terminated (fd 3).
        pipeWrite.write(data.toString("utf8"));
        pipeWrite.write("\0");
      });
      ws.on("close", () => {
        if (live === ws) live = null;
      });
    });
  });

  return new Promise<CdpBroker>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      boundPort = typeof addr === "object" && addr ? addr.port : 0;
      if (!boundPort) {
        reject(new Error("cdp broker: no bound port"));
        return;
      }
      resolve({
        endpoint: `http://127.0.0.1:${boundPort}${base}`,
        close() {
          try {
            live?.close();
          } catch {
            /* noop */
          }
          try {
            wss.close();
          } catch {
            /* noop */
          }
          try {
            server.close();
          } catch {
            /* noop */
          }
        },
      });
    });
  });
}
