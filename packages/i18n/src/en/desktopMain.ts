/**
 * The EN « desktopMain » slice.
 */
import type { Messages } from "../messages";

export const desktopMain = {
  contextMenu: {
    openLink: "Open Link",
    copyLinkAddress: "Copy Link Address",
    copy: "Copy",
    cut: "Cut",
    paste: "Paste",
    selectAll: "Select All",
  },
  writeConfirm: {
    eyebrow: "Action confirmation",
    titleAllow: "Allow this action?",
    titleDisableGate: "Turn off confirmation?",
    titleLeaveStrict: "Stop confirming every action?",
    noParams: "(no details)",
    paramsUnreadable: "(details can't be displayed)",
    allowLead: "The assistant wants to run this action with",
    allowTail: ". It can create, change or delete data on your connected account.",
    technicalDetails: "Technical details",
    scopeLead: "“Always for this tool” allows only",
    scopeTail: ", until you quit the app.",
    disableGateLead: "Write actions (email, creating or changing data on a connected account) will run",
    disableGateStrong: "without asking you",
    disableGateTail: " until the next restart. Only do this if you are watching the assistant.",
    leaveStrictBody:
      "In standard mode, you confirm once per conversation after a web search, and always when there is a leak signal or an attachment. This choice is kept after a restart.",
    deny: "Deny",
    denyDisableGate: "Keep confirmation",
    denyLeaveStrict: "Keep confirming",
    allow: "Allow",
    allowDisableGate: "Turn off",
    allowLeaveStrict: "Switch to standard",
    allowTool: "Always for this tool",
  },
  updates: {
    ok: "OK",
    failedTitle: "Update failed",
    noSpaceTitle: "Not enough disk space",
    readyTitle: (brand, version) => `${brand} ${version} is ready`,
    readyBody: "Restart the app to install it.",
    noSpaceStatus: (need, free) =>
      `Not enough disk space to install the update: about ${need} needed, ${free} available. Free up space, then try the update again.`,
    noSpaceDetail: (brand, version, size, need, free) =>
      `Installing ${brand} ${version} (${size}) needs about ${need} of free space. Only ${free} is left. Free up disk space, then try the update again.`,
    gigabytes: (n) => `${n} GB`,
    errors: {
      noSpace: "Not enough disk space to install the update. Free up space, then try again.",
      readOnlyVolume: (brand) =>
        `To update, ${brand} must be in the Applications folder. Move the app from the installer disk or Downloads to Applications, then open it again.`,
      appRunning: (brand) => `Part of the app was still running. Quit ${brand} completely, then try the update again.`,
      signature: "The downloaded update could not be verified. Try again.",
      serverDown: "The update server is unavailable right now. The app will try again automatically.",
      download: "The update could not be downloaded. Check your connection, then try again.",
      network: "Cannot reach the update server. Check your network, then try again.",
      generic: "The update failed. Try again later.",
    },
  },
  atRest: {
    title: "Encryption at rest unavailable",
    message: (brand) => `${brand} could not access your system keychain.`,
    detail:
      "Your API keys, sign-in tokens, session and masking mappings will be stored on this computer without encryption. The files are limited to your user account, but anyone with access to the disk can read them. Install or unlock a keychain (libsecret, GNOME Keyring or KWallet on Linux), then restart the app to turn encryption on.",
    ok: "Got it",
  },
  mic: {
    title: "Microphone blocked",
    message: (brand) => `${brand} can't access the microphone`,
    detail:
      "Allow microphone access in System Settings › Privacy & Security › Microphone, then try dictation again.",
    openSettings: "Open System Settings",
    cancel: "Cancel",
  },
  dbFatal: {
    title: (brand) => `${brand} can't start`,
    windows: (brand, url) =>
      `A system component the local database needs is missing on this computer: the Microsoft Visual C++ Redistributable (x64).\n\nInstall it from ${url}, then restart ${brand}.\n\nIf the problem continues, reinstall ${brand}. This version normally includes that component.`,
    other: (brand) =>
      `The local database's native component could not be loaded. Reinstall ${brand} to repair the installation.`,
  },
  customStack: {
    api: (host) => `API: ${host}`,
    gateway: (host) => `Gateway: ${host}`,
    accounts: (host) => `Accounts: ${host}`,
    switchMessage: "Point the app to this self-hosted stack?",
    switchDetail:
      "The app restarts in a separate profile. Conversations, the vault and the keys of the current environment are not copied to it. You can switch back at any time.",
    switchButton: "Switch",
    forgetMessage: "Forget the self-hosted stack?",
    forgetDetail: "The app restarts on the default environment. The stack's profile stays on disk.",
    forgetButton: "Forget",
    cancel: "Cancel",
  },
  notifyReplyReady: "Reply ready.",
  filePicker: {
    title: "Attach files",
    documents: "Documents",
    allFiles: "All files",
  },
  python: {
    downloading: (pct) => `Downloading the Python environment…${pct != null ? ` ${pct}%` : ""}`,
    extracting: "Unpacking the Python environment…",
    installing: "Installing Python libraries…",
    ready: "Python environment ready.",
    running: "Running code…",
  },
  subscription: {
    notEnabled: (label) => `${label} is not turned on (Settings → Models).`,
    missingClaude:
      "The Claude Code CLI is not installed on this computer. Install it and sign in with your Claude subscription, or choose another model.",
    missingCodex:
      "The Codex CLI is not installed on this computer. Install it (`npm i -g @openai/codex`), sign in with your ChatGPT account (`codex login`), or choose another model.",
    missingAntigravity:
      "The Antigravity CLI (`agy`) is not installed on this computer. Install Antigravity, sign in with your Google account, or choose another model.",
  },
  oauth: {
    pageTitle: (brand) => `${brand}: connected`,
    eyebrow: "Connector linked",
    heading: "Connected",
    body: (brand) => `Your connector is now linked to ${brand}. You can close this tab and go back to the app.`,
    hint: (brand) => `Your credentials stay on your computer. ${brand} never sends them to the model.`,
    cancelled: "Sign-in canceled",
    githubCodeCopied: (brand) => `${brand} code (copied):`,
    githubPasteHint: "Paste it (⌘V / Ctrl+V), then authorize access.",
    githubWindowTitle: (name, code) => `Connect ${name}: code ${code}`,
    githubDenied: "Access denied on GitHub",
    githubExpired: "The GitHub sign-in expired. Try again.",
    slackExpired: "The Slack sign-in expired. Try again.",
    openRouterOk: (brand) => `Authorization received. You can close this tab and go back to ${brand}.`,
    openRouterMiss: (brand) => `Authorization canceled or incomplete. Go back to ${brand} to try again.`,
    microsoftRefused: (detail) => `Microsoft sign-in refused${detail ? `: ${detail}` : ""}.`,
    microsoftAdminConsent: (brand) =>
      `Your organization requires an administrator's approval to connect ${brand}. Send them the link below. One approval covers every account in the organization, and you can then connect in one click.`,
    tokenExchangeFailed: (provider, status) => `The ${provider} sign-in did not complete (${status}).`,
  },
  mcp: {
    folderNotAllowed: (label) => `${label}: folder not allowed. Choose it with the button.`,
    folderRequired: (label) => `${label}: at least one folder is required.`,
    blockedByOrg: "Your organization blocks this service.",
    hostNotFound: "Host not found. Check the address and your connection.",
    privateAddress: "Address refused: this server is on an internal or private network.",
    urlRefused: (reason) => `URL refused (internal or private host): ${reason}`,
    apiKeyRefused: "API key refused",
    noDynamicRegistration:
      "This server does not accept automatic OAuth registration, so one-click sign-in is not available. Use its token-based option in “Local servers”.",
    accountAlreadyConnected: "This account is already connected.",
    missingClientId: "Client ID missing (“My keys” mode).",
    builtinKeysMissing: "Built-in keys are not set up for this connector. Use “My keys” or try again later.",
    missingGoogleSecret: "Google client secret missing.",
    byoRequired: "This connector needs your own keys (“My keys”).",
    unknownConnector: (id) => `Unknown connector: ${id}`,
  },
  folders: {
    cloudNotConnected: "This storage is not connected.",
    folderNotListed: "This folder could not be listed.",
    filesystemNotConnected: "The Filesystem connector is not connected.",
  },
  byoKeysBlocked:
    "Your organization has turned off personal API keys. The models it has enabled work without a key. Your administrator manages the list.",
} satisfies Messages["desktopMain"];
