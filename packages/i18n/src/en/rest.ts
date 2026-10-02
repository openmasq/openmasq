/**
 * The « rest » slice of the EN catalogue: sign-in, organisation shares, the model picker,
 * and the shared leaves.
 */
import type { Messages } from "../messages";

export const login = {
  heading: "Welcome back.",
  headingFirst: (brand) => `Sign in to ${brand}`,
  subheading: "Enter your email and we send you a sign-in link. No password needed.",
  inviteOnly:
    "Invite only: your email must be approved before you can sign in.",
  checkYourEmail: "Check your email",
  passwordlessStrip: "NO PASSWORD · SIGN-IN LINK BY EMAIL",
  offline: "You're offline. Signing in requires a network connection. Check your connection, then try again.",
  email: "Work email",
  emailPlaceholder: "you@company.com",
  sending: "Sending…",
  sendLink: "Send sign-in link",
  or: "or",
  continueWithGoogle: "Continue with Google",
  googleSoon: "Coming soon. Use the email link.",
  noPassword: "No password: your email is enough.",
  code: "Sign-in code",
  verifying: "Checking…",
  signInWithCode: "Sign in with code",
  linkNotOpening: "Link not working? Enter the code from the email",
  useAnotherAddress: "Use another address",
  resend: "Resend",
  resendLink: "Resend link",
} satisfies Messages["login"];

export const orgShares = {
  requests: "Share requests",
  requestsCount: (n) => `${n} share request${n > 1 ? "s" : ""}`,
  requestsShort: "Requests",
  empty: "Nothing to review. Terms and skills your colleagues propose appear here.",
  vaultTerm: "Vault term",
  skill: "Skill",
  proposedBy: (author) => `Proposed by ${author}`,
  someMember: "a member",
  accept: "Accept",
  refuse: "Decline",
  myShares: "My shares",
  revoke: "Withdraw",
  status: { pending: "Pending", approved: "Shared", refused: "Declined", revoked: "Withdrawn" },
  promote: {
    eyebrow: "Share",
    title: "With whom?",
    sub: "You keep your copy and can keep editing it.",
    search: "Search colleagues",
    member: "Member",
    nobody: "Nobody by that name in the organization.",
    picked: "Selected:",
    previewTerm: "The shared term",
    previewOther: "What will be shared",
    termNote:
      "The term and its substitute are shared with the recipients: that name will be masked the same way in your conversations.",
    redactedNote: (n) => `${n} item${n > 1 ? "s" : ""} masked`,
    redactedTail: " before sharing. Others will see exactly the text above.",
    clean: "No sensitive data detected in this content.",
    send: "Send request",
  },
  scopes: {
    org: {
      label: "Organization",
      short: "Org",
      note: "Shared with the whole organization: visible and usable by every member.",
    },
    team: {
      label: "Team",
      short: "Team",
      note: "Shared with your team: visible and usable by its members.",
    },
    personal: { label: "Personal", short: "Personal", note: "Visible to you alone." },
  },
  targets: {
    person: {
      label: "One person",
      desc: "A colleague in your organization.",
      approval: "They receive the request and accept it. No administrator approval needed.",
    },
    team: {
      label: "Your team",
      desc: "The members of your team.",
      approval: "An administrator is notified and approves the request.",
    },
    org: {
      label: "Whole organization",
      desc: "Every account in the organization.",
      approval: "An administrator is notified and approves the request.",
    },
  },
} satisfies Messages["orgShares"];

export const modelPicker = {
  search: "Search models (name, gpt, claude…)",
  priceFilter: "Filter by token price",
  price: "Price",
  simpleView: "Simple view",
  simpleViewTip: "Show a short list of models only",
  manage: "Manage models and keys (Settings)",
  none: "No model",
  models: "Models",
  allModels: "All models",
  sectionDefault: "Default",
  sectionFavorites: "Favorites",
  sectionCurrent: "Current model",
  freeTip: "Free model, included with your account, limited usage.",
  moreActions: "More actions",
  isDefault: "Default model for new conversations",
  setDefault: "Set as default model",
  addFavorite: "Add to favorites",
  removeFavorite: "Remove from favorites",
  defaultSummaryTip: "See this model's card",
  defaultSummaryLabel: "Your new conversations start on",
  keySaved: "Key saved",
  included: "Included",
  addKey: "Add a key",
  local: {
    eyebrow: "A model on your computer",
    note: "If you run an AI model on your own computer (with Ollama, LM Studio…), give its address here.",
    label: "Model address",
    idsLabel: "Extra models",
    idsHint:
      "The picker's list comes from the server itself. Add model IDs it doesn't list here, separated by commas (a model not loaded yet, a proxy with no list).",
    idsPlaceholder: "llama3.2, qwen/qwen3-8b",
  },
  cli: {
    claude: {
      title: "Your Claude subscription",
      note: "If you have a Claude subscription and the Claude Code CLI installed, your conversations can go through it, with no API key. Masking applies the same way.",
      rowTitle: "Use my Claude Code CLI",
      onDesc:
        "Adds “Claude Code” to the model list. Each message counts against your personal Claude subscription.",
      missingDesc:
        "CLI not found on this machine: install it below, then connect it to your Claude account.",
    },
    codex: {
      title: "Your ChatGPT subscription",
      note: "If you have a ChatGPT subscription and the Codex CLI installed, your conversations can go through it, with no API key. Masking applies the same way.",
      rowTitle: "Use my Codex CLI",
      onDesc:
        "Adds “GPT Codex” to the model list. Each message counts against your personal ChatGPT subscription.",
      missingDesc:
        "CLI not found on this machine: install it below, then connect it to your ChatGPT account.",
    },
    antigravity: {
      title: "Your Google Antigravity subscription",
      note: "If you have an Antigravity subscription and its “agy” CLI installed, your conversations can go through it, with no API key. Masking applies the same way. ⚠️ Antigravity's terms don't cover use through third-party software. Your Google account may be affected.",
      rowTitle: "Use my Antigravity CLI",
      onDesc:
        "Adds “Antigravity” to the model list. Each message counts against your personal Google subscription. The app's connectors work as with any other model.",
      missingDesc:
        "CLI not found on this machine: install Antigravity, connect it to your Google account, then come back here.",
    },
    setup: {
      install: "Install",
      installNote: (label, megabytes) =>
        `Downloads ${label} (${megabytes} MB) from its publisher, checks its integrity, then installs it.`,
      installing: (percent) => `Downloading… ${percent}%`,
      finishing: "Installing…",
      notInstallable: "This build of the app cannot install it on this machine.",
      connect: "Sign in",
      notConnected: "Installed, not yet connected to your account.",
      notConnectable: "Installed. Sign in to your account from the tool itself.",
      connecting: "Signing in through your browser…",
      openPage: "Open page",
      typeCode: (code) => `Enter this code on the page: ${code}`,
      pasteCode: "Paste the code shown on the page:",
      codePlaceholder: "Code",
      submitCode: "Confirm",
      cancel: "Cancel",
      connected: (email) => (email ? `Connected: ${email}` : "Connected to your account"),
      plan: (plan) => `${plan} plan`,
      checking: "Checking…",
      errors: {
        unsupported: "Unavailable on this machine.",
        network: "The download failed. Check your connection, then try again.",
        checksum: "The downloaded file doesn't match the expected checksum. It was not installed.",
        install: "The installation failed.",
        login: "The sign-in did not complete.",
        busy: "An installation is already running.",
      },
    },
    account: {
      title: "Your account",
      loading: "Reading account…",
      unavailable: "The CLI didn't respond. Check that it's signed in.",
      plan: (plan) => `Plan: ${plan}`,
      windowOf: (minutes) =>
        minutes >= 1440 ? `${Math.round(minutes / 1440)} d` : `${Math.round(minutes / 60)} h`,
      quotaUsed: (percent, window) => `${percent}% of the ${window} window used`,
      resets: (date) => `resets ${date}`,
      statusOk: "Quota available",
      statusWarning: "Quota nearly reached",
      statusExhausted: "Quota exhausted",
      windowName: (window) =>
        window === "five_hour" ? "5-hour window" : window === "weekly" ? "weekly window" : window,
      lastTurn: "As of your last message",
      claudeNoData: "The quota shows after your first message: this CLI only reports it while answering.",
      modelsTitle: "Account models",
      defaultTag: "default",
      noModels: "This CLI doesn't provide its model list.",
      noQuota: "This CLI doesn't report its quota.",
    },
  },
} satisfies Messages["modelPicker"];

export const leaves = {
  analytics: {
    privacyTitle: "Privacy & GDPR",
    body: (brand) =>
      `Masking runs locally, before anything is sent. ${brand} also measures app usage with anonymous statistics, never your messages, files or sensitive data. They are optional.`,
    local: "locally",
    alwaysOn: "Session & security — always on",
    usageStats: "Usage statistics",
    essentials: "Essentials",
    disable: "Turn off",
    statsOn: "On: counters and screens visited, no content.",
    statsOff: "Off: no usage data is sent.",
  },
  privacyLevels: {
    custom: "Custom",
    customNote: "Your settings, category by category. Picking a level above replaces them.",
    perConnector: {
      label: "Masking level for this connector",
      followsDefault: "Default",
      followsDefaultHint: (globalLevel) =>
        `Follows your overall level (${globalLevel}).`,
    },
  },
  demo: { youWrite: "WHAT YOU WRITE", modelReceives: "WHAT THE MODEL RECEIVES" },
  toolTrace: "TOOL CALLS",
  conversations: "Conversations",
  offline: "Offline",
  freeModelsNotice: "You are using the free models",
  viewGrid: "Grid view",
  viewList: "List view",
  hide: "Hide",
  display: "Display",
  resize: "Resize",
  loading: "Loading",
  errorBoundary: {
    title: "Something went wrong",
    body: "An unexpected problem occurred. Your data, saved on your computer, is intact.",
    reload: "Reload",
    retry: "Try again",
  },
  code: {
    csvTable: "CSV table",
    rowsCols: (rows, cols) =>
      `${rows} row${rows > 1 ? "s" : ""} · ${cols} column${cols > 1 ? "s" : ""}`,
    lines: (n) => `${n} line${n > 1 ? "s" : ""}`,
  },
  document: {
    saveFailed: "Couldn't save. Your text is still here.",
    shortcuts: "⌘↵ to save · Esc to cancel",
    seeAll: "See all",
    editorAria: "Document content",
    seePrompt: "See prompt",
  },
  openInPanel: (name) => `Open ${name} in the panel`,
  loadingImage: (name) => `Loading ${name}`,
  openImage: (name) => `Open ${name}`,
} satisfies Messages["leaves"];
