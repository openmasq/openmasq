import { sep } from "node:path";

// What OTHER tools read as orders. Pure (no `fs`, no Electron): the worker and main both
// import it, so the two judge the same list (rule 9).
//
// The grant is default-ALLOW inside a granted folder, and a granted folder is often a
// project. A file written there as "a note" can be what an editor, a package manager, a CI,
// git or a coding agent RUNS next time, with the user's rights and with no one reading it:
// `.vscode/tasks.json`, `package.json` scripts, `.github/workflows/x.yml`, `.git/hooks/*`,
// `CLAUDE.md`. So a write or a move that lands on one is never an ordinary write: main asks
// on its own window, in EVERY mode, and says why (`mcp/server/callTool.ts`, `uiGate.ts`).

/** Why a path is not an ordinary document. */
export type RunByTools = "hidden" | "orders" | "installed";

/**
 * Files a build tool, a package manager, a test runner, a CI, a deploy or a coding agent
 * reads as orders or runs on its own. By NAME, lowercase. An enumeration of what is known to
 * be executed, on top of the two STRUCTURAL rules below (anything hidden, anything among
 * installed code), which need no list.
 */
const TOOL_ORDERS: ReadonlySet<string> = new Set([
  // packages, their manifests and their locks
  "package.json", "package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "pnpm-workspace.yaml", "yarn.lock", "bun.lock", "bun.lockb",
  "composer.json", "composer.lock", "deno.json", "deno.jsonc", "deno.lock", "gemfile", "gemfile.lock", "podfile", "podfile.lock", "brewfile",
  "pipfile", "pipfile.lock", "poetry.lock", "uv.lock", "pdm.lock", "cargo.toml", "cargo.lock", "go.mod", "go.sum", "go.work", "go.work.sum",
  "mix.exs", "mix.lock", "rebar.config", "package.swift", "package.resolved", "pubspec.yaml", "pubspec.lock", "stack.yaml", "cabal.project",
  "flake.nix", "flake.lock", "default.nix", "shell.nix", "constraints.txt", "nuget.config",
  // builds and tasks
  "makefile", "gnumakefile", "justfile", "rakefile", "vagrantfile", "dockerfile", "containerfile", "procfile", "jenkinsfile", "dangerfile",
  "fastfile", "appfile", "snapfile", "gruntfile.js", "gruntfile.coffee", "gulpfile.js", "gulpfile.ts", "gulpfile.mjs", "gulpfile.cjs", "gulpfile.babel.js",
  "build.rs", "build.zig", "build.sbt", "build.gradle", "settings.gradle", "gradle.properties", "gradlew", "mvnw", "pom.xml", "build.xml",
  "cmakelists.txt", "meson.build", "meson_options.txt", "configure", "configure.ac", "build.bazel", "workspace.bazel",
  "module.bazel", "taskfile.yml", "taskfile.yaml", "web.config", "app.config",
  // Python's own runners: setup, tests found and run on their own, tasks
  "setup.py", "setup.cfg", "pyproject.toml", "tox.ini", "noxfile.py", "conftest.py", "fabfile.py", "tasks.py", "sitecustomize.py", "usercustomize.py",
  // monorepos, linters, sites, CI and deploys
  "turbo.json", "nx.json", "project.json", "lerna.json", "rush.json", "angular.json", "renovate.json", "biome.json", "biome.jsonc",
  "mkdocs.yml", "mkdocs.yaml", "appveyor.yml", "azure-pipelines.yml", "bitbucket-pipelines.yml", "codemagic.yaml", "cloudbuild.yaml",
  "buildspec.yml", "netlify.toml", "vercel.json", "firebase.json", "fly.toml", "render.yaml", "serverless.yml", "app.yaml", "skaffold.yaml",
  "wrangler.toml", "wrangler.json", "wrangler.jsonc",
  // git hooks kept in the tree, and a repository's own action
  "lefthook.yml", "lefthook.yaml", "lefthook-local.yml", "lefthook-local.yaml", "lefthook.toml", "lefthook.json", "action.yml", "action.yaml",
  // what a coding agent reads as its instructions at its next session, and the servers it starts
  "claude.md", "claude.local.md", "agents.md", "agents.override.md", "agent.md", "gemini.md", "skill.md", "copilot-instructions.md",
  "conventions.md", "opencode.json", "opencode.jsonc", "mcp.json", "devcontainer.json",
]);

/** The same by pattern: every `*.config.*` a tool loads, tsconfigs, compose files, requirements… */
const TOOL_ORDER_PATTERNS: readonly RegExp[] = [
  /\.config\.[\w-]+$/,
  /^[\w-]+\.conf\.(?:[cm]?js|[cm]?ts)$/,
  /^(?:ts|js)config(?:[\w.-]*)\.json5?$/,
  /^(?:docker-)?compose(?:[\w.-]*)\.ya?ml$/,
  /^requirements(?:[\w.-]*)\.(?:txt|in)$/,
  /\.(?:gradle|gemspec|podspec|cmake|bzl|nix)$/,
  /^dockerfile\./,
  // an agent's rules and prompts by their ending (x.instructions.md, x.prompt.md, x.agent.md)
  /\.(?:instructions|prompt|agent|chatmode)\.md$/,
];

/** Folders whose code is installed, never read by the person, run by everything importing it. */
/** (No `vendor` nor `pods` here: in a folder of documents those are ordinary words.) */
const INSTALLED = new Set(["node_modules", "bower_components", "site-packages", "dist-packages", "jspm_packages", "__pycache__"]);

/** Case ignored, and trailing dots and spaces too (some volumes drop them: `package.json.` IS `package.json`). */
const plain = (name: string): string => name.toLowerCase().replace(/[. ]+$/, "");

/** Whether a file NAME is a tool's orders. */
export function isToolOrders(name: string): boolean {
  const n = plain(name);
  return TOOL_ORDERS.has(n) || TOOL_ORDER_PATTERNS.some((p) => p.test(n));
}

/**
 * Why writing (or moving something) AT `path` is not an ordinary write, or null.
 * Lexical on purpose: main holds the path the model named, the worker the REAL one, and
 * each judges its own (`toolOps.ts` refuses a link that hides the place from main).
 */
export function runByTools(path: string): RunByTools | null {
  const parts = path.split(/[\\/]+/).filter(Boolean);
  // hidden, or inside something hidden: .git/hooks, .vscode, .github/workflows, .claude, .env
  if (parts.some((p) => p.startsWith(".") && p !== "." && p !== "..")) return "hidden";
  if (parts.slice(0, -1).some((p) => INSTALLED.has(plain(p)))) return "installed";
  const name = parts.at(-1);
  return name && isToolOrders(name) ? "orders" : null;
}

/** The path arguments of each MUTATING op of the filesystem tool (`tools.ts`) and of the
 *  folder browser (`uiOps.ts`). An op absent from here mutates nothing on disk. */
const WRITE_PATHS: Record<string, readonly string[]> = {
  write_file: ["path"],
  edit_file: ["path"],
  edit_document: ["path"],
  create_directory: ["path"],
  // a move OUT of a hidden place counts too: `.git/hooks/x.sample` renamed is a hook armed
  move_file: ["source", "destination"],
  mkdir: ["path"],
  rename: ["source", "destination"],
};

export interface WriteHazard {
  path: string;
  why: RunByTools;
}

/** The first path of a mutating call that other tools run, or null. An op this map does
 *  not know is NOT judged here: the write gate's own rule (unknown ⇒ write) covers it. */
export function writeHazard(op: string, args: unknown): WriteHazard | null {
  const keys = WRITE_PATHS[op];
  if (!keys || !args || typeof args !== "object") return null;
  for (const key of keys) {
    const path = (args as Record<string, unknown>)[key];
    if (typeof path !== "string") continue;
    const why = runByTools(path);
    if (why) return { path, why };
  }
  return null;
}

/**
 * The worker's half, on the REAL path. Main judged the path as the model NAMED it; a link
 * inside the grant (`notes -> .git/hooks`) makes an innocent name land on a place main would
 * have asked about. Refused, never followed: there is no window to ask from here.
 * Judged BELOW the granted root, so a folder the user granted on purpose is not second-guessed.
 */
export function assertNotHiddenByLink(given: string, real: string, roots: readonly string[]): void {
  const root = roots.find((r) => real === r || real.startsWith(r.endsWith(sep) ? r : r + sep));
  const below = root ? real.slice(root.length) : real;
  if (runByTools(below) && !runByTools(given)) {
    throw new Error(
      `chemin refusé : ${given} mène, par un lien, à un emplacement que d'autres outils exécutent. ` +
        `Nommez l'emplacement réel pour que la confirmation le montre.`,
    );
  }
}
