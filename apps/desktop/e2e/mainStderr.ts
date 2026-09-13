import type { ElectronApplication } from "@playwright/test";
import { FATAL_MAIN } from "../scripts/fatalMainStderr";

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
