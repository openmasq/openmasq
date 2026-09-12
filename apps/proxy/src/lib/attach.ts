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
import { readConsoleLink } from "../features/console/link.js";
import { openInBrowser } from "./openUrl.js";
import { createReporter, renderJoinCard } from "./ui/index.js";
import type { ThemeChoice } from "./ui/theme.js";
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
    return {
      version: body.version,
      model: body.ner === true,
      ...(typeof body.level === "string" ? { level: body.level } : {}),
      ...(Array.isArray(body.disabled) ? { disabled: body.disabled.map(String) } : {}),
      ...(typeof body.console === "boolean" ? { console: body.console } : {}),
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
export async function joinRunning(
  url: string,
  command: string[],
  deps: {
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
  } = {},
): Promise<number | undefined> {
  const running = await (deps.find ?? findRunning)(url);
  if (!running) return undefined;
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
  const ignored = (deps.startOnly ?? []).filter((f) => !(f === "--console" && link));
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
