/**
 * Signing a subscription CLI in from inside the app — by running ITS sign-in and
 * relaying what it prints, never by touching its credentials (the rule of this folder).
 *
 * MEASURED 2026-09-05, without a TTY:
 * - **claude 2.1.261** `auth login --claudeai`: prints « Opening browser to sign in… »,
 *   then « If the browser didn't open, visit: <url> », then « Paste code here if
 *   prompted > » and WAITS on stdin. The page shows a code; we write it to stdin
 *   (`submitCode`), and exit 0 is the sign-in. The CLI opens the browser itself.
 * - **codex 0.149.1** `login --device-auth`: prints the device page URL and a one-time
 *   code `XXXX-XXXXX` (ANSI-coloured), then polls on its own until the code is entered on
 *   that page; exit 0 is the sign-in. Nothing on stdin. It does NOT open the browser.
 * - status: `claude auth status --json` → `{loggedIn, email, subscriptionType}`;
 *   `codex login status` → « Logged in using ChatGPT » / « Not logged in ».
 *
 * A URL is relayed only if it sits on the vendor's own domain (`LOGIN_HOSTS`) —
 * fail-closed: a CLI that printed anything else gets nothing opened for it.
 */
import { spawn, type ChildProcess } from "node:child_process";
import type {
  SubscriptionCli,
  SubscriptionCliStatus,
  SubscriptionLoginEvent,
  SubscriptionSetupResult,
} from "@openmasq/llm";
import { minimalChildEnv } from "../../childEnv";

const STATUS_TIMEOUT_MS = 8_000;
const LOGIN_TIMEOUT_MS = 15 * 60 * 1000;
const MAX_CODE_LENGTH = 512;

const LOGIN_HOSTS: Record<SubscriptionCli, string[]> = {
  claude: ["claude.com", "claude.ai", "anthropic.com"],
  codex: ["openai.com", "chatgpt.com"],
  antigravity: [],
};

const ANSI = /\u001b\[[0-9;]*[A-Za-z]/g;
export const stripAnsi = (s: string): string => s.replace(ANSI, "");

type LoginStatus = Pick<SubscriptionCliStatus, "loggedIn" | "email" | "plan">;

/** Pure: claude's `auth status --json`. Unparseable ⇒ `null` (did not answer). */
export function parseClaudeStatus(stdout: string): LoginStatus {
  try {
    const j: unknown = JSON.parse(stdout);
    if (typeof j !== "object" || j === null) return { loggedIn: null };
    const o = j as Record<string, unknown>;
    if (typeof o.loggedIn !== "boolean") return { loggedIn: null };
    const email = typeof o.email === "string" && o.email ? o.email : undefined;
    const plan =
      typeof o.subscriptionType === "string" && o.subscriptionType ? o.subscriptionType : undefined;
    return { loggedIn: o.loggedIn, ...(email ? { email } : {}), ...(plan ? { plan } : {}) };
  } catch {
    return { loggedIn: null };
  }
}

/** Pure: codex's `login status`. */
export function parseCodexStatus(stdout: string): LoginStatus {
  const s = stripAnsi(stdout).trim();
  if (/^not logged in/i.test(s)) return { loggedIn: false };
  if (/^logged in/i.test(s)) return { loggedIn: true };
  return { loggedIn: null };
}

/** Pure: the sign-in lines a CLI printed so far → what the interface can show. */
export function parseLoginOutput(cli: SubscriptionCli, text: string): { url?: string; code?: string } {
  const s = stripAnsi(text);
  const out: { url?: string; code?: string } = {};
  const url = /https:\/\/[^\s"'<>]+/.exec(s)?.[0];
  if (url && loginHostOk(cli, url)) out.url = url;
  if (cli === "codex") {
    const code = /\b([A-Z0-9]{4}-[A-Z0-9]{5})\b/.exec(s)?.[1];
    if (code) out.code = code;
  }
  return out;
}

function loginHostOk(cli: SubscriptionCli, url: string): boolean {
  try {
    const h = new URL(url).hostname.toLowerCase();
    return LOGIN_HOSTS[cli].some((d) => h === d || h.endsWith(`.${d}`));
  } catch {
    return false;
  }
}

const STATUS_ARGS: Record<SubscriptionCli, string[] | null> = {
  claude: ["auth", "status", "--json"],
  codex: ["login", "status"],
  antigravity: null,
};

/** Is the CLI signed in? One short process, bounded, `null` when it did not answer. */
export function readLoginStatus(cli: SubscriptionCli, binPath: string, cwd: string): Promise<LoginStatus> {
  const args = STATUS_ARGS[cli];
  if (!args) return Promise.resolve({ loggedIn: null });
  return new Promise((resolve) => {
    const child = spawn(binPath, args, { cwd, env: minimalChildEnv(), stdio: ["ignore", "pipe", "ignore"] });
    let out = "";
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill("SIGTERM");
      resolve(cli === "claude" ? parseClaudeStatus(out) : parseCodexStatus(out));
    };
    const timer = setTimeout(finish, STATUS_TIMEOUT_MS);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (c: string) => (out += c));
    child.on("error", finish);
    child.on("exit", finish);
  });
}

export interface LoginSession {
  done: Promise<SubscriptionSetupResult>;
  /** claude only: the code the sign-in page showed, handed to the CLI's stdin. */
  submitCode(code: string): boolean;
  cancel(): void;
}

const LOGIN_ARGS: Record<SubscriptionCli, string[] | null> = {
  claude: ["auth", "login", "--claudeai"],
  codex: ["login", "--device-auth"],
  antigravity: null,
};

const sessions = new Map<SubscriptionCli, LoginSession>();

/** Start the CLI's own sign-in; `emit` relays what it prints. One session per CLI. */
export function startLogin(
  cli: SubscriptionCli,
  binPath: string,
  cwd: string,
  emit: (e: SubscriptionLoginEvent) => void,
): LoginSession | null {
  const args = LOGIN_ARGS[cli];
  if (!args) return null;
  sessions.get(cli)?.cancel();
  const child: ChildProcess = spawn(binPath, args, {
    cwd,
    env: minimalChildEnv(),
    stdio: [cli === "claude" ? "pipe" : "ignore", "pipe", "ignore"],
  });
  let out = "";
  let sentUrl = false;
  let sentCode = false;
  let settled = false;
  const done = new Promise<SubscriptionSetupResult>((resolve) => {
    const finish = (ok: boolean) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      sessions.delete(cli);
      const result: SubscriptionSetupResult = ok ? { ok } : { ok, error: "login" };
      emit({ cli, kind: "done", ...result });
      resolve(result);
    };
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish(false);
    }, LOGIN_TIMEOUT_MS);
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (c: string) => {
      out += c;
      const parsed = parseLoginOutput(cli, out);
      if (parsed.url && !sentUrl) {
        sentUrl = true;
        emit({ cli, kind: "url", url: parsed.url });
      }
      if (parsed.code && !sentCode) {
        sentCode = true;
        emit({ cli, kind: "code", code: parsed.code });
      }
    });
    child.on("error", () => finish(false));
    child.on("exit", (code) => finish(code === 0));
  });
  const session: LoginSession = {
    done,
    submitCode(code) {
      const trimmed = code.trim();
      if (settled || !child.stdin || !trimmed || trimmed.length > MAX_CODE_LENGTH || /[\r\n]/.test(trimmed)) {
        return false;
      }
      child.stdin.write(`${trimmed}\n`);
      return true;
    },
    cancel() {
      if (!settled) child.kill("SIGTERM");
    },
  };
  sessions.set(cli, session);
  return session;
}

export function submitLoginCode(cli: SubscriptionCli, code: string): boolean {
  return sessions.get(cli)?.submitCode(code) ?? false;
}

export function cancelLogin(cli: SubscriptionCli): void {
  sessions.get(cli)?.cancel();
}
