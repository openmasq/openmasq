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
import { createServer } from "node:net";
import { basename } from "node:path";
import { readConsoleLink } from "../features/console/link.js";
import { openInBrowser } from "./openUrl.js";
import { createReporter, renderJoinCard } from "./ui/index.js";
import type { ThemeChoice } from "./ui/theme.js";
import type { ProxyConfig } from "../config/config.js";
import { runWrapped } from "./wrap.js";

export interface Running {
  /** The version it reports — printed so the operator sees which build is masking. */
  version: string;
  /** Does it hold the on-device model? Worth saying: the joiner cannot change that. */
  model: boolean;
  /** ITS level and ITS effective list of kinds left in clear — what the joined session will
   *  actually do. Absent from an older build, and then nothing is claimed on its behalf. */
  level?: string;
  disabled?: string[];
  /** Does it serve a live view? Absent from an older build; `openmasq-proxy console` then
   *  trusts the link it finds. */
  console?: boolean;
  /** Its process id, so "stop it and re-run" can name the command. */
  pid?: number;
}

/** A short, readable name for one client: `claude-a3f9`. Readable because it is what the
 *  console shows in its Session column, and `session-2` tells nobody anything. */
export function sessionName(command: string): string {
  const tool = basename(command)
    .replace(/\.(cmd|exe|bat)$/i, "")
    .replace(/[^a-z0-9-]/gi, "");
  // ⚠️ The suffix is not decoration. This name is also the ADDRESS of the session's vault —
  // `/s/<name>` is the whole base URL a wrapped tool is given, and `x-openmasq-session` names
  // the same thing — so whoever can say it can have the vault that maps fakes back to real
  // values. Two random bytes were four hex characters: enumerable in a moment by anything
  // that can reach the port. Nine bytes make the readable prefix a label and the suffix a
  // capability, which is what it always was.
  return `${(tool || "tool").toLowerCase()}-${randomBytes(9).toString("base64url")}`;
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
    return {
      version: body.version,
      model: body.ner === true,
      ...(typeof body.level === "string" ? { level: body.level } : {}),
      ...(Array.isArray(body.disabled) ? { disabled: body.disabled.map(String) } : {}),
      ...(typeof body.console === "boolean" ? { console: body.console } : {}),
      ...(typeof body.pid === "number" ? { pid: body.pid } : {}),
    };
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
export interface JoinDeps {
  find?: typeof findRunning;
  run?: (command: string[], url: string, extra: string[]) => Promise<number>;
  note?: (text: string) => void;
  /** The opening sequence, played for THIS proxy's masking rather than our own flags.
   *  Skipped when the running build does not report them: an opening that guessed would
   *  claim something nobody checked. */
  open?: (running: Running) => Promise<void>;
  /** Start-only flags the user passed that a JOIN cannot honour (`--console`, `--reveal`):
   *  they configure a NEW server, and this invocation started none. Warned, not swallowed —
   *  a `--console` that silently does nothing is why "rien n'arrive" in the console. */
  startOnly?: string[];
  /** The running proxy's live-view address, from the link it published (`console/link.ts`):
   *  the same user, the same 0600 file — the joiner may read what it may open. */
  link?: () => string | undefined;
  /** `--open` on the joiner: open THAT proxy's live view, since there is no other. */
  openConsole?: boolean;
  openUrl?: (url: string) => Promise<boolean>;
  /** The run's theme, for the card. */
  theme?: ThemeChoice;
  /** `--console`/`--open`: the operator wants a live view. A running proxy that serves none
   *  cannot give one, so the join is DECLINED and the caller starts its own, on another port
   *  (`"own"`). Joining silently would be the "nothing opens" report. */
  wantsConsole?: boolean;
}

export async function joinRunning(
  url: string,
  command: string[],
  deps: JoinDeps = {},
): Promise<number | "own" | undefined> {
  const running = await (deps.find ?? findRunning)(url);
  if (!running) return undefined;
  // Asked for a live view, and this proxy has none to give (it runs without one, or it is an
  // older build that published no link): not a join. The caller starts a proxy that has one.
  const early = running.console === false ? undefined : (deps.link ?? readConsoleLink)();
  if (deps.wantsConsole && !early) return "own";
  if (deps.open && running.level && running.disabled) await deps.open(running);
  const session = sessionName(command[0]);
  const reporter = createReporter({
    reveal: { on: false },
    ...(deps.theme ? { theme: deps.theme } : {}),
  });
  // The live view belongs to the proxy that started the server, and it published its
  // address for exactly this reader (`console/link.ts`): the card carries it, so this
  // terminal is not the one place the URL cannot be found — and `--open` opens it.
  const link = running.console === false ? undefined : (deps.link ?? readConsoleLink)();
  // The console (and its token) belong to whichever proxy actually STARTED the server; a join
  // holds none, so these flags never took effect. Said on the card, not swallowed.
  // `--console` and `--open` are honoured by the link when there is one; with none, they are
  // what the joiner cannot do, and the card says how to get a proxy that can.
  const ignored = (deps.startOnly ?? []).filter(
    (f) => !((f === "--console" || f === "--open") && link),
  );
  const card = {
    url,
    running,
    session,
    tool: command[0],
    ...(link ? { link } : {}),
    ...(ignored.length ? { ignored } : {}),
  };
  // A caller that hands a `note` wants lines, not a drawing: the same facts, one per line.
  if (deps.note) {
    deps.note(
      `joining the proxy already on ${url} (v${running.version}, ` +
        `${running.model ? "model on" : "pattern rules"}) — this session is ${session}`,
    );
    if (link) deps.note(`its live view: ${link}  (openmasq-proxy console reopens it)`);
    else if (running.console !== false)
      deps.note("its live view, if it serves one: openmasq-proxy console");
    if (ignored.length)
      deps.note(
        `${ignored.join(" and ")} ignored: a join starts no server — stop it and re-run to start your own`,
      );
  } else await reporter.card((tty) => renderJoinCard(tty, card));
  if (link && deps.openConsole && !(await (deps.openUrl ?? openInBrowser)(link)))
    reporter.note(
      "could not open a browser here — open the live view URL on the card by hand",
      "warn",
    );
  return await (deps.run ?? runWrapped)(command, sessionUrl(url, session), []);
}

/** What a JOIN is told about this run: the flags it cannot honour (they start a server —
 *  said rather than swallowed, the "rien n'arrive" report), and the opening sequence played
 *  for the proxy being joined rather than for our own flags. */
export function joinOptions(
  config: ProxyConfig,
  openIfWanted: (c: ProxyConfig) => Promise<void>,
): JoinDeps {
  return {
    startOnly: [
      config.open && "--open",
      config.console && !config.open && "--console",
      config.reveal && "--reveal",
    ].filter(Boolean) as string[],
    openConsole: config.open,
    theme: config.theme,
    wantsConsole: config.console || config.open,
    open: (running) =>
      openIfWanted({
        ...config,
        level: (running.level ?? config.level) as typeof config.level,
        disabledKinds: running.disabled ?? config.disabledKinds,
      }),
  };
}

/** The first port at or after `from` that nothing holds on loopback — for a run that could
 *  not join the proxy on its port and has to be its own (`"own"` above). */
export function freePort(from: number, tries = 20): Promise<number> {
  const probe = (port: number) =>
    new Promise<boolean>((resolve) => {
      const s = createServer();
      s.once("error", () => resolve(false));
      s.listen(port, "127.0.0.1", () => s.close(() => resolve(true)));
    });
  return (async () => {
    for (let p = from; p < from + tries; p++) if (await probe(p)) return p;
    throw new Error(`no free port between ${from} and ${from + tries - 1}`);
  })();
}
