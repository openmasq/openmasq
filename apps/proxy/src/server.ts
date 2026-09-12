#!/usr/bin/env node
// `openmasq-proxy`: flags → the on-device model IF the level asks for one (fail closed) →
// listen on loopback. `standard`, the default, is deterministic pattern rules: nothing to
// load, nothing to warm. On a terminal the keys of `lib/ui/keys.ts` turn the runtime dials;
// after `--`, a tool runs through the proxy and stops it when it exits.
import { randomBytes } from "node:crypto";
import { createApp } from "./app.js";
import { parseConfig, USAGE } from "./config/config.js";
import { createConsoleBus } from "./features/console/events.js";
import { publishConsoleLink } from "./features/console/link.js";
import { joinRunning, sessionName, sessionUrl } from "./lib/attach.js";
import { startIntegrations } from "./features/mcp/start.js";
import { createDials } from "./lib/dials.js";
import { disabledKindsFor } from "./lib/masker.js";
import { createMaskerSet } from "./lib/maskers.js";
import { parseMcpPolicy } from "./features/mcp/policy.js";
import { type DetectLocal, loadNer, resolveNerDir } from "./lib/ner.js";
import {
  attachKeys,
  createReporter,
  KEY_HINTS,
  type ModelState,
  openIfWanted,
  revealFor,
} from "./lib/ui/index.js";
import { openInBrowser } from "./lib/openUrl.js";
import { printMasthead } from "./lib/ui/masthead.js";
import { packageVersion } from "./lib/version.js";
import { runSubcommand } from "./commands.js";
import { defaultLogFile, fileWriter, runWrapped } from "./lib/wrap.js";

const NO_MODEL =
  "No model bundle: point --ner (or OPENMASQ_NER_DIR) at the desktop's `pnpm bake:ner` output.";

async function main(): Promise<void> {
  // `mcp`, `console`, `config` run no server: they are answered before the flags are parsed
  // (`commands.ts`), each under the same masthead.
  const sub = await runSubcommand(process.argv.slice(2), packageVersion());
  if (sub !== undefined) process.exit(sub);

  let config: ReturnType<typeof parseConfig>["config"];
  let policy: ReturnType<typeof parseMcpPolicy> = {};
  try {
    const parsed = parseConfig(process.argv.slice(2));
    config = parsed.config;
    policy = parseMcpPolicy(parsed.file?.mcp ?? {}, `${parsed.file?.path} › mcp`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg === USAGE) printMasthead("help", packageVersion());
    console.error(msg);
    process.exit(msg === USAGE ? 0 : 2);
  }

  const wrapping = config.command.length > 0;
  const url0 = `http://${config.host}:${config.port}`;

  // Already one running? Join it rather than dying on EADDRINUSE (`lib/attach.ts`).
  if (wrapping) {
    const code = await joinRunning(url0, config.command, {
      // Flags that start a NEW server cannot cross into a joined one — warn instead of
      // letting `--console`/`--reveal` quietly do nothing (the "rien n'arrive" report).
      startOnly: [config.console && "--console", config.reveal && "--reveal"].filter(
        Boolean,
      ) as string[],
      // Joining is the run with the LEAST feedback — no card, no footer — so the opening
      // matters most here. It states the proxy we are joining, not our own flags.
      open: (running) =>
        openIfWanted({
          ...config,
          level: (running.level ?? config.level) as typeof config.level,
          disabledKinds: running.disabled ?? config.disabledKinds,
        }),
    });
    if (code !== undefined) process.exit(code);
  }

  // The opening sequence, before anything is loaded: when a tool is being wrapped this is the
  // only moment the screen is ours, and it states what the proxy does rather than that it
  // started (`lib/ui/splash.ts`). It gives the terminal back exactly as it found it.
  await openIfWanted(config);

  const reveal = { on: config.reveal };
  const interactive = !wrapping && !config.json && !!process.stdin.isTTY && !!process.stderr.isTTY;
  // Wrapping a tool: its own interface owns the terminal, so the request lines go to a file
  // and only the card and the summary touch the screen.
  const logFile = wrapping ? config.logFile || defaultLogFile() : "";
  const live = {
    dials: () => ({ level: config.level, mode: config.mode, model: modelState() }),
    hints: KEY_HINTS,
  };
  const reporter = createReporter({
    json: config.json,
    quiet: !config.verbose,
    theme: config.theme,
    // A FILE never gets the toggle: with `--console --reveal -- <tool>` the values go to the
    // console page, and the log keeps counts (`revealFor`, pinned in `reporter.test.ts`).
    reveal: revealFor(reveal, { toFile: !!logFile }),
    ...(logFile ? { write: fileWriter(logFile), colors: false } : interactive ? { live } : {}),
  });
  const screen = logFile ? createReporter({ reveal, theme: config.theme }) : reporter;

  // The live console, when asked for. It reads the SAME events the terminal prints, so a
  // wrapped run — where the tool owns the screen — is watchable from a browser tab. The
  // token is minted here because `server.ts` is what prints it.
  const bus = config.console ? createConsoleBus(reveal.on) : undefined;
  const consoleToken = bus ? randomBytes(16).toString("base64url") : "";
  const feed: typeof reporter = bus
    ? {
        ...reporter,
        request(e) {
          reporter.request(e);
          bus.publish(e);
        },
      }
    : reporter;

  // The chat's masker reads its options at request time, so a key can re-point the level —
  // and the model, which `standard` never loads and a later level may need. A server with a
  // policy of its own gets its own masker beside it (`lib/maskers.ts`).
  const maskers = createMaskerSet(config, policy);
  const maskerOpts = maskers.global;
  let detectLocal: DetectLocal | undefined;
  const modelState = (): ModelState =>
    detectLocal ? "on" : maskers.needsModel() ? "off" : "rules";

  /** Load the model once. Returns "" on success, or why it cannot run. */
  async function ensureModel(): Promise<string> {
    if (detectLocal) return "";
    if (config.rulesOnly) return "--rules-only was passed";
    const dir = resolveNerDir(config.nerDir);
    if (!dir) return NO_MODEL;
    const done = screen.spinner("loading the on-device model…");
    try {
      detectLocal = await loadNer(dir);
      await detectLocal("bonjour"); // warm: the first request should not pay the load
      maskers.setDetect(detectLocal);
      return "";
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    } finally {
      done();
    }
  }

  // Fail closed: a level that asks for names, places and organisations — the chat's, or one
  // server's — does not start without the detector that finds them. `--rules-only` is the
  // explicit, loud opt-out.
  if (maskers.needsModel()) {
    if (config.rulesOnly) {
      screen.note(
        `--rules-only at level ${config.level}: names, organisations and places are NOT detected.`,
        "warn",
      );
    } else {
      const why = await ensureModel();
      if (why) {
        console.error(
          `${why}\nOr run at --level standard (pattern rules only), or --rules-only knowingly.`,
        );
        process.exit(3);
      }
    }
  }

  // The integrations, if asked for.
  const masker = maskers.masker;
  const integrations = await startIntegrations({
    config,
    maskers,
    policy,
    wrapping,
    note: (text, tone) => screen.note(text, tone),
    spinner: (text) => screen.spinner(text),
    version: packageVersion(),
  });
  const { upstream, bridge } = integrations;

  const app = createApp({
    config,
    masker,
    reporter: feed,
    version: packageVersion(),
    modelOn: () => !!detectLocal,
    ...(bridge
      ? {
          mcp: {
            bridge,
            version: packageVersion(),
            ...(integrations.changes ? { changes: integrations.changes } : {}),
          },
        }
      : {}),
    ...(bus
      ? {
          console: {
            bus,
            token: consoleToken,
            version: packageVersion(),
            command: config.command[0] ?? "openmasq-proxy",
            startedAt: Date.now(),
            config,
            ...(config.mcp
              ? { mcp: { servers: integrations.servers, writes: config.mcpWrites } }
              : {}),
          },
        }
      : {}),
  });
  const url = url0;
  const consoleUrl = bus ? `${url}/console?t=${consoleToken}` : "";
  const ownSession = wrapping ? sessionName(config.command[0]) : "";
  let detach = () => {};
  // The address on disk while we run, so `openmasq-proxy console` can open it at any moment.
  let withdrawLink = () => {};
  const server = app.listen(config.port, config.host, async () => {
    if (bus) withdrawLink = publishConsoleLink(consoleUrl);
    // Awaited: the card is revealed line by line, and the notes below it must not land in the
    // middle of it.
    await screen.banner(config, {
      model: modelState(),
      version: packageVersion(),
      keys: interactive ? KEY_HINTS : undefined,
      compact: wrapping,
      reveal: reveal.on && !wrapping,
      inClear: disabledKindsFor(config.level, config.disabledKinds),
      ...(bus ? { console: { url: consoleUrl, reveal: reveal.on } } : {}),
      ...(config.mcp
        ? {
            mcp: {
              servers: integrations.servers,
              writes: config.mcpWrites,
              url: `${url}/mcp`,
              ...(integrations.clientId ? { client: integrations.clientId } : {}),
            },
          }
        : {}),
    });
    // Before the tool takes the screen: the one moment the console URL is both known and
    // readable. Best-effort — no opener is a note, and the URL is still on the card.
    if (bus && config.open && !(await openInBrowser(consoleUrl)))
      screen.note("could not open a browser here — open the live view URL above by hand", "warn");
    if (config.json) console.error(`[openmasq-proxy] ${url}`);
    if (interactive) {
      const dials = { config, maskerOpts, reveal, url, hasModel: () => !!detectLocal, ensureModel };
      detach = attachKeys(reporter, createDials({ ...dials, quit: stop }));
    }
    if (wrapping) {
      screen.note(
        `masking for ${config.command[0]} (session ${ownSession}) — request lines in ${logFile}`,
      );
      // Even the first client gets its own session: the console must tell it apart from the
      // ones that join later, and a vault per client is the isolation that makes that true.
      const code = await runWrapped(
        config.command,
        sessionUrl(url, ownSession),
        integrations.exclusiveArgs,
      );
      screen.summary(reporter.stats());
      leave(code);
    }
  });
  server.on("error", (err: NodeJS.ErrnoException) => {
    console.error(
      err.code === "EADDRINUSE"
        ? `[openmasq-proxy] port ${config.port} is already taken — another proxy? Stop it or pass --port.`
        : err.message,
    );
    process.exit(4);
  });
  function leave(code: number): void {
    detach();
    withdrawLink();
    reporter.stop();
    // The stdio children are ours: leaving them behind would keep a process holding an API
    // key alive with nothing masking on top of it.
    void upstream?.close();
    integrations.cleanup();
    server.close(() => process.exit(code));
    setTimeout(() => process.exit(code), 500).unref();
  }
  function stop(): void {
    screen.summary(reporter.stats());
    leave(0);
  }
  if (wrapping)
    process.on("SIGINT", () => {}); // the tool owns the terminal; it exits first
  else {
    process.on("SIGINT", stop);
    process.on("SIGTERM", stop);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
