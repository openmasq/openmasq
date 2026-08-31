/**
 * The environment a THIRD-PARTY CHILD receives — an ALLOWLIST, never inheritance.
 *
 * `{ ...process.env }` hands the child everything the user's session carries: launched
 * from a terminal, the app inherits the shell's `AWS_*`, `GITHUB_TOKEN`, API keys — and
 * used to forward them to the broker (the express/@mcp closure that holds the OAuth
 * tokens) and to the @playwright/mcp server. These children run THIRD-PARTY code:
 * rule 7 says never hand a child a secret it doesn't need, and inheritance is an
 * implicit denylist — every new variable passes through by default.
 *
 * The allowlist is the vital MINIMUM of a Node/Electron process per platform:
 * identity and paths (HOME, PATH, TMPDIR…), locale, corporate proxies (without them a
 * machine behind a proxy loses all egress), and the Windows baseline (a child without
 * `SystemRoot` dies at DLL init). Everything else — including every possible secret — is dropped.
 *
 * Children that are ALREADY minimal (NER, embed, extraction, Python jail) build their env
 * by hand and don't need it. Re-spawns of OUR OWN binary (agent browser) stay on
 * inheritance: same code, same trust — filtering protects nothing there.
 */

/** What a Node/Electron child is allowed to see. Nothing else gets through. */
const ALLOWED = [
  // Identity + paths (POSIX)
  "HOME", "USER", "LOGNAME", "PATH", "TMPDIR", "SHELL", "LANG", "LC_ALL", "TZ",
  // Corporate proxies — both cases exist in the wild.
  "HTTP_PROXY", "HTTPS_PROXY", "NO_PROXY", "http_proxy", "https_proxy", "no_proxy",
  // Windows baseline — a process without SystemRoot/COMSPEC won't start.
  "SystemRoot", "SystemDrive", "windir", "COMSPEC", "PATHEXT",
  "APPDATA", "LOCALAPPDATA", "USERPROFILE", "PROGRAMDATA", "TEMP", "TMP",
] as const;

/** Pure, so it can be pinned by `childEnv.test.ts` without touching the real environment. */
export function filterChildEnv(
  source: NodeJS.ProcessEnv,
  extra: Record<string, string> = {},
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const key of ALLOWED) {
    const v = source[key];
    if (v !== undefined) out[key] = v;
  }
  return { ...out, ...extra };
}

/** The minimal env for a THIRD-PARTY child: the allowlist + whatever the caller names. */
export function minimalChildEnv(extra: Record<string, string> = {}): Record<string, string> {
  return filterChildEnv(process.env, extra);
}
