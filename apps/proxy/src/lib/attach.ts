// Several wrapped clients, one proxy. Starting a second `openmasq-proxy -- claude` used to
// die on `EADDRINUSE`; now it looks first, and joins the one already running.
//
// The join is deliberately thin: the second wrapper starts NO server and holds NO vault. It
// asks the running proxy who it is, mints a session name, and runs the tool with base URLs
// pointing at `/s/<session>`. Everything that masks stays in one process, which is what
// keeps one console showing every client.
//
// ⚠️ It joins only a proxy that IDENTIFIES ITSELF as one. Something else listening on 8787
// is not a thing to hand an API key to, so an unrecognised answer is a refusal, not a
// hopeful attempt.
import { randomBytes } from "node:crypto";
import { basename } from "node:path";
import { createReporter } from "./ui/index.js";
import { runWrapped } from "./wrap.js";

export interface Running {
  /** The version it reports — printed so the operator sees which build is masking. */
  version: string;
  /** Does it hold the on-device model? Worth saying: the joiner cannot change that. */
  model: boolean;
}

/** A short, readable name for one client: `claude-a3f9`. Readable because it is what the
 *  console shows in its Session column, and `session-2` tells nobody anything. */
export function sessionName(command: string): string {
  const tool = basename(command)
    .replace(/\.(cmd|exe|bat)$/i, "")
    .replace(/[^a-z0-9-]/gi, "");
  return `${(tool || "tool").toLowerCase()}-${randomBytes(2).toString("hex")}`;
}

/** The base URL a joined client is pointed at. */
export const sessionUrl = (url: string, session: string): string => `${url}/s/${session}`;

/**
 * Is an OpenMasq proxy already listening there? `undefined` when nothing answers or when
 * what answers is not one of ours.
 */
export async function findRunning(
  url: string,
  fetchFn: typeof fetch = fetch,
): Promise<Running | undefined> {
  try {
    const res = await fetchFn(`${url}/healthz`, { signal: AbortSignal.timeout(1500) });
    if (!res.ok) return undefined;
    const body = (await res.json()) as Record<string, unknown>;
    // It has to NAME itself; a bare 200 from an unrelated service is not an invitation.
    if (body.app !== "openmasq-proxy" || typeof body.version !== "string") return undefined;
    return { version: body.version, model: body.ner === true };
  } catch {
    return undefined;
  }
}

/**
 * Join a proxy already listening at `url`, and run `command` against it. Returns its exit
 * code, or `undefined` when there was nothing to join — the caller then starts its own.
 *
 * Deliberately the whole join, not just the lookup: the decision, the session name, the
 * line the operator reads and the child are one story, and splitting them across two files
 * is how the "did we actually join?" question stops having one answer.
 */
export async function joinRunning(
  url: string,
  command: string[],
  deps: {
    find?: typeof findRunning;
    run?: (command: string[], url: string, extra: string[]) => Promise<number>;
    note?: (text: string) => void;
  } = {},
): Promise<number | undefined> {
  const running = await (deps.find ?? findRunning)(url);
  if (!running) return undefined;
  const session = sessionName(command[0]);
  const say =
    deps.note ?? ((text: string) => createReporter({ reveal: { on: false } }).note(text, "ok"));
  say(
    `joining the proxy already on ${url} (v${running.version}, ` +
      `${running.model ? "model on" : "pattern rules"}) — this session is ${session}`,
  );
  return await (deps.run ?? runWrapped)(command, sessionUrl(url, session), []);
}
