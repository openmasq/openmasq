import { describe, expect, it } from "vitest";
import { hostOf, isLoopbackHost, isLoopbackOrigin, loopbackOnly } from "./localOnly";

const run = (headers: Record<string, string | undefined>, bound = "127.0.0.1") => {
  let status = 0;
  let passed = false;
  const req = { headers } as never as Parameters<ReturnType<typeof loopbackOnly>>[0];
  const res = {
    status(code: number) {
      status = code;
      return this;
    },
    end() {},
  } as never as Parameters<ReturnType<typeof loopbackOnly>>[1];
  loopbackOnly(bound)(req, res, () => {
    passed = true;
  });
  return { status, passed };
};

describe("only a caller that addressed us by a loopback name is served", () => {
  it("splits a host line from its port, IPv6 literal included", () => {
    expect(hostOf("127.0.0.1:8787")).toBe("127.0.0.1");
    expect(hostOf("localhost")).toBe("localhost");
    expect(hostOf("[::1]:8787")).toBe("[::1]");
    expect(hostOf("Attacker.Example:80")).toBe("attacker.example");
  });

  it("lets the loopback names through, on any port", () => {
    for (const host of ["127.0.0.1:8787", "localhost:8787", "localhost", "[::1]:8787", "127.0.0.1"])
      expect(run({ host }).passed, host).toBe(true);
  });

  it("refuses a foreign Host — the DNS-rebinding shape — with no body to describe", () => {
    for (const host of ["attacker.example", "attacker.example:8787", "192.168.1.9:8787"]) {
      const r = run({ host });
      expect(r.passed, host).toBe(false);
      expect(r.status).toBe(403);
    }
  });

  it("refuses a request with NO Host at all — fail closed", () => {
    expect(run({}).passed).toBe(false);
    expect(run({}).status).toBe(403);
  });

  it("refuses a cross-origin caller, and keeps the console's own origin", () => {
    expect(run({ host: "127.0.0.1:8787", origin: "https://evil.test" }).passed).toBe(false);
    expect(run({ host: "127.0.0.1:8787", origin: "null" }).passed).toBe(false);
    // The console page is served from this very origin; its fetches must go through.
    expect(run({ host: "127.0.0.1:8787", origin: "http://127.0.0.1:8787" }).passed).toBe(true);
    expect(run({ host: "localhost:8787", origin: "http://localhost:8787" }).passed).toBe(true);
    // A CLI sends none at all.
    expect(run({ host: "127.0.0.1:8787" }).passed).toBe(true);
  });

  it("accepts the address the server was actually bound to", () => {
    expect(isLoopbackHost("10.1.2.3:8787", "10.1.2.3")).toBe(true);
    expect(isLoopbackHost("10.1.2.3:8787", "127.0.0.1")).toBe(false);
    expect(isLoopbackOrigin("http://localhost:8787", "127.0.0.1")).toBe(true);
    expect(isLoopbackOrigin("file://", "127.0.0.1")).toBe(false);
    expect(isLoopbackOrigin("not a url", "127.0.0.1")).toBe(false);
  });
});
