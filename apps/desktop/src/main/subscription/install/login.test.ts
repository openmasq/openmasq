// The sign-in relay is only as good as its reading of what the CLIs print; these pin the
// measured outputs (2026-09-05) and the one refusal that matters: a URL off the vendor's
// domain is never handed to the interface to open.
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseClaudeStatus, parseCodexStatus, parseLoginOutput, readLoginStatus, startLogin, stripAnsi } from "./login";

const ESC = String.fromCharCode(27);

describe("parseClaudeStatus", () => {
  it("reads loggedIn, email and the plan from `auth status --json`", () => {
    const out = JSON.stringify({ loggedIn: true, authMethod: "claude.ai", email: "a@b.c", subscriptionType: "max" });
    expect(parseClaudeStatus(out)).toEqual({ loggedIn: true, email: "a@b.c", plan: "max" });
    expect(parseClaudeStatus(JSON.stringify({ loggedIn: false, authMethod: "none" }))).toEqual({ loggedIn: false });
  });
  it("answers null — not false — when the CLI did not answer", () => {
    expect(parseClaudeStatus("")).toEqual({ loggedIn: null });
    expect(parseClaudeStatus("{}")).toEqual({ loggedIn: null });
  });
});

describe("parseCodexStatus", () => {
  it("reads `login status`", () => {
    expect(parseCodexStatus("Logged in using ChatGPT\n")).toEqual({ loggedIn: true });
    // Measured 14/09/2026: codex 0.149 prints this line on STDERR — `readLoginStatus`
    // must feed both streams to this parser, or a signed-in account reads as unknown.
    expect(parseCodexStatus("Not logged in\n")).toEqual({ loggedIn: false });
    expect(parseCodexStatus("")).toEqual({ loggedIn: null });
  });
});

describe("parseLoginOutput", () => {
  it("claude: the sign-in page URL, on claude.com", () => {
    const text = "Opening browser to sign in…\nIf the browser didn't open, visit: https://claude.com/cai/oauth/authorize?code=true&state=x\nPaste code here if prompted > ";
    expect(parseLoginOutput("claude", text)).toEqual({ url: "https://claude.com/cai/oauth/authorize?code=true&state=x" });
  });
  it("codex: the device page and the one-time code, through the ANSI colours", () => {
    const text = `1. Open this link\n   ${ESC}[94mhttps://auth.openai.com/codex/device${ESC}[0m\n\n2. Enter this one-time code\n   ${ESC}[94mVYVS-FZCHL${ESC}[0m\n`;
    expect(parseLoginOutput("codex", text)).toEqual({ url: "https://auth.openai.com/codex/device", code: "VYVS-FZCHL" });
    expect(stripAnsi(`${ESC}[90mx${ESC}[0m`)).toBe("x");
  });
  it("codex: the browser sign-in URL of the default `login`, and no code", () => {
    // Measured 14/09/2026 (0.149.1): the authorize URL, PKCE challenge included, no code.
    const text =
      "Starting local login server on http://localhost:1455.\nIf your browser did not open, navigate to this URL to authenticate:\n\nhttps://auth.openai.com/oauth/authorize?response_type=code&client_id=app_x&redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback&code_challenge=abc&state=s\n";
    expect(parseLoginOutput("codex", text)).toEqual({
      url: "https://auth.openai.com/oauth/authorize?response_type=code&client_id=app_x&redirect_uri=http%3A%2F%2Flocalhost%3A1455%2Fauth%2Fcallback&code_challenge=abc&state=s",
    });
  });
  it("relays no URL that is not on the vendor's domain", () => {
    expect(parseLoginOutput("claude", "visit: https://evil.example/claude.com/x")).toEqual({});
    expect(parseLoginOutput("codex", "https://openai.com.evil.example/device")).toEqual({});
    expect(parseLoginOutput("claude", "nothing here")).toEqual({});
  });
});

describe("readLoginStatus", () => {
  // codex 0.149 answers `login status` on STDERR (measured 14/09/2026). A stand-in binary
  // that does the same is enough to pin that the reader listens to both streams.
  it.skipIf(process.platform === "win32")("reads a status the CLI prints on stderr", async () => {
    const dir = mkdtempSync(join(tmpdir(), "om-login-"));
    const bin = join(dir, "codex");
    writeFileSync(bin, '#!/bin/sh\necho "Logged in using ChatGPT" 1>&2\n');
    chmodSync(bin, 0o755);
    expect(await readLoginStatus("codex", bin, dir)).toEqual({ loggedIn: true });
  });
});

describe("startLogin", () => {
  // codex's `login` prints its authorize URL on STDERR (measured 14/09/2026): a session
  // that listened to stdout alone relayed nothing, and the row showed no page to open.
  it.skipIf(process.platform === "win32")("relays a sign-in URL the CLI prints on stderr", async () => {
    const dir = mkdtempSync(join(tmpdir(), "om-login-"));
    const bin = join(dir, "codex");
    writeFileSync(bin, '#!/bin/sh\necho "navigate to this URL: https://auth.openai.com/oauth/authorize?x=1" 1>&2\n');
    chmodSync(bin, 0o755);
    const events: string[] = [];
    const session = startLogin("codex", bin, dir, (e) => events.push(e.kind === "url" ? e.url : e.kind));
    expect(await session!.done).toEqual({ ok: true });
    expect(events).toEqual(["https://auth.openai.com/oauth/authorize?x=1", "done"]);
  });
});
