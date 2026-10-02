/**
 * The « desktopMain » slice — The desktop MAIN process's own copy: native dialogs, the context menu, the write-confirmation window, notifications, progress lines and errors main composes. Main picks the locale itself (apps/desktop/src/main/i18n.ts).
 *
 * Plain TEXT only: a page main builds (the write-confirmation window, the OAuth return
 * pages) HTML-escapes every entry, so no entry carries markup. A value main injects in
 * the middle of a sentence (the tool chip) splits the sentence into `lead` / `tail`.
 */

export interface DesktopMainMessages {
  contextMenu: {
    openLink: string;
    copyLinkAddress: string;
    copy: string;
    cut: string;
    paste: string;
    selectAll: string;
  };
  /** The native write-confirmation window (`mcp/writeConfirmHtml.ts`). */
  writeConfirm: {
    eyebrow: string;
    titleAllow: string;
    titleDisableGate: string;
    titleLeaveStrict: string;
    noParams: string;
    paramsUnreadable: string;
    /** « …via <tool>. » then the rest of the sentence. */
    allowLead: string;
    allowTail: string;
    technicalDetails: string;
    /** « « Toujours pour cet outil » n'autorise que <tool>, … ». */
    scopeLead: string;
    scopeTail: string;
    /** `lead` <strong>`strong`</strong> `tail`. */
    disableGateLead: string;
    disableGateStrong: string;
    disableGateTail: string;
    leaveStrictBody: string;
    deny: string;
    denyDisableGate: string;
    denyLeaveStrict: string;
    allow: string;
    allowDisableGate: string;
    allowLeaveStrict: string;
    allowTool: string;
  };
  updates: {
    ok: string;
    failedTitle: string;
    noSpaceTitle: string;
    noSpaceStatus: (need: string, free: string) => string;
    noSpaceDetail: (brand: string, version: string, size: string, need: string, free: string) => string;
    /** A size in gigabytes, already formatted for the locale (« 1,4 » / « 1.4 »). */
    gigabytes: (n: string) => string;
    /** By the stable code `updates/disk.ts` returns (the codes never change). */
    errors: {
      noSpace: string;
      readOnlyVolume: (brand: string) => string;
      appRunning: (brand: string) => string;
      signature: string;
      serverDown: string;
      download: string;
      network: string;
      generic: string;
    };
  };
  atRest: {
    title: string;
    message: (brand: string) => string;
    detail: string;
    ok: string;
  };
  mic: {
    title: string;
    message: (brand: string) => string;
    detail: string;
    openSettings: string;
    cancel: string;
  };
  dbFatal: {
    title: (brand: string) => string;
    windows: (brand: string, url: string) => string;
    other: (brand: string) => string;
  };
  customStack: {
    api: (host: string) => string;
    gateway: (host: string) => string;
    accounts: (host: string) => string;
    switchMessage: string;
    switchDetail: string;
    switchButton: string;
    forgetMessage: string;
    forgetDetail: string;
    forgetButton: string;
    cancel: string;
  };
  notifyReplyReady: string;
  filePicker: {
    title: string;
    documents: string;
    allFiles: string;
  };
  python: {
    /** `pct` 0–100, or null while the size is unknown. */
    downloading: (pct: number | null) => string;
    extracting: string;
    installing: string;
    ready: string;
    running: string;
  };
  subscription: {
    notEnabled: (label: string) => string;
    missingClaude: string;
    missingCodex: string;
    missingAntigravity: string;
  };
  oauth: {
    pageTitle: (brand: string) => string;
    eyebrow: string;
    heading: string;
    body: (brand: string) => string;
    hint: (brand: string) => string;
    cancelled: string;
    githubCodeCopied: (brand: string) => string;
    githubPasteHint: string;
    githubWindowTitle: (name: string, code: string) => string;
    githubDenied: string;
    githubExpired: string;
    slackExpired: string;
    openRouterOk: (brand: string) => string;
    openRouterMiss: (brand: string) => string;
    /** `detail` is the provider's own text (kept: it is what support needs), or "". */
    microsoftRefused: (detail: string) => string;
    microsoftAdminConsent: (brand: string) => string;
    tokenExchangeFailed: (provider: string, status: number) => string;
  };
  mcp: {
    folderNotAllowed: (label: string) => string;
    folderRequired: (label: string) => string;
    blockedByOrg: string;
    hostNotFound: string;
    privateAddress: string;
    /** ⚠️ These two must keep matching `PERMANENT_RE` (`mcp/server/reconnectRetry.ts`). */
    urlRefused: (reason: string) => string;
    apiKeyRefused: string;
    noDynamicRegistration: string;
    accountAlreadyConnected: string;
    missingClientId: string;
    builtinKeysMissing: string;
    missingGoogleSecret: string;
    byoRequired: string;
    unknownConnector: (id: string) => string;
  };
  folders: {
    cloudNotConnected: string;
    folderNotListed: string;
    filesystemNotConnected: string;
  };
  byoKeysBlocked: string;
}
