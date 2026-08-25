import { describe, it, expect, vi } from "vitest";
import { connect, createServer } from "node:net";
import { lookup } from "node:dns/promises";
import { startEgressProxy, orderedPublicAddrs, dialFirst } from "./egressProxy";
import { PREAMBLE, buildScript, WHEELS, ALLOW_HOSTS } from "./wheels";
import { DOC_HELPERS } from "./preamble";
import { sanitizeSeedFiles } from "./sandbox";
import { BRAND } from "@openmasq/branding";

const PY = BRAND.slug;

// sandbox.ts (→ runtime.ts, ambientSecrets.ts) imports electron for `app.getPath` —
// mock it so importing `sanitizeSeedFiles` stays a plain offline unit import.
vi.mock("electron", () => ({ app: { getPath: () => "/tmp/openmasq-test-ud" } }));

/**
 * Fast, offline unit tests + a REAL-network reachability block gated behind PYSANDBOX_E2E
 * (real Yahoo Finance tunnels; NOT run in the default suite). The full jailed-runtime path
 * (CPython + a real yfinance DataFrame) is exercised by the standalone diagnostic in the
 * engine report, since it needs Electron's `app`.
 */
const E2E = process.env.PYSANDBOX_E2E === "1";

/** Issue a CONNECT through the proxy; resolve the status code of its reply. */
function connectVia(port: number, target: string, timeoutMs = 3000): Promise<number> {
  return new Promise((resolve, reject) => {
    const sock = connect(port, "127.0.0.1", () => {
      sock.write(`CONNECT ${target} HTTP/1.1\r\nHost: ${target}\r\n\r\n`);
    });
    sock.once("data", (buf) => {
      const m = /^HTTP\/1\.[01]\s+(\d{3})/.exec(buf.toString("latin1"));
      sock.destroy();
      resolve(m ? Number(m[1]) : 0);
    });
    sock.on("error", reject);
    setTimeout(() => {
      sock.destroy();
      reject(new Error("timeout"));
    }, timeoutMs);
  });
}

describe("egress proxy — CONNECT allow-list", () => {
  it("403s a disallowed host AND a private/loopback target even when its name is allow-listed (SSRF pin, audit L5)", async () => {
    // A local dummy TCP server on loopback: even though we allow-list its `127.0.0.1`
    // NAME, the proxy re-resolves the host and REFUSES it because it maps to a private
    // IP — so a DNS-poisoned/allow-listed host can't tunnel to an internal service. This
    // is the CORRECT hardened behavior (an earlier version of this test wrongly expected
    // the loopback tunnel to succeed; that was the vuln the L5 pin closes).
    const upstream = createServer((s) => s.end());
    await new Promise<void>((r) => upstream.listen(0, "127.0.0.1", r));
    const upAddr = upstream.address();
    const upPort = typeof upAddr === "object" && upAddr ? upAddr.port : 0;

    const proxy = await startEgressProxy(["127.0.0.1", "query1.finance.yahoo.com"]);
    try {
      // Loopback target → 403 (private IP refused by the SSRF pin, despite the name allow-list).
      expect(await connectVia(proxy.port, `127.0.0.1:${upPort}`)).toBe(403);
      // Off-allow-list host → 403 (name not permitted).
      expect(await connectVia(proxy.port, "evil.example.com:443")).toBe(403);
    } finally {
      proxy.close();
      upstream.close();
    }
  });

  it("suffix-matches subdomains of an allowed host", async () => {
    const proxy = await startEgressProxy(["yahoo.com"]);
    try {
      // No real upstream, but the allow decision happens BEFORE the upstream dial,
      // and a 403 vs a connection attempt is what we assert here.
      const blocked = await connectVia(proxy.port, "notyahoo.com:443");
      expect(blocked).toBe(403);
    } finally {
      proxy.close();
    }
  });

  it("still 403s an allow-listed host that resolves ONLY to private/LAN IPs (SSRF pin, new multi-addr path)", async () => {
    // The fix resolves ALL addresses and dials them; the L5 pin must hold PER ADDRESS, so a
    // host whose every A/AAAA record is loopback/LAN is still refused (no tunnel to internals).
    const resolver = async () => [
      { address: "127.0.0.1", family: 4 },
      { address: "::1", family: 6 },
      { address: "10.0.0.5", family: 4 },
    ];
    const proxy = await startEgressProxy(["yahoo.com"], resolver);
    try {
      expect(await connectVia(proxy.port, "query1.finance.yahoo.com:443")).toBe(403);
    } finally {
      proxy.close();
    }
  });
});

/**
 * The egress proxy used to pin the tunnel to ONE resolved IP — and `dns.lookup` returns the
 * IPv6 record FIRST for the Yahoo Finance hosts. On a network that advertises IPv6 with no
 * working route, that single-address pin stalled the connect the full ~30 s (`curl (28)
 * Connection timed out`) and every yfinance fetch failed, while the user's own browser — which
 * does Happy Eyeballs — reached Yahoo fine. `orderedPublicAddrs` + `dialFirst` restore that
 * resilience without loosening the SSRF pin.
 */
describe("egress proxy — address selection (Happy-Eyeballs-lite over the L5 pin)", () => {
  it("orders IPv4 before IPv6 and drops every private address", () => {
    const ordered = orderedPublicAddrs([
      { address: "2a00:1288::4001", family: 6 }, // public v6 (what lookup returns first)
      { address: "127.0.0.1", family: 4 }, // loopback — dropped
      { address: "77.238.180.11", family: 4 }, // public v4
      { address: "::1", family: 6 }, // loopback v6 — dropped
      { address: "10.1.2.3", family: 4 }, // LAN — dropped
    ]);
    expect(ordered).toEqual(["77.238.180.11", "2a00:1288::4001"]); // v4 first, publics only
  });

  it("returns [] when every resolved address is private (→ the proxy 403s)", () => {
    expect(orderedPublicAddrs([{ address: "192.168.1.1", family: 4 }, { address: "::1", family: 6 }])).toEqual([]);
  });

  it("dialFirst connects to a reachable address and rejects when none answer", async () => {
    const server = createServer((s) => s.end());
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    try {
      const sock = await dialFirst(["127.0.0.1"], port); // reachable → live socket
      expect(sock.destroyed).toBe(false);
      sock.destroy();
    } finally {
      server.close();
    }
    // Same port after close → nothing listening → every candidate fails → reject.
    await expect(dialFirst(["127.0.0.1"], port)).rejects.toThrow();
  });

  it("dialFirst tries addresses IN ORDER, falling through a refused first one to a reachable later one", async () => {
    // The real bug: the FIRST address (IPv6) was a dead route and the loop gave up on it. Here
    // the server binds ONLY 127.0.0.1, so a connect to 127.0.0.2 on the same port is refused
    // (loopback, no listener there) — dialFirst must not give up on that refusal, it must fall
    // through to 127.0.0.1 and succeed. This exercises the multi-address control flow directly.
    const server = createServer((s) => s.end());
    await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
    const addr = server.address();
    const port = typeof addr === "object" && addr ? addr.port : 0;
    try {
      // 127.0.0.2 has no listener/route here → the connect stalls; with a short per-attempt
      // budget dialFirst abandons it and falls through to 127.0.0.1 (mirrors dead-v6 → v4).
      const sock = await dialFirst(["127.0.0.2", "127.0.0.1"], port, 200);
      expect(sock.destroyed).toBe(false);
      sock.destroy();
    } finally {
      server.close();
    }
  });
});

/**
 * REAL-network e2e (PYSANDBOX_E2E=1). Makes genuine TCP tunnels to Yahoo Finance through the
 * REAL egress proxy — the exact path yfinance takes from the jail. Off by default (network +
 * flakiness); run with `PYSANDBOX_E2E=1 pnpm vitest run apps/desktop/src/main/python/sandbox.test.ts`.
 * The second case is the regression this whole change fixes: a DNS answer with a dead IPv6
 * FIRST used to stall ~30 s (the reported `curl (28)`); the proxy must now fall through to IPv4.
 */
(E2E ? describe : describe.skip)("egress proxy — REAL Yahoo reachability (PYSANDBOX_E2E)", () => {
  it("establishes a real tunnel to query1.finance.yahoo.com", async () => {
    const proxy = await startEgressProxy(ALLOW_HOSTS);
    try {
      expect(await connectVia(proxy.port, "query1.finance.yahoo.com:443", 15_000)).toBe(200);
    } finally {
      proxy.close();
    }
  });

  it("STILL tunnels when DNS returns a dead IPv6 first (the broken-v6 fix, real call)", async () => {
    // Prepend an unroutable RFC-3849 IPv6 to the real records — exactly what a broken-v6 box
    // sees. Old single-IP pin → 30 s hang + total yfinance failure; the fix falls through to v4.
    const resolver = async (host: string) => {
      const real = await lookup(host, { all: true });
      return [{ address: "2001:db8:dead:beef::1", family: 6 }, ...real.filter((a) => a.family === 4)];
    };
    const proxy = await startEgressProxy(ALLOW_HOSTS, resolver);
    try {
      expect(await connectVia(proxy.port, "query1.finance.yahoo.com:443", 15_000)).toBe(200);
    } finally {
      proxy.close();
    }
  });
});

describe("python preamble", () => {
  it("forces the headless Agg backend", () => {
    expect(PREAMBLE).toContain('matplotlib.use("Agg")');
  });
  it("saves every open figure via get_fignums", () => {
    expect(PREAMBLE).toContain("get_fignums()");
    expect(PREAMBLE).toContain("savefig");
    // the figure flusher runs at the end of a script
    const script = buildScript("pass");
    expect(script).toContain("__kv_save_figures()");
  });
  it("splices user code at the injection point", () => {
    const script = buildScript("print('hello from user')");
    expect(script).toContain("print('hello from user')");
    expect(script).not.toContain("# __USER_CODE__");
  });
  it("predefines the robust <slug>_prices yfinance helper for the user code", () => {
    expect(PREAMBLE).toContain(`def ${PY}_prices(`);
    // it must be DEFINED before the user code injection point
    expect(PREAMBLE.indexOf(`def ${PY}_prices(`)).toBeLessThan(PREAMBLE.indexOf("# __USER_CODE__"));
    const script = buildScript(`df = ${PY}_prices('SPY VOO')`);
    expect(script).toContain(`def ${PY}_prices(`);
    expect(script).toContain(`${PY}_prices('SPY VOO')`);
  });
  it("wires ISIN → Yahoo-ticker resolution into <slug>_prices (no ticker guessing)", () => {
    // The resolver must be DEFINED before <slug>_prices, which must CALL it — so the model
    // can pass the ISINs it reads off an article instead of the ~14-round mnemonic guessing.
    expect(PREAMBLE).toContain("def _kv_ticker_for(");
    expect(PREAMBLE).toContain("_yf.Search(");
    expect(PREAMBLE.indexOf("def _kv_ticker_for(")).toBeLessThan(PREAMBLE.indexOf(`def ${PY}_prices(`));
    const body = PREAMBLE.slice(PREAMBLE.indexOf(`def ${PY}_prices(`));
    expect(body).toContain("_kv_ticker_for(");
  });
  it("forces yfinance downloads sequential (no 'database is locked' from the tz cache)", () => {
    // the patched download defaults threads off; applied before the user code
    expect(PREAMBLE).toContain('_k.setdefault("threads", False)');
    expect(PREAMBLE).toContain("_yf0.download = _kv_download");
    expect(PREAMBLE.indexOf("_yf0.download = _kv_download")).toBeLessThan(PREAMBLE.indexOf("# __USER_CODE__"));
  });
  it("surfaces yfinance's swallowed per-ticker errors IN the empty-data exception", () => {
    // yf.download eats failures (proxy 403, HTTP 429…) into yfinance.shared._ERRORS and
    // returns an EMPTY frame — and mcpAgent drops stderr on an exit-0 run. So the true
    // cause must ride the RuntimeError itself, or every network failure reads as the
    // undiagnosable "n'a renvoyé aucune donnée" (the reported symptom).
    expect(PREAMBLE).toContain("import yfinance.shared as _shared");
    expect(PREAMBLE).toContain('getattr(_shared, "_ERRORS", {})');
    expect(PREAMBLE).toContain("cause : ");
    // the enrichment lives INSIDE <slug>_prices, before the user code
    expect(PREAMBLE.indexOf("_ERRORS")).toBeGreaterThan(PREAMBLE.indexOf(`def ${PY}_prices(`));
    expect(PREAMBLE.indexOf("_ERRORS")).toBeLessThan(PREAMBLE.indexOf("# __USER_CODE__"));
  });
  it("normalises a non-standard yfinance period to a start date (2.5y → start=)", () => {
    // guards the "No data retrieved" trap when the model passes an invalid period
    expect(PREAMBLE).toContain("_kv_period_days");
    expect(PREAMBLE).toContain("_KV_PERIODS");
    expect(PREAMBLE).toContain('_k["start"]');
  });
});

describe("branded document helpers (preambleDocs)", () => {
  it("defines <slug>_pdf / <slug>_pptx / <slug>_slide BEFORE the user code", () => {
    const script = buildScript(`doc = ${PY}_pdf('T')`);
    for (const helper of [`def ${PY}_pdf(`, `def ${PY}_pptx(`, `def ${PY}_slide(`]) {
      expect(script).toContain(helper);
      expect(script.indexOf(helper)).toBeLessThan(script.indexOf(`doc = ${PY}_pdf('T')`));
    }
  });
  it("lets a PDF embed a generated CHART, without recursing on its own name", () => {
    // A chart is the whole point of the code interpreter; `<slug>_pdf` had no way to
    // place one, so the model hand-rolled fpdf layout (or dropped the figure).
    expect(DOC_HELPERS).toContain("def image(self, path");
    // The method SHADOWS `FPDF.image` (like `table`) — `self.image(...)` would recurse.
    expect(DOC_HELPERS).toContain("FPDF.image(self,");
    expect(DOC_HELPERS).not.toMatch(/\n\s+self\.image\(/);
  });
  it("imports the document libs LAZILY (an older runtime without python-pptx must not break every run)", () => {
    // No top-level import of fpdf/pptx: they appear only INSIDE function bodies.
    for (const line of DOC_HELPERS.split("\n")) {
      if (/^(from (fpdf|pptx|PIL)|import (fpdf|pptx|PIL))/.test(line)) {
        throw new Error(`top-level document-lib import leaked into the preamble: ${line}`);
      }
    }
  });
});

describe("seed files — main-side sanitization (rule 7: the renderer is untrusted)", () => {
  const b64 = Buffer.from("data").toString("base64");
  it("keeps a plain deliverable and decodes its bytes", () => {
    expect(sanitizeSeedFiles([{ name: "rapport.pdf", base64: b64 }])).toEqual([
      { name: "rapport.pdf", bytes: Buffer.from("data") },
    ]);
  });
  it("drops path traversal, separators, dotfiles and NUL names", () => {
    for (const name of ["../vault.pdf", "a/b.pdf", "a\\b.pdf", ".hidden.pdf", "x\0.pdf"]) {
      expect(sanitizeSeedFiles([{ name, base64: b64 }])).toEqual([]);
    }
  });
  it("only accepts the curated deliverable extensions + .py (seed-only working script)", () => {
    for (const name of ["lib.so", "run.sh", "noext", "x.dylib", "a.exe"]) {
      expect(sanitizeSeedFiles([{ name, base64: b64 }])).toEqual([]);
    }
    expect(sanitizeSeedFiles([{ name: "pres.pptx", base64: b64 }])).toHaveLength(1);
    // The working script seeds back in so the model can exec/iterate on it — but
    // `.py` stays OUT of OUTPUT_MIME: a script the run writes is never delivered.
    expect(sanitizeSeedFiles([{ name: "analyse.py", base64: b64 }])).toHaveLength(1);
  });
  it("bounds count, drops empties and de-dupes, and survives garbage input", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ name: `f${i}.pdf`, base64: b64 }));
    expect(sanitizeSeedFiles(many)).toHaveLength(8);
    expect(sanitizeSeedFiles([{ name: "a.pdf", base64: "" }])).toEqual([]);
    expect(
      sanitizeSeedFiles([
        { name: "a.pdf", base64: b64 },
        { name: "a.pdf", base64: b64 },
      ]),
    ).toHaveLength(1);
    expect(sanitizeSeedFiles("nope")).toEqual([]);
    expect(sanitizeSeedFiles([null, 42, { name: 3, base64: b64 }])).toEqual([]);
  });
});

describe("pinned package set", () => {
  it("includes the required data + plotting stack", () => {
    const names = WHEELS.map((w) => w.split("==")[0]);
    for (const pkg of ["numpy", "pandas", "seaborn", "matplotlib", "yfinance", "requests", "scipy"]) {
      expect(names).toContain(pkg);
    }
  });
  it("includes the deliverable/document generators (PDF, Excel, Word, PowerPoint)", () => {
    const names = WHEELS.map((w) => w.split("==")[0]);
    for (const pkg of ["fpdf2", "openpyxl", "python-docx", "python-pptx"]) {
      expect(names).toContain(pkg);
    }
  });
  it("allow-lists the yahoo finance data + crumb hosts", () => {
    expect(ALLOW_HOSTS).toContain("query1.finance.yahoo.com");
    expect(ALLOW_HOSTS).toContain("query2.finance.yahoo.com");
  });
  it("allow-lists the yfinance cookie/consent hosts (both strategies) so the crumb handshake completes", () => {
    // basic strategy
    expect(ALLOW_HOSTS).toContain("fc.yahoo.com");
    // csrf fallback — without these the cookie+crumb fails → zero data for every ticker
    expect(ALLOW_HOSTS).toContain("guce.yahoo.com");
    expect(ALLOW_HOSTS).toContain("consent.yahoo.com");
  });
});
