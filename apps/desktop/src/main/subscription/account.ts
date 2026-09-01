/**
 * What each subscription CLI can tell about ITS account — plan, quota, models — read
 * from the CLI itself, never from its credentials (the rule of this folder: auth never
 * passes through us; here we only spawn the tool and parse what it prints).
 *
 * MEASURED 01/09/2026:
 * - **codex 0.149.1**: `codex app-server` is a JSON-RPC server over stdio (the one the
 *   VS Code extension uses; flagged `[experimental]` by `--help`). Three reads, no model
 *   turn, under a second: `account/rateLimits/read` (`primary`/`secondary` windows with
 *   `usedPercent`, `windowDurationMins`, `resetsAt` in SECONDS, `planType`),
 *   `model/list` (`id`, `displayName`, `isDefault`, `hidden`) and `account/read`
 *   (`planType`). `initialize` must come first, then the `initialized` notification.
 * - **antigravity 1.1.23**: `agy models` prints `id<TAB>label` lines after a
 *   « Fetching… » banner — the account's live ids. Run with `--app_data_dir` like a turn,
 *   so the listing leaves no trace in the user's own data dir. No quota exposed.
 * - **claude 2.1.252**: nothing to ASK. Its `/usage` goes through `api/oauth/usage` with
 *   ITS OAuth — reading that would be reading its token. What it gives is the
 *   `rate_limit_event` of each turn (`claudeStream.ts`): we REMEMBER the last one here,
 *   in memory, and hand it back as `source: "lastTurn"`.
 *
 * Every read is bounded (`READ_TIMEOUT_MS`), kills its child, and answers `null` rather
 * than throwing: an account that cannot be read is a NORMAL state (CLI not signed in),
 * shown as such, never as an error.
 */
import { spawn } from "node:child_process";
import type { SubscriptionAccount, SubscriptionQuota } from "@openmasq/llm";
import { ANTIGRAVITY_APP_DATA_DIR } from "./antigravityEngine";
import type { SubscriptionCliId } from "./resolveCli";
import { minimalChildEnv } from "../childEnv";

const READ_TIMEOUT_MS = 8_000;

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
const num = (v: unknown): number | undefined => (typeof v === "number" && Number.isFinite(v) ? v : undefined);
const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);
/** The CLIs report epoch SECONDS; the type promises milliseconds. */
const toMs = (seconds: number | undefined): number | undefined => (seconds === undefined ? undefined : seconds * 1000);

// ── codex ────────────────────────────────────────────────────────────────────────

/** Pure: the three app-server results → one account. Exported for the parity test. */
export function parseCodexAccount(rateLimits: unknown, models: unknown, account: unknown): SubscriptionAccount {
  const quotas: SubscriptionQuota[] = [];
  const rl = isRecord(rateLimits) && isRecord(rateLimits.rateLimits) ? rateLimits.rateLimits : {};
  for (const window of ["primary", "secondary"] as const) {
    const w = rl[window];
    if (!isRecord(w)) continue;
    quotas.push({
      window,
      usedPercent: num(w.usedPercent),
      windowMinutes: num(w.windowDurationMins),
      resetsAt: toMs(num(w.resetsAt)),
    });
  }
  const acc = isRecord(account) && isRecord(account.account) ? account.account : {};
  const plan = str(acc.planType) ?? str(rl.planType);
  const list = isRecord(models) && Array.isArray(models.data) ? models.data : [];
  return {
    cli: "codex",
    ...(plan ? { plan } : {}),
    quotas,
    models: list.flatMap((m) => {
      if (!isRecord(m) || m.hidden === true) return [];
      const id = str(m.id);
      if (!id) return [];
      return [{ id, label: str(m.displayName) ?? id, ...(m.isDefault === true ? { isDefault: true } : {}) }];
    }),
    source: "live",
    observedAt: Date.now(),
  };
}

/**
 * One JSON-RPC session over the app-server's stdio: `initialize`, `initialized`, then
 * the reads. Resolves with the results by id once all three answered, or with what
 * arrived when the timeout fires; the child is killed either way.
 */
function readCodexAccount(binPath: string, cwd: string): Promise<SubscriptionAccount | null> {
  return new Promise((resolve) => {
    const child = spawn(binPath, ["app-server"], { cwd, env: minimalChildEnv(), stdio: ["pipe", "pipe", "ignore"] });
    const results = new Map<number, unknown>();
    let buf = "";
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill("SIGTERM");
      if (!results.has(2) && !results.has(3) && !results.has(4)) return resolve(null);
      resolve(parseCodexAccount(results.get(2), results.get(3), results.get(4)));
    };
    const timer = setTimeout(finish, READ_TIMEOUT_MS);
    const send = (msg: Record<string, unknown>) => child.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", ...msg })}\n`);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (chunk: string) => {
      buf += chunk;
      let i: number;
      while ((i = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, i);
        buf = buf.slice(i + 1);
        let msg: unknown;
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        if (!isRecord(msg) || typeof msg.id !== "number") continue;
        if (msg.id === 1) {
          send({ method: "initialized", params: {} });
          send({ id: 2, method: "account/rateLimits/read", params: {} });
          send({ id: 3, method: "model/list", params: {} });
          send({ id: 4, method: "account/read", params: {} });
          continue;
        }
        if ("result" in msg) results.set(msg.id, msg.result);
        else results.set(msg.id, undefined); // an error reply still counts as answered
        if (results.has(2) && results.has(3) && results.has(4)) finish();
      }
    });
    child.on("error", finish);
    child.on("exit", finish);
    send({ id: 1, method: "initialize", params: { clientInfo: { name: "openmasq", version: "0" } } });
  });
}

// ── antigravity ──────────────────────────────────────────────────────────────────

/** Pure: `agy models` stdout → models. Non-TSV lines (the banner) are skipped. */
export function parseAgyModels(stdout: string): SubscriptionAccount["models"] {
  return stdout
    .split("\n")
    .map((l) => l.split("\t"))
    .filter((cols) => cols.length >= 2 && /^[a-z0-9][a-z0-9.-]*$/i.test(cols[0].trim()))
    .map(([id, label]) => ({ id: id.trim(), label: label.trim() || id.trim() }));
}

function readAntigravityAccount(binPath: string, cwd: string): Promise<SubscriptionAccount | null> {
  return new Promise((resolve) => {
    const child = spawn(binPath, [`--app_data_dir=${ANTIGRAVITY_APP_DATA_DIR}`, "models"], {
      cwd,
      env: minimalChildEnv(),
      stdio: ["ignore", "pipe", "ignore"],
    });
    let out = "";
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      child.kill("SIGTERM");
      const models = parseAgyModels(out);
      resolve(models.length ? { cli: "antigravity", quotas: [], models, source: "live", observedAt: Date.now() } : null);
    };
    const timer = setTimeout(finish, READ_TIMEOUT_MS);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (c: string) => (out += c));
    child.on("error", finish);
    child.on("exit", finish);
  });
}

// ── claude ───────────────────────────────────────────────────────────────────────

let lastClaudeQuota: SubscriptionQuota | null = null;
let lastClaudeAt = 0;

/** Called by the turn (`registerChatIpc.ts`) on every `rate_limit_event`. */
export function noteClaudeRateLimit(info: { status: string; resetsAt?: number; windowType?: string }): void {
  lastClaudeQuota = { window: info.windowType ?? "unknown", status: info.status, resetsAt: toMs(info.resetsAt) };
  lastClaudeAt = Date.now();
}

/** Pure: what claude has told us so far, or `null` before the first turn. */
export function claudeAccount(): SubscriptionAccount | null {
  if (!lastClaudeQuota) return null;
  return { cli: "claude", quotas: [lastClaudeQuota], models: [], source: "lastTurn", observedAt: lastClaudeAt };
}

/** Test seam: forget the remembered claude quota. */
export function resetClaudeAccountForTests(): void {
  lastClaudeQuota = null;
  lastClaudeAt = 0;
}

// ── the switchboard ──────────────────────────────────────────────────────────────

export function readSubscriptionAccount(cli: SubscriptionCliId, binPath: string, cwd: string): Promise<SubscriptionAccount | null> {
  if (cli === "codex") return readCodexAccount(binPath, cwd);
  if (cli === "antigravity") return readAntigravityAccount(binPath, cwd);
  return Promise.resolve(claudeAccount());
}
