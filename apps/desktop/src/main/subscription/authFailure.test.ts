// The table of what each CLI prints when its OWN session is gone — and of what it prints
// for everything else, which must keep its own path (a quota is not « sign in again »).
import { chmodSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { cliAuthOf } from "@openmasq/llm";
import { describe, expect, it } from "vitest";
import { ANTIGRAVITY_EMPTY_TURN } from "./antigravityStream";
import { cliAuthFailureLine } from "./authFailure";
import { cliFailure, streamCliProcess, type CliAction, type SubscriptionCliError } from "./spawnStream";
import { interpretClaudeEvent } from "./claudeStream";
import { interpretCodexEvent } from "./codexStream";
import { cliToolGateMessage } from "./toolGate";
import type { SubscriptionCliId } from "./resolveCli";

const POSITIVE: Record<SubscriptionCliId, string[]> = {
  claude: [
    "Invalid API key · Please run /login",
    "Not logged in · Please run /login",
    "OAuth token revoked · Please run /login",
    "OAuth token has expired. Please obtain a new token or refresh your existing token.",
    'Failed to authenticate. API Error: 401 {"type":"error","error":{"type":"authentication_error","message":"OAuth token has expired."}}',
    'API Error: 401 {"type":"error","error":{"type":"authentication_error","message":"invalid x-api-key"}}',
  ],
  codex: [
    "unexpected status 401 Unauthorized: Missing bearer or basic authentication in header",
    "Your access token could not be refreshed because your refresh token has expired. Please log out and sign in again.",
    "Your access token could not be refreshed because your refresh token was already used. Please log out and sign in again.",
    "Error: Not logged in. Run `codex login` first.",
    'stream error: {"error":{"code":"token_expired","message":"Provided authentication token is expired."}}',
    "Login required",
  ],
  antigravity: [
    "You are not logged into Antigravity.",
    "Request had invalid authentication credentials. Expected OAuth 2 access token, login cookie or other valid authentication credential.",
    '{"error":{"code":401,"message":"…","status":"UNAUTHENTICATED"}}',
    "Please sign in to continue.",
    "HTTP 401 Unauthorized",
  ],
};

/** Real-shaped failures that are NOT a lost session — each has its own path today. */
const NEGATIVE: Record<SubscriptionCliId, string[]> = {
  claude: [
    "Claude AI usage limit reached|1767225600",
    "5-hour limit reached ∙ resets 3pm",
    "Credit balance is too low",
    'API Error: 429 {"type":"error","error":{"type":"rate_limit_error","message":"Number of request tokens has exceeded your per-minute rate limit"}}',
    'API Error: 529 {"type":"error","error":{"type":"overloaded_error","message":"Overloaded"}}',
    'API Error: 400 {"type":"error","error":{"type":"invalid_request_error","message":"prompt is too long: 210000 tokens > 200000 maximum"}}',
    "Claude Opus is not available with the Claude Pro plan. If you have updated your subscription plan recently, run /logout and /login for the plan to take effect.",
    "API Error: 403 Request not allowed",
    "La CLI a répondu une erreur.",
    cliToolGateMessage(["Bash", "Read"]),
  ],
  codex: [
    "You've hit your usage limit. Upgrade to Pro (https://chatgpt.com/explore/pro), or try again in 2 hours 14 minutes.",
    "unexpected status 429 Too Many Requests: Rate limit reached for gpt-5",
    "stream disconnected before completion: error sending request for url (https://chatgpt.com/backend-api/codex/responses)",
    "The 'gpt-5' model is not supported when using Codex with a ChatGPT account.",
    "unexpected status 400 Bad Request: Instructions are not valid",
    "La CLI Codex a terminé en erreur.",
  ],
  antigravity: [
    ANTIGRAVITY_EMPTY_TURN,
    "RESOURCE_EXHAUSTED: You have exhausted your capacity on this model. Your quota will reset after 3h.",
    "Quota exceeded for quota metric 'Generate Content API requests per minute'",
    "context canceled",
    "La CLI Antigravity a terminé en « ERROR ».",
    "The model refused to answer this request.",
  ],
};

describe("cliAuthFailureLine — the session patterns, per CLI", () => {
  for (const cli of Object.keys(POSITIVE) as SubscriptionCliId[]) {
    it.each(POSITIVE[cli])(`${cli}: lost session ⇒ « %s »`, (text) => {
      expect(cliAuthFailureLine(cli, text)).toBe(text.trim());
    });
    it.each(NEGATIVE[cli])(`${cli}: keeps its own path ⇒ « %s »`, (text) => {
      expect(cliAuthFailureLine(cli, text)).toBeNull();
    });
  }

  it("returns ONLY the matching line of a stderr tail — the rest stays out of the wire", () => {
    const tail = "loading config from /Users/x/.codex\nError: Not logged in. Run `codex login` first.\nbye";
    expect(cliAuthFailureLine("codex", tail)).toBe("Error: Not logged in. Run `codex login` first.");
  });
});

describe("cliFailure — the typed outcome main sends", () => {
  it("leads a lost session with the wire code, raw line kept for the debug log", () => {
    const err = cliFailure("claude", "Invalid API key · Please run /login", "Invalid API key · Please run /login", "", null);
    expect(err.code).toBe("cli_auth");
    expect(cliAuthOf(err.message)).toBe("claude");
    expect(err.message).toContain("Please run /login");
  });

  it("leaves every other failure's message untouched", () => {
    const msg = "Claude AI usage limit reached|1767225600";
    const err = cliFailure("claude", msg, msg, "", null);
    expect(err.code).toBeUndefined();
    expect(err.message).toBe(msg);
  });

  it("trusts claude's structural flag even when the text names no session", () => {
    const err = cliFailure("claude", "authentication_failed?", "something new", "", null, true);
    expect(cliAuthOf(err.message)).toBe("claude");
  });
});

describe("interpreters flag a lost session", () => {
  it("claude: an `assistant` with error authentication_failed is an error, never streamed text", () => {
    const ev = {
      type: "assistant",
      error: "authentication_failed",
      message: { content: [{ type: "text", text: "Invalid API key · Please run /login" }] },
    };
    expect(interpretClaudeEvent(ev, false)).toEqual({
      kind: "error",
      message: "Invalid API key · Please run /login",
      auth: true,
    });
  });

  it("codex: turn.failed carries the 401 text the patterns read", () => {
    const action = interpretCodexEvent({ type: "turn.failed", error: { message: "unexpected status 401 Unauthorized: x" } });
    expect(action?.kind === "error" && cliAuthFailureLine("codex", action.message)).toBeTruthy();
  });
});

/** A throwaway CLI: prints `stdout` lines, `stderr`, exits with `code`. */
function fakeCli(script: string): { bin: string; cwd: string } {
  const cwd = mkdtempSync(join(tmpdir(), "om-cli-auth-"));
  const bin = join(cwd, "cli");
  writeFileSync(bin, `#!/bin/sh\n${script}\n`);
  chmodSync(bin, 0o755);
  return { bin, cwd };
}

async function drain(
  cli: SubscriptionCliId,
  script: string,
  interpret: (event: unknown, sawDelta: boolean) => CliAction | null = interpretCodexEvent,
) {
  const { bin, cwd } = fakeCli(script);
  const it = streamCliProcess({ cli, binPath: bin, args: [], cwd, interpret });
  const text: string[] = [];
  try {
    for (let r = await it.next(); !r.done; r = await it.next()) text.push(r.value);
  } catch (err) {
    return { text, err: err as SubscriptionCliError };
  }
  return { text, err: null };
}

describe("streamCliProcess — the typed outcome from a real process", () => {
  it("a non-zero exit whose stderr says « not logged in » is CLI_AUTH", async () => {
    const { err } = await drain("codex", 'echo "Error: Not logged in. Run \\`codex login\\` first." 1>&2\nexit 1');
    expect(err?.code).toBe("cli_auth");
    expect(cliAuthOf(err?.message ?? "")).toBe("codex");
  });

  it("a non-zero exit with any other stderr keeps today's message", async () => {
    const { err } = await drain("codex", 'echo "panic: something broke" 1>&2\nexit 2');
    expect(err?.code).toBeUndefined();
    expect(cliAuthOf(err?.message ?? "")).toBeNull();
    expect(err?.message).toContain("2");
  });

  it("claude's stream: the complaint is never yielded as text, the turn fails typed", async () => {
    const ev = JSON.stringify({
      type: "assistant",
      error: "authentication_failed",
      message: { content: [{ type: "text", text: "Not logged in · Please run /login" }] },
    });
    const res = JSON.stringify({ type: "result", is_error: true, result: "Not logged in · Please run /login" });
    const { text, err } = await drain("claude", `echo '${ev}'\necho '${res}'\nexit 1`, interpretClaudeEvent);
    expect(text).toEqual([]);
    expect(cliAuthOf(err?.message ?? "")).toBe("claude");
  });

  it("a quota failure in the stream stays a quota failure", async () => {
    const res = JSON.stringify({ type: "result", is_error: true, result: "Claude AI usage limit reached|1767225600" });
    const { err } = await drain("claude", `echo '${res}'\nexit 1`, interpretClaudeEvent);
    expect(err?.code).toBeUndefined();
    expect(err?.message).toBe("Claude AI usage limit reached|1767225600");
  });
});
