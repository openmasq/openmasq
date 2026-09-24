import { app } from "electron";
import { join } from "node:path";

// SINGLE SOURCE (rule 9) for the user's AMBIENT credential locations, OUTSIDE the app's
// userData. Two consumers must mask the EXACT same set or one boundary under-protects:
// the Python jail (`python/sandbox.ts` `secretPaths`) and the Filesystem tool deny-list
// (`fsMcpDenyPaths`). Both re-redaction passes only re-mask KNOWN vault PII, so a novel
// secret read here would reach the model unmasked: the deny is the only backstop.
// userData is EXCLUDED on purpose: each caller adds its own deny.

// WINDOWS roots, derived from `home` when the env var is missing so the list is
// DETERMINISTIC on every platform (a path that doesn't exist never matches) and testable
// off-Windows.
const roamingAppData = (home: string): string =>
  process.env.APPDATA || join(home, "AppData", "Roaming");
const localAppData = (home: string): string =>
  process.env.LOCALAPPDATA || join(home, "AppData", "Local");

/**
 * AUTOSTART + SHELL-INIT locations: what runs NEXT, on every login or terminal. No
 * credential, but both consumers hand a path to code that can WRITE, and one line appended
 * to `~/.zshrc` or one plist in `LaunchAgents` turns an injected tool call into persistent
 * code execution as the user — worse than reading any credential. `~/.local/bin` is the
 * same shape by PATH shadowing; `~/.claude/settings.json` declares hooks another agent runs.
 * A named set so a reviewer sees WHY; folded into the dirs/files below for both consumers.
 */
function autostartDirs(home: string): string[] {
  const h = (...p: string[]): string => join(home, ...p);
  return [
    h("Library", "LaunchAgents"), // macOS: a plist here is launched at every login
    h(".config", "autostart"), // Linux/XDG: a .desktop here is started with the session
    h(".config", "systemd", "user"), // Linux: a user unit, enabled and started at login
    h(".local", "bin"), // early on PATH ⇒ shadows `python`, `git`, …
    // Windows: a shortcut dropped here runs at every logon. Under Roaming, like PSReadLine.
    join(roamingAppData(home), "Microsoft", "Windows", "Start Menu", "Programs", "Startup"),
  ];
}

function shellInitFiles(home: string): string[] {
  const h = (...p: string[]): string => join(home, ...p);
  return [
    // zsh, bash and fish, login and non-login.
    h(".zshrc"), h(".zprofile"), h(".zshenv"),
    h(".bashrc"), h(".bash_profile"), h(".profile"),
    h(".config", "fish", "config.fish"),
    // Declares hooks + permissions another agent on this machine executes.
    h(".claude", "settings.json"),
  ];
}

/** The autostart / shell-init set, flat — the named view of what the two lists below fold in. */
export function autostartAndShellInitPaths(): string[] {
  const home = app.getPath("home");
  return [...autostartDirs(home), ...shellInitFiles(home)];
}

/** Home-relative credential DIRECTORIES to deny (macOS + Linux + Windows). */
export function ambientSecretDirs(): string[] {
  const home = app.getPath("home");
  const h = (...p: string[]): string => join(home, ...p);
  const roam = (...p: string[]): string => join(roamingAppData(home), ...p);
  const local = (...p: string[]): string => join(localAppData(home), ...p);
  return [
    // Cloud / CLI / dev credential stores.
    h(".ssh"), h(".aws"), h(".gnupg"), h(".kube"), h(".docker"), h(".azure"),
    h(".config", "gcloud"), h(".config", "gh"), h(".config", "git"),
    h(".config", "op"), h(".1password"), h(".terraform.d"), h(".ansible"), h(".chef"),
    // macOS messaging / mail / local databases with personal data.
    h("Library", "Messages"), h("Library", "Mail"), h("Library", "Safari"),
    h("Library", "Containers", "com.apple.mail"),
    // Keychains + browser profiles (cookies / saved logins / session tokens).
    h("Library", "Keychains"),
    h("Library", "Application Support", "Google", "Chrome"),
    h("Library", "Application Support", "Firefox"),
    h("Library", "Application Support", "BraveSoftware"),
    h("Library", "Application Support", "Microsoft Edge"),
    h("Library", "Application Support", "Arc"),
    h("Library", "Application Support", "com.operasoftware.Opera"),
    h("Library", "Cookies"),
    h(".mozilla"), h(".config", "google-chrome"), h(".config", "BraveSoftware"),
    h(".config", "microsoft-edge"), h(".config", "opera"),
    // ── WINDOWS ────────────────────────────────────────────────────────────────
    // The dot-dirs above already live under `%USERPROFILE%` (= `home`). What follows has
    // NO home-relative equivalent. `Protect` + `Crypto` hold the DPAPI master keys:
    // everything DPAPI protects (browser cookies AND the app's own safeStorage blobs) is
    // derivable from them.
    roam("Microsoft", "Protect"), roam("Microsoft", "Crypto"),
    roam("Microsoft", "Credentials"), local("Microsoft", "Credentials"),
    roam("Microsoft", "Vault"), local("Microsoft", "Vault"),
    // Browser profiles: LOCALAPPDATA, except Firefox (Roaming).
    local("Google", "Chrome", "User Data"),
    local("Microsoft", "Edge", "User Data"),
    local("BraveSoftware", "Brave-Browser", "User Data"),
    local("Chromium", "User Data"),
    local("Vivaldi", "User Data"),
    roam("Mozilla", "Firefox"),
    roam("Opera Software"),
    // Cloud/CLI stores that do NOT use the XDG dotfile layout on Windows.
    roam("gcloud"), roam("GitHub CLI"),
    // ── PERSISTENCE ────────────────────────────────────────────────────────────
    // Not credentials — what runs at the next login. See `autostartAndShellInitPaths`.
    ...autostartDirs(home),
  ];
}

/** Home-relative credential FILES to deny. */
export function ambientSecretFiles(): string[] {
  const home = app.getPath("home");
  const h = (...p: string[]): string => join(home, ...p);
  const roam = (...p: string[]): string => join(roamingAppData(home), ...p);
  return [
    h(".netrc"), h(".npmrc"), h(".pypirc"), h(".git-credentials"),
    h(".pgpass"), h(".my.cnf"), h(".vault-token"), h(".databrickscfg"), h(".boto"),
    h(".bash_history"), h(".zsh_history"), h(".python_history"),
    // PSReadLine records EVERY line typed into PowerShell, pasted secrets included.
    roam("Microsoft", "Windows", "PowerShell", "PSReadLine", "ConsoleHost_history.txt"),
    // ── PERSISTENCE ────────────────────────────────────────────────────────────
    // Not credentials — what runs in the next shell. See `autostartAndShellInitPaths`.
    ...shellInitFiles(home),
  ];
}

/** Flat list of every ambient credential path (dirs + files) — the form the fs-MCP
 *  deny-list consumes (`isWithin` treats a file deny as an exact-path match). */
export function ambientSecretPaths(): string[] {
  return [...ambientSecretDirs(), ...ambientSecretFiles()];
}

/** The Filesystem tool's deny-list: the app's own userData PLUS every ambient credential
 *  path. Here (rule 10) so a reviewer sees it beside the jail's `secretPaths`. */
export function fsMcpDenyPaths(): string[] {
  return [app.getPath("userData"), ...ambientSecretPaths()];
}
