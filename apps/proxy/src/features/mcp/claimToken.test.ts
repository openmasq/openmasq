import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { claimToken, endpointToken } from "./endpointToken";

/** Two proxies started together must end up with ONE endpoint token: a client configured with
 *  the first would otherwise be refused by the second. */
const dirs: string[] = [];
const dir = () => {
  const d = mkdtempSync(join(tmpdir(), "omq-token-"));
  dirs.push(d);
  return d;
};
afterEach(() => dirs.splice(0).forEach((d) => rmSync(d, { recursive: true, force: true })));

const A = "A".repeat(43);
const B = "B".repeat(43);

describe("the endpoint token is created once", () => {
  it("the first claim lands; a later one reads the token in force", () => {
    const p = join(dir(), "mcp.token");
    expect(claimToken(p, A)).toBe(A);
    expect(claimToken(p, B)).toBe(A);
    expect(readFileSync(p, "utf8").trim()).toBe(A);
  });

  it("a file there that is not a token is replaced by endpointToken, never used", () => {
    const d = dir();
    writeFileSync(join(d, "mcp.token"), "short\n");
    expect(claimToken(join(d, "mcp.token"), A)).toBeNull();
    const t = endpointToken(d);
    expect(t).toMatch(/^[A-Za-z0-9_-]{32,}$/);
    expect(endpointToken(d)).toBe(t);
  });
});
