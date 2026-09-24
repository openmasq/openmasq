import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { publishConsoleLink, readConsoleLink, withdrawConsoleLink } from "./link";

const URL_A = "http://127.0.0.1:8787/console?t=J4JYXzkIDj2v-p7mRF5p9g";
const URL_B = "http://127.0.0.1:8788/console?t=another-token_here";
const dirs: string[] = [];
const fresh = () => {
  const d = mkdtempSync(join(tmpdir(), "openmasq-link-"));
  dirs.push(d);
  return join(d, "state", "console.url");
};
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true });
});

describe("the console link on disk", () => {
  it("is written 0600 in a directory it creates, and read back as it was published", () => {
    const path = fresh();
    publishConsoleLink(URL_A, path);
    expect(readConsoleLink(path)).toBe(URL_A);
    if (process.platform !== "win32") expect(statSync(path).mode & 0o777).toBe(0o600);
  });

  it("is withdrawn by the proxy that wrote it — and left alone when another replaced it", () => {
    const path = fresh();
    const withdrawA = publishConsoleLink(URL_A, path);
    publishConsoleLink(URL_B, path);
    // The first proxy exits: the second's address stays, since it is not the first's to remove.
    withdrawA();
    expect(readConsoleLink(path)).toBe(URL_B);
    withdrawConsoleLink(path);
    expect(readConsoleLink(path)).toBeUndefined();
    withdrawConsoleLink(path); // already gone: the state we wanted, not an error
  });

  it("follows only a link shaped like our own route — a file is not trusted blindly", () => {
    const path = fresh();
    mkdirSync(dirname(path), { recursive: true });
    for (const bad of [
      "http://evil.example/console?t=abc", // not loopback: the proxy never listens there
      "javascript:alert(1)",
      "http://127.0.0.1:8787/other?t=a",
      "",
    ]) {
      writeFileSync(path, `${bad}\n`);
      expect(readConsoleLink(path), bad).toBeUndefined();
    }
    writeFileSync(path, `${URL_A}\n`);
    expect(readConsoleLink(path)).toBe(URL_A);
    expect(readFileSync(path, "utf8")).toContain(URL_A);
  });
});
