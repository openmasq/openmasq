import { app } from "electron";
import { join } from "node:path";

// SINGLE SOURCE (root rule 9) for the user's AMBIENT credential locations — the
// on-disk secret stores that live OUTSIDE the app's own userData: SSH/cloud/CLI
// tokens, keychains, browser cookie stores, shell histories, dotfile creds.
//
// Two consumers must mask the EXACT same set, or one boundary silently under-protects:
//   • the Python jail (`python/sandbox.ts` `secretPaths`) — de-redacted, possibly
//     injection-steered code could `open("~/.ssh/id_rsa")`;
//   • the Filesystem MCP tool deny-list (`mcp/server/connect.ts` `fsDenyPaths`) — a
//     model tool call `read_file("~/.ssh/id_rsa")` inside a user-granted broad root
//     (the UI invites granting `~`) would otherwise return the key straight to the model.
// Both re-redaction passes only re-mask KNOWN vault PII, so novel secret bytes read
// here reach the external model unmasked — the deny is the only backstop.
//
// This set deliberately EXCLUDES userData: each caller adds its own userData deny
// (the jail carves specific runtime subdirs back in; the fs gate denies it whole).

// WINDOWS roots. Electron exposes no `localAppData` path key, and `%APPDATA%` is absent on
// macOS/Linux — so both are derived from `home` when the env var is missing, keeping the
// returned list DETERMINISTIC on every platform (a path that doesn't exist simply never
// matches). Listing all three platforms' locations unconditionally is the existing shape
// here, and it is what makes the set testable off-Windows.
const roamingAppData = (home: string): string =>
  process.env.APPDATA || join(home, "AppData", "Roaming");
const localAppData = (home: string): string =>
  process.env.LOCALAPPDATA || join(home, "AppData", "Local");

/**
 * AUTOSTART + SHELL-INIT locations — the paths that decide what runs NEXT, on every login
 * or every terminal. They hold no credential, which is exactly why they were missing here,
 * and it is the wrong reason: the two consumers of this set both hand a path to code that
 * can WRITE (the fs connector's `write_file`, the Python jail), and both re-mask only KNOWN
 * vault PII. One line appended to `~/.zshrc`, or one plist dropped in `~/Library/
 * LaunchAgents`, converts a single injected tool call into persistent code execution as the
 * user — strictly worse than reading any one credential, because it outlives the session
 * and re-reads every credential above at leisure. `~/.local/bin` is the same shape by
 * shadowing (a `python`/`git` earlier on PATH), and `~/.claude/settings.json` is one too:
 * it declares hooks another agent runs.
 *
 * Returned as its own named set so a reviewer sees WHY these are here and not among the
 * credential stores; the entries are folded into the dirs/files below, so both consumers
 * get them (the file's whole premise: the two boundaries must mask the same set).
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
    // Every interactive shell sources one of these; between them they cover zsh (macOS's
    // default), bash and fish, login and non-login.
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
    // `.ssh`/`.aws`/`.kube`/`.docker`/`.azure` need nothing extra: they live under
    // `%USERPROFILE%` there, which IS `home`, so the entries above already cover them.
    // What follows has NO home-relative equivalent, and without it a Windows build denied
    // nothing but the dot-dirs — a granted `~` handed a model tool call every browser
    // cookie jar and the keys that decrypt them.
    //
    // `Protect` + `Crypto` FIRST because they are the crown jewels: they hold the DPAPI
    // master keys. Everything DPAPI protects on this machine — Chrome/Edge cookies AND
    // the app's own safeStorage blobs — is derivable from them, so reading them is strictly
    // worse than reading any single credential file.
    roam("Microsoft", "Protect"), roam("Microsoft", "Crypto"),
    roam("Microsoft", "Credentials"), local("Microsoft", "Credentials"),
    roam("Microsoft", "Vault"), local("Microsoft", "Vault"),
    // Browser profiles (cookies / saved logins / session tokens) — Windows keeps them in
    // LOCALAPPDATA, except Firefox which is Roaming.
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
    // The Windows shell history: PSReadLine records EVERY line typed into PowerShell,
    // pasted secrets included. It is the exact counterpart of the three histories above,
    // and it is the file an operator most often forgets.
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

/** The Filesystem MCP tool's deny-list: the app's own userData store PLUS every ambient
 *  credential path. Lives here (the trust-boundary family, rule 10) so it is unit-testable
 *  without the heavy `mcp/server/connect.ts` graph, and so a reviewer sees it beside the
 *  Python jail's `secretPaths` which masks the SAME ambient set. */
export function fsMcpDenyPaths(): string[] {
  return [app.getPath("userData"), ...ambientSecretPaths()];
}
