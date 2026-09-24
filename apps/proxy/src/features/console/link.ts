// The console's address, on disk WHILE the proxy runs — so `openmasq-proxy console` can open
// the live view at any moment, from any terminal, whatever tool owns the screen (`open.ts`).
//
// It is the token that is written, so the file lives where the proxy's other secrets live:
// `~/.openmasq/console.url`, 0600 in a 0700 directory, beside the key and the credential
// store. That is the boundary the token was minted for anyway — loopback is reachable by
// every process on the machine and by a page in a browser, and the token is what tells the
// operator's request from theirs; a process running as the operator already holds the key
// file. Written on listen, removed on exit — and only OUR link is removed: a proxy started
// later on another port has replaced it, and its address is not ours to withdraw.
import { chmodSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { openmasqDir } from "../../lib/stateDir.js";

export const consoleLinkPath = (dir = openmasqDir()): string => join(dir, "console.url");

/** What a link has to look like to be followed: LOOPBACK (the only place the proxy ever
 *  listens), our own route, a token, nothing else. A file this command hands to a browser
 *  is not a file it trusts blindly. */
const LINK =
  /^http:\/\/(?:127\.0\.0\.1|localhost|\[::1\])(?::\d{1,5})?\/console\?t=[A-Za-z0-9_-]+$/;

/** Publish `url`; returns the function that withdraws it. */
export function publishConsoleLink(url: string, path = consoleLinkPath()): () => void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  writeFileSync(path, `${url}\n`, { mode: 0o600 });
  try {
    chmodSync(path, 0o600); // an existing file keeps its old mode without this
  } catch {
    // A filesystem with no permission model: the directory's ACL is what protects it.
  }
  return () => {
    if (readConsoleLink(path) === url) withdrawConsoleLink(path);
  };
}

export function readConsoleLink(path = consoleLinkPath()): string | undefined {
  try {
    const line = readFileSync(path, "utf8").trim();
    return LINK.test(line) ? line : undefined;
  } catch {
    return undefined;
  }
}

export function withdrawConsoleLink(path = consoleLinkPath()): void {
  try {
    unlinkSync(path);
  } catch {
    // Already gone: the state we wanted.
  }
}
