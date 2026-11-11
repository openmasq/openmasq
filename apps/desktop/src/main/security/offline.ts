import childProcess from "node:child_process";
import dgram from "node:dgram";
import dns from "node:dns";
import http from "node:http";
import http2 from "node:http2";
import https from "node:https";
import net from "node:net";
import tls from "node:tls";

/**
 * Imported FIRST by a worker that parses what a user attaches (`../ocr/extractWorker.ts`): when
 * its parent says so (`OPENMASQ_OFFLINE=1`, a packaged app, whose OCR assets are baked and
 * pinned), the network and other programs are cut before any parser loads. Such a worker reads
 * the bytes it is handed and answers its parent; nothing in it has a reason to open a connection
 * or start a program, so a crafted file that takes over a parser finds neither.
 *
 * This holds against JavaScript. Against native code (the canvas, the inference runtime), only
 * an OS sandbox holds; this is the layer beneath it, never a substitute.
 */
const DNS = ["lookup", "lookupService", "resolve", "resolve4", "resolve6", "resolveAny", "resolveCaa", "resolveCname", "resolveMx", "resolveNaptr", "resolveNs", "resolvePtr", "resolveSoa", "resolveSrv", "resolveTxt", "reverse"];
const RESOLVER = DNS.filter((n) => n !== "lookup" && n !== "lookupService");

export function cutOffline(): void {
  const refuse = (what: string) => () => {
    throw new Error(`${what} is off in this process`);
  };
  globalThis.fetch = (() => Promise.reject(new Error("network is off in this process"))) as typeof fetch;
  const cut = (target: object, names: string[], what: string) => {
    for (const name of names) Object.defineProperty(target, name, { value: refuse(what), writable: false, configurable: false });
  };
  cut(net, ["connect", "createConnection", "createServer"], "network");
  // the same through the classes themselves (`new net.Socket().connect()`, `new net.Server().listen()`):
  // every connection Node opens (http, https, http2, tls) ends in these, whatever built the socket.
  // A worker's own channel to its parent is a pipe it was BORN with (stdio, the message port): no `connect`.
  cut(net.Socket.prototype, ["connect"], "network");
  cut(net.Server.prototype, ["listen"], "network");
  cut(tls, ["connect", "createServer"], "network");
  cut(http, ["request", "get", "createServer"], "network");
  cut(https, ["request", "get", "createServer"], "network");
  cut(http2, ["connect", "createServer", "createSecureServer"], "network");
  cut(dgram, ["createSocket"], "network");
  cut(dgram.Socket.prototype, ["bind", "connect", "send"], "network");
  // a name looked up is a message sent (to whoever answers for that name): every way of asking
  cut(dns, DNS, "network");
  cut(dns.promises, DNS, "network");
  cut(dns.Resolver.prototype, RESOLVER, "network");
  cut(dns.promises.Resolver.prototype, RESOLVER, "network");
  cut(childProcess, ["spawn", "spawnSync", "exec", "execSync", "execFile", "execFileSync", "fork"], "starting a program");
}

if (process.env.OPENMASQ_OFFLINE === "1") cutOffline();
