#!/usr/bin/env node
// `openmasq-proxy`: flags → the on-device model IF the level asks for one (fail closed) →
// listen on loopback. `standard`, the default, is deterministic pattern rules: nothing to
// load, nothing to warm. On a terminal the keys of `lib/ui/keys.ts` turn the runtime dials;
// after `--`, a tool runs through the proxy and stops it when it exits.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { RedactionLevel } from "@openmasq/catalog";
import { createApp } from "./app.js";
import { LEVELS, parseArgs, USAGE } from "./config/config.js";
import { envLines } from "./lib/baseUrls.js";
import {
  createMasker,
  disabledKindsFor,
  levelNeedsModel,
  type MaskerOptions,
} from "./lib/masker.js";
import { type DetectLocal, loadNer, resolveNerDir } from "./lib/ner.js";
import { attachKeys, createReporter, KEY_HINTS, type ModelState } from "./lib/ui/index.js";
import { defaultLogFile, fileWriter, runWrapped } from "./lib/wrap.js";

const NO_MODEL =
  "No model bundle: point --ner (or OPENMASQ_NER_DIR) at the desktop's `pnpm bake:ner` output.";

async function main(): Promise<void> {
  let config: ReturnType<typeof parseArgs>;
  try {
    config = parseArgs(process.argv.slice(2));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(msg);
    process.exit(msg === USAGE ? 0 : 2);
  }

  const wrapping = config.command.length > 0;
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
    reveal,
    ...(logFile ? { write: fileWriter(logFile), colors: false } : interactive ? { live } : {}),
  });
  const screen = logFile ? createReporter({ reveal }) : reporter;

  // The masker reads these at request time, so a key can re-point the level — and the model,
  // which `standard` never loads and a later level may need.
  const maskerOpts: MaskerOptions = {
    detectLocal: undefined,
    keep: config.keep,
    disabledKinds: disabledKindsFor(config.level, config.disabledKinds),
    forced: config.always,
    secrets: config.secrets,
  };
  let detectLocal: DetectLocal | undefined;
  const modelState = (): ModelState =>
    detectLocal ? "on" : levelNeedsModel(config.level, config.disabledKinds) ? "off" : "rules";

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
      maskerOpts.detectLocal = detectLocal;
      return "";
    } catch (err) {
      return err instanceof Error ? err.message : String(err);
    } finally {
      done();
    }
  }

  // Fail closed: a level that asks for names, places and organisations does not start
  // without the detector that finds them. `--rules-only` is the explicit, loud opt-out.
  if (levelNeedsModel(config.level, config.disabledKinds)) {
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

  const app = createApp({
    config,
    masker: createMasker(maskerOpts),
    reporter,
    modelOn: () => !!detectLocal,
  });
  const url = `http://${config.host}:${config.port}`;
  let detach = () => {};
  const server = app.listen(config.port, config.host, async () => {
    screen.banner(config, {
      model: modelState(),
      version: packageVersion(),
      keys: interactive ? KEY_HINTS : undefined,
      compact: wrapping,
      reveal: reveal.on,
    });
    if (config.json) console.error(`[openmasq-proxy] ${url}`);
    if (interactive) {
      detach = attachKeys(reporter, {
        cycleLevel: async () => {
          const next = LEVELS[(LEVELS.indexOf(config.level) + 1) % LEVELS.length] as RedactionLevel;
          if (levelNeedsModel(next, config.disabledKinds) && !detectLocal) {
            const why = await ensureModel();
            if (why)
              return { level: config.level, refused: `${next} needs the on-device model: ${why}` };
          }
          config.level = next;
          maskerOpts.disabledKinds = disabledKindsFor(next, config.disabledKinds);
          return { level: next };
        },
        toggleMode: () => {
          config.mode = config.mode === "fake" ? "token" : "fake";
          return config.mode;
        },
        toggleReveal: () => {
          reveal.on = !reveal.on;
          return reveal.on;
        },
        envLines: () => envLines(url),
        quit: stop,
      });
    }
    if (wrapping) {
      screen.note(`masking for ${config.command[0]} — request lines in ${logFile}`);
      const code = await runWrapped(config.command, url);
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
    reporter.stop();
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

function packageVersion(): string {
  try {
    const pkg = readFileSync(
      resolve(fileURLToPath(import.meta.url), "..", "..", "package.json"),
      "utf8",
    );
    return (JSON.parse(pkg) as { version: string }).version;
  } catch {
    return "dev";
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
