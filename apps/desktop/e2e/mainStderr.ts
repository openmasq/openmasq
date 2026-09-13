import type { ElectronApplication } from "@playwright/test";

/**
 * Main-process stderr lines that mean the app is BROKEN, as opposed to the traces,
 * warnings and teardown chatter that share the stream.
 *
 * ⚠️ Why a list and not "any line": stderr is a SHARED console. Chromium writes its own
 * ERROR-tagged notices there, Node's inspector announces its shutdown there, and the app
 * logs warnings there. Treating every line as a failure failed the Windows preflight of
 * 13/09/2026 on `[agent] spawning (pipe): …` — a trace of a perfectly healthy spawn —
 * while passing on macOS only because the lines happened to land after the assertion.
 *
 * The first two entries are the exact words that failure printed: a `path/posix` join had
 * deleted the absolute `__dirname`, so the preload path came out relative and the renderer
 * 404ed. Keep them — they are the regression test for that bug at the stderr level.
 */
export const FATAL_MAIN = [
  /preload script must have absolute path/i,
  /the renderer failed to load/i,
  /Cannot find module|MODULE_NOT_FOUND|ERR_DLOPEN_FAILED/,
  /was compiled against a different Node\.js version/i,
  // Electron's wording when an IPC handler throws. `redact:detect-local` is EXCLUDED on
  // purpose: the smokes run BEFORE the workflow bakes the NER models, so the local engine
  // legitimately cannot start and the app falls back to the pattern rules — designed
  // behaviour, not a boot failure.
  /Error occurred in handler for (?!'redact:detect-local')/,
];

/** Keep every line the main process writes to stderr, and say which ones are fatal. */
export function watchMainStderr(app: ElectronApplication): {
  lines: string[];
  fatal: () => string[];
  report: () => string;
} {
  const lines: string[] = [];
  app.process().stderr?.on("data", (b: Buffer) => {
    const line = b.toString().trim();
    if (line) lines.push(line);
  });
  const fatal = () => lines.filter((l) => FATAL_MAIN.some((re) => re.test(l)));
  // Everything NOT counted, printed when something else fails: forwarding the stream was
  // for the diagnosis, and a failure that hides it is back to debugging blind.
  const report = () =>
    `other main stderr (not counted):\n${lines.map((l) => `  · ${l}`).join("\n") || "  (none)"}`;
  return { lines, fatal, report };
}
