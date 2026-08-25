import { createServer, connect, type Socket, type Server } from "node:net";
import { lookup } from "node:dns/promises";
import { isPrivateIp } from "../net/net";

/**
 * A loopback CONNECT-only proxy that constrains where the sandboxed Python may go.
 *
 * The runner sets `HTTPS_PROXY`/`HTTP_PROXY` to this proxy and the OS jail blocks all
 * OTHER outbound sockets, so every network call from `requests`/`yfinance` arrives
 * here as a `CONNECT host:port` tunnel request. We open the upstream tunnel ONLY when
 * `host` is on the allow-list (suffix match) and reply `403` otherwise. It's a pure
 * passthrough (no MITM / no TLS termination), so certificates stay untouched. We
 * parse the CONNECT line off the raw socket (no `http` dep) to stay MITM-free.
 */

export interface EgressProxy {
  port: number;
  close(): void;
}

const IDLE_MS = 30_000; // drop a tunnel with no traffic for this long
const DIAL_MS = 5_000; // per-address connect timeout before falling through to the next

function hostAllowed(host: string, allow: string[]): boolean {
  const h = host.toLowerCase();
  return allow.some((a) => h === a || h.endsWith(`.${a}`));
}

type Addr = { address: string; family: number };
type Resolve = (host: string) => Promise<Addr[]>;

/**
 * Public-only, IPv4-FIRST ordering of the resolved addresses.
 *
 * - **Public-only** keeps the L5 SSRF pin PER ADDRESS: every candidate we may tunnel to is
 *   re-checked, so a host that resolves to a mix of public + loopback/LAN can never be used
 *   to reach the private one.
 * - **IPv4 first** restores Happy-Eyeballs resilience the single-IP pin removed. `dns.lookup`
 *   returns AAAA (IPv6) first for the Yahoo Finance hosts, so pinning ONE address pinned IPv6;
 *   on a network that advertises IPv6 with no working route, the tunnel's `connect()` then hangs
 *   the full ~30 s (curl reports `(28) Connection timed out`) while the user's own browser — which
 *   does Happy Eyeballs — reaches Yahoo fine. Trying v4 before v6, and falling through on a
 *   per-address timeout, makes yfinance work on broken-v6 networks without widening the allow-list.
 */
export function orderedPublicAddrs(addrs: Addr[]): string[] {
  return addrs
    .filter((a) => !isPrivateIp(a.address))
    .sort((a, b) => a.family - b.family) // family 4 before 6
    .map((a) => a.address);
}

/** Connect to the FIRST address that answers within {@link DIAL_MS}, trying them in order
 *  (v4 first). Resolves with the live socket; rejects only if EVERY candidate fails. This is
 *  what turns a dead-IPv6-route from a 30 s stall into a fast fall-through to IPv4. */
export function dialFirst(ips: string[], port: number, perAttemptMs: number = DIAL_MS): Promise<Socket> {
  return new Promise((resolve, reject) => {
    let i = 0;
    const tryNext = () => {
      if (i >= ips.length) {
        reject(new Error("all upstream addresses failed"));
        return;
      }
      const ip = ips[i++];
      const sock = connect(port, ip);
      const timer = setTimeout(() => {
        sock.destroy();
        tryNext();
      }, perAttemptMs);
      sock.once("connect", () => {
        clearTimeout(timer);
        resolve(sock);
      });
      sock.once("error", () => {
        clearTimeout(timer);
        tryNext();
      });
    };
    tryNext();
  });
}

/** Wire two sockets together, tearing both down on end/error/idle. */
function pipeTunnel(a: Socket, b: Socket): void {
  const done = () => {
    a.destroy();
    b.destroy();
  };
  a.setTimeout(IDLE_MS, done);
  b.setTimeout(IDLE_MS, done);
  a.on("error", done).on("close", done);
  b.on("error", done).on("close", done);
  a.pipe(b);
  b.pipe(a);
}

/** Start the proxy on 127.0.0.1:0. Only `CONNECT host:port` is honored; anything
 *  else (plain HTTP) gets 400 — the sandbox only ever needs HTTPS tunnels. */
export function startEgressProxy(
  allowHosts: string[],
  resolveAll: Resolve = (host) => lookup(host, { all: true }),
): Promise<EgressProxy> {
  return new Promise((resolve, reject) => {
    const server: Server = createServer((client: Socket) => {
      client.setNoDelay(true);
      client.once("data", async (buf) => {
        const line = buf.toString("latin1").split("\r\n", 1)[0] ?? "";
        const m = /^CONNECT\s+([^\s:]+):(\d+)\s+HTTP\/1\.[01]$/i.exec(line);
        if (!m) {
          client.end("HTTP/1.1 400 Bad Request\r\n\r\n");
          return;
        }
        const [, host, portStr] = m;
        if (!hostAllowed(host, allowHosts)) {
          client.end("HTTP/1.1 403 Forbidden\r\n\r\nblocked by the app egress policy");
          return;
        }
        // Re-validate the RESOLVED upstream IPs are public and PIN the tunnel to one (audit
        // L5): the allow-list is a HOSTNAME suffix match, so a DNS mishap/poisoning that
        // maps an allow-listed host to loopback/LAN would otherwise be tunneled straight
        // through. Resolve ALL addresses, DROP every private one (the pin holds per address),
        // and dial them v4-first with a per-address timeout (`orderedPublicAddrs`/`dialFirst`)
        // — connecting to a verified public IP (transparent tunnel → TLS SNI/cert validation
        // still done by the client inside), but no longer stalling ~30 s on a single dead
        // IPv6 route the way a one-address pin did.
        let ips: string[];
        try {
          ips = orderedPublicAddrs(await resolveAll(host));
        } catch {
          client.end("HTTP/1.1 502 Bad Gateway\r\n\r\ndns resolution failed");
          return;
        }
        if (!ips.length) {
          // Every resolved address was private/LAN (or none resolved) — refuse, same
          // fail-closed outcome as the old single-private-IP branch.
          client.end("HTTP/1.1 403 Forbidden\r\n\r\nblocked by the app egress policy");
          return;
        }
        if (client.destroyed) return; // client hung up during the async resolve
        let upstream: Socket;
        try {
          upstream = await dialFirst(ips, Number(portStr));
        } catch {
          client.end("HTTP/1.1 502 Bad Gateway\r\n\r\nupstream connect failed");
          return;
        }
        if (client.destroyed) {
          upstream.destroy();
          return;
        }
        client.write("HTTP/1.1 200 Connection Established\r\n\r\n");
        pipeTunnel(client, upstream);
      });
      client.on("error", () => client.destroy());
    });

    server.on("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      const port = typeof addr === "object" && addr ? addr.port : 0;
      resolve({ port, close: () => server.close() });
    });
  });
}
