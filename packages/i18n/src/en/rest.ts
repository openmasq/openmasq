/**
 * The « rest » slice of the EN catalogue: sign-in, organisation shares, the model picker,
 * and the shared leaves.
 */
import type { Messages } from "../messages";

export const login = {
  heading: "Good to see you again.",
  subheading:
    "Enter your email: we send you a sign-in link, with no password.",
  checkYourEmail: "Check your email",
  passwordlessStrip: "NO PASSWORD · A LINK SENT BY EMAIL",
  offline:
    "You are offline. Signing in needs a network connection — check yours, then try again.",
  email: "Work email",
  emailPlaceholder: "you@company.com",
  sending: "Sending…",
  sendLink: "Send the sign-in link",
  or: "or",
  continueWithGoogle: "Continue with Google",
  noPassword: "No password: your email is enough.",
  code: "Sign-in code",
  verifying: "Checking…",
  signInWithCode: "Sign in with the code",
  linkNotOpening: "The link won't open? Enter the code you received by email",
  useAnotherAddress: "Use another address",
  resend: "Send again",
  resendLink: "Send the link again",
} satisfies Messages["login"];

export const orgShares = {
  requests: "Share requests",
  requestsCount: (n) => `${n} share request${n > 1 ? "s" : ""}`,
  requestsShort: "Requests",
  empty: "Nothing to review. The terms and skills your colleagues propose will appear here.",
  vaultTerm: "Vault term",
  skill: "Skill",
  proposedBy: (author) => `Proposed by ${author}`,
  someMember: "a member",
  accept: "Accept",
  refuse: "Refuse",
  myShares: "My shares",
  revoke: "Withdraw",
  status: { pending: "Pending", approved: "Shared", refused: "Refused", revoked: "Withdrawn" },
  promote: {
    eyebrow: "Share",
    title: "With whom?",
    sub: "You keep your copy, and can go on editing it.",
    search: "Search a colleague",
    member: "Member",
    nobody: "Nobody by that name in the organisation.",
    picked: "Selected:",
    previewTerm: "The shared term",
    previewOther: "What will be shared",
    termNote:
      "The term and its stand-in become shared with the recipients: that name will be masked the same way in your conversations.",
    redactedNote: (n) => `${n} item${n > 1 ? "s" : ""} redacted`,
    redactedTail: " before sharing — the text above is exactly what the others will see.",
    clean: "No sensitive data detected in this content.",
    send: "Send the request",
  },
  scopes: {
    org: {
      label: "Organisation",
      short: "Org",
      note: "Shared with the whole organisation — visible and usable by every member.",
    },
    team: {
      label: "Team",
      short: "Team",
      note: "Shared with your team — visible and usable by its members.",
    },
    personal: { label: "Personal", short: "Personal", note: "Visible to you alone." },
  },
  targets: {
    person: {
      label: "One person",
      desc: "A colleague in your organisation.",
      approval: "They get a request and accept — nothing else to approve.",
    },
    team: {
      label: "Your team",
      desc: "The members of your team.",
      approval: "An administrator is notified and approves the request.",
    },
    org: {
      label: "The whole organisation",
      desc: "Every account in the organisation.",
      approval: "An administrator is notified and approves the request.",
    },
  },
} satisfies Messages["orgShares"];

export const modelPicker = {
  search: "Search a model (name, gpt, claude…)",
  priceFilter: "Filter by token price",
  price: "Price",
  simpleView: "Simple view",
  simpleViewTip: "Show a short list of models only",
  manage: "Manage the models and the keys (Settings)",
  none: "No model",
  models: "Models",
  allModels: "All the models",
  sectionDefault: "Default",
  sectionFavorites: "Favourites",
  sectionCurrent: "Current model",
  freeTip: "Free model — included with your account, limited usage. Click to find out more.",
  howToUse: "How do I use this model?",
  isDefault: "Default model for new conversations",
  setDefault: "Set as the default model",
  addFavorite: "Add to favourites",
  removeFavorite: "Remove from favourites",
  defaultSummaryTip: "See this model's card",
  defaultSummaryLabel: "Your new conversations start on",
  keySaved: "Key saved",
  included: "Included",
  addKey: "Add a key",
  local: {
    eyebrow: "A model on your computer",
    note: "If you run an AI model on your own computer (with Ollama, LM Studio…), give its address here.",
    label: "Model address",
  },
  cli: {
    claude: {
      title: "Your Claude subscription",
      note: "If you have a Claude subscription and the Claude Code CLI installed, your conversations can go through it — with no API key. Redaction applies as everywhere: the model only ever sees replaced data.",
      rowTitle: "Use my Claude Code CLI",
      onDesc:
        "Adds “Claude Code” to the model list. Every send draws on your personal Claude subscription.",
      missingDesc:
        "CLI not found on this machine: install Claude Code, connect it to your Claude account, then come back here.",
    },
    codex: {
      title: "Your ChatGPT subscription",
      note: "If you have a ChatGPT subscription and the Codex CLI installed, your conversations can go through it — with no API key. Redaction applies as everywhere: the model only ever sees replaced data.",
      rowTitle: "Use my Codex CLI",
      onDesc:
        "Adds “GPT Codex” to the model list. Every send draws on your personal ChatGPT subscription.",
      missingDesc:
        "CLI not found on this machine: install it (npm i -g @openai/codex), connect it with “codex login”, then come back here.",
    },
    antigravity: {
      title: "Your Google Antigravity subscription",
      note: "If you have an Antigravity subscription and its “agy” CLI installed, your conversations can go through it — with no API key. Redaction applies as everywhere: the model only ever sees replaced data. ⚠️ This path goes through third-party software, which Antigravity's terms do not provide for: the risk falls on your Google account.",
      rowTitle: "Use my Antigravity CLI",
      onDesc:
        "Adds “Antigravity” to the model list. Every send draws on your personal Google subscription; the app's connectors work there as on any other model.",
      missingDesc:
        "CLI not found on this machine: install Antigravity, connect it to your Google account, then come back here.",
    },
  },
} satisfies Messages["modelPicker"];

export const leaves = {
  analytics: {
    privacyTitle: "Privacy & GDPR",
    local: "locally",
    alwaysOn: "Session & security — always on",
    usageStats: "Usage statistics",
    essentials: "Essentials",
    disable: "Turn off",
    statsOn: "On — counters and screens visited, with no content.",
    statsOff: "Off — no statistic is sent any more.",
  },
  privacyLevels: {
    custom: "Custom",
    customNote: "Your settings, category by category. Picking a level above will replace them.",
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
    saveFailed: "Could not save — your text is still here.",
    shortcuts: "⌘↵ to save · Esc to cancel",
    seeAll: "See all",
    editorAria: "Document content",
    seePrompt: "See the prompt",
  },
  openInPanel: (name) => `Open ${name} in the panel`,
  loadingImage: (name) => `Loading ${name}`,
  openImage: (name) => `Open ${name}`,
} satisfies Messages["leaves"];
