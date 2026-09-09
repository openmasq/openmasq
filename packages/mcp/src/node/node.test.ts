import { existsSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { startLoopback } from "./loopback";
import { McpOAuthStore } from "./oauthStore";
import { decrypt, encrypt, loadKey, SecretJsonFile } from "./secretFile";

const dir = (): string => mkdtempSync(join(tmpdir(), "openmasq-node-test-"));

describe("at rest", () => {
  it("round-trips, and the ciphertext does not carry the plaintext", () => {
    const key = loadKey(dir());
    const secret = JSON.stringify({ access_token: "ya29.a-real-looking-token" });
    const blob = encrypt(secret, key);
    expect(blob).not.toContain("a-real-looking-token");
    expect(decrypt(blob, key)).toBe(secret);
  });

  it.skipIf(process.platform === "win32")(
    "writes the key file 0600 and reuses it across runs",
    () => {
      const d = dir();
      const first = loadKey(d);
      expect(statSync(join(d, "key")).mode & 0o777).toBe(0o600);
      expect(loadKey(d).equals(first)).toBe(true);
    },
  );

  it.skipIf(process.platform === "win32")(
    "closes the directory too — the file NAMES say which services this machine holds",
    () => {
      const d = dir();
      loadKey(d);
      expect(statSync(d).mode & 0o777).toBe(0o700);
    },
  );

  it("writes no key file at all when the key comes from the environment", () => {
    const d = dir();
    const key = loadKey(d, Buffer.alloc(32, 7).toString("base64"));
    expect(key.length).toBe(32);
    expect(existsSync(join(d, "key"))).toBe(false);
  });

  it("refuses a tampered blob rather than reading it as empty", () => {
    const key = loadKey(dir());
    const blob = encrypt("secret", key);
    const cut = `${blob.slice(0, -6)}AAAAAA`;
    expect(() => decrypt(cut, key)).toThrow();
  });

  it.skipIf(process.platform === "win32")(
    "keeps the store file 0600 too — it holds the tokens",
    () => {
      const d = dir();
      const path = join(d, "s.enc");
      const file = new SecretJsonFile<{ a: string }>(path, d);
      file.write({ a: "1" });
      expect(statSync(path).mode & 0o777).toBe(0o600);
      expect(readFileSync(path, "utf8")).not.toContain('"a"');
      expect(file.read()).toEqual({ a: "1" });
    },
  );

  it("reads an absent store as nothing, not as an error", () => {
    const d = dir();
    expect(new SecretJsonFile<{ a: string }>(join(d, "none.enc"), d).read()).toBeUndefined();
  });
});

describe("the OAuth store", () => {
  it("remembers tokens and the port they were registered against, across instances", () => {
    const d = dir();
    const store = new McpOAuthStore(d);
    expect(store.isAuthorized("notion")).toBe(false);
    store.saveOAuth("notion", { tokens: { access_token: "t", token_type: "bearer" } });
    store.savePort("notion", 51234);

    const reopened = new McpOAuthStore(d);
    expect(reopened.isAuthorized("notion")).toBe(true);
    expect(reopened.loadPort("notion")).toBe(51234);
    expect(reopened.ids()).toEqual(["notion"]);
  });

  it("forgets one server whole — the port goes with the tokens", () => {
    const d = dir();
    const store = new McpOAuthStore(d);
    store.saveOAuth("notion", { tokens: { access_token: "t", token_type: "bearer" } });
    store.savePort("notion", 51234);
    expect(store.forget("notion")).toBe(true);
    expect(store.forget("notion")).toBe(false);
    expect(new McpOAuthStore(d).loadPort("notion")).toBeUndefined();
  });
});

describe("the loopback redirect catcher", () => {
  const hit = (port: number, query: string): Promise<number> =>
    fetch(`http://127.0.0.1:${port}/callback?${query}`).then((r) => r.status);

  it("settles NOTHING for a callback that does not echo this attempt's state", async () => {
    const loop = await startLoopback({ page: "ok" });
    expect(await hit(loop.port, "code=stolen&state=guessed")).toBe(404);
    // Still pending: the wait times out rather than resolving with the planted code.
    await expect(loop.waitForCode(60)).rejects.toThrow(/not completed in time/);
    loop.close();
  });

  it("resolves with the code when the state matches", async () => {
    const loop = await startLoopback({ page: "ok" });
    const waiting = loop.waitForCode(2000);
    expect(await hit(loop.port, `code=abc123&state=${loop.state}`)).toBe(200);
    expect(await waiting).toBe("abc123");
    loop.close();
  });

  it("carries the provider's own explanation when it refuses", async () => {
    const loop = await startLoopback({ page: "ok" });
    const waiting = loop.waitForCode(2000);
    await hit(loop.port, `error=access_denied&error_description=AADSTS65004&state=${loop.state}`);
    await expect(waiting).rejects.toThrow(/AADSTS65004/);
    loop.close();
  });

  it("gives every attempt a different state", async () => {
    const a = await startLoopback({ page: "ok" });
    const b = await startLoopback({ page: "ok" });
    expect(a.state).not.toBe(b.state);
    a.close();
    b.close();
  });
});
