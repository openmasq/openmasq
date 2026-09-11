// The published version, read from the package rather than compiled in: a build that forgot to
// bump a constant would print a version that never existed. "dev" when the file is not there
// (a bundled or relocated dist), because a card that says nothing beats a card that lies.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export function packageVersion(): string {
  try {
    const pkg = readFileSync(
      resolve(fileURLToPath(import.meta.url), "..", "..", "..", "package.json"),
      "utf8",
    );
    return (JSON.parse(pkg) as { version: string }).version;
  } catch {
    return "dev";
  }
}
