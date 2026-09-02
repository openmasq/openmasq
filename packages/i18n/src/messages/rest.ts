/**
 * The contract of the last surfaces: sign-in, the organization SHARES, the
 * model picker (the chat menu and the Settings grid, which say the same
 * things), and the shared leaves that still carried their words hard-coded.
 *
 * A « the rest » slice is not a catch-all on principle: it is what was left
 * once every screen had its own, and each of these blocks is too small for a
 * namespace of its own — grouping them here makes them RE-READABLE at a glance.
 */

export interface LoginMessages {
  /** The DEFAULT title — `apps/web` sets another on its invitation page, where
   *  signing in is not a return but an arrival. */
  heading: string;
  subheading: string;
  checkYourEmail: string;
  passwordlessStrip: string;
  offline: string;
  email: string;
  emailPlaceholder: string;
  sending: string;
  sendLink: string;
  or: string;
  continueWithGoogle: string;
  noPassword: string;
  code: string;
  verifying: string;
  signInWithCode: string;
  linkNotOpening: string;
  useAnotherAddress: string;
  resend: string;
  resendLink: string;
}

export interface OrgSharesMessages {
  /** The right rail's bell, and what it opens. */
  requests: string;
  requestsCount: (count: number) => string;
  requestsShort: string;
  empty: string;
  vaultTerm: string;
  skill: string;
  proposedBy: (author: string) => string;
  someMember: string;
  accept: string;
  refuse: string;
  myShares: string;
  revoke: string;
  status: { pending: string; approved: string; refused: string; revoked: string };
  /** The share request. */
  promote: {
    eyebrow: string;
    title: string;
    sub: string;
    search: string;
    member: string;
    nobody: string;
    picked: string;
    previewTerm: string;
    previewOther: string;
    termNote: string;
    redactedNote: (count: number) => string;
    redactedTail: string;
    clean: string;
    send: string;
  };
  /** The SCOPES: what « personnel / équipe / organisation » means. */
  scopes: {
    org: { label: string; short: string; note: string };
    team: { label: string; short: string; note: string };
    personal: { label: string; short: string; note: string };
  };
  /** A share's TARGETS, and how each one is approved. */
  targets: {
    person: { label: string; desc: string; approval: string };
    team: { label: string; desc: string; approval: string };
    org: { label: string; desc: string; approval: string };
  };
}

export interface ModelPickerMessages {
  search: string;
  priceFilter: string;
  price: string;
  simpleView: string;
  simpleViewTip: string;
  manage: string;
  none: string;
  models: string;
  allModels: string;
  sectionDefault: string;
  sectionFavorites: string;
  sectionCurrent: string;
  freeTip: string;
  howToUse: string;
  isDefault: string;
  setDefault: string;
  addFavorite: string;
  removeFavorite: string;
  /** The Settings grid. */
  defaultSummaryTip: string;
  defaultSummaryLabel: string;
  keySaved: string;
  included: string;
  addKey: string;
  /** The model running on your machine. */
  local: {
    eyebrow: string;
    note: string;
    label: string;
    /** The free-text ids field under the address, and what it is for. */
    idsLabel: string;
    idsHint: string;
    /** Example ids in the empty field — one Ollama name, one LM Studio name. */
    idsPlaceholder: string;
  };
  /** The subscription CLIs — same shape, one provider each. */
  cli: {
    claude: { title: string; note: string; rowTitle: string; onDesc: string; missingDesc: string };
    codex: { title: string; note: string; rowTitle: string; onDesc: string; missingDesc: string };
    antigravity: {
      title: string;
      note: string;
      rowTitle: string;
      onDesc: string;
      missingDesc: string;
    };
    /** The account card inside an agent's opt-in: what its CLI says about itself. */
    account: {
      title: string;
      loading: string;
      unavailable: string;
      plan: (plan: string) => string;
      /** `windowOf` turns the CLI's minutes into « 5 h » / « 30 j ». */
      windowOf: (minutes: number) => string;
      quotaUsed: (percent: number, window: string) => string;
      resets: (date: string) => string;
      statusOk: string;
      statusWarning: string;
      statusExhausted: string;
      windowName: (window: string) => string;
      lastTurn: string;
      claudeNoData: string;
      modelsTitle: string;
      defaultTag: string;
      noModels: string;
      noQuota: string;
    };
  };
}

/** The shared leaves: what they say that nobody else says. */
export interface LeavesMessages {
  analytics: {
    privacyTitle: string;
    local: string;
    alwaysOn: string;
    usageStats: string;
    essentials: string;
    disable: string;
    statsOn: string;
    statsOff: string;
  };
  privacyLevels: { custom: string; customNote: string };
  demo: { youWrite: string; modelReceives: string };
  toolTrace: string;
  conversations: string;
  offline: string;
  freeModelsNotice: string;
  viewGrid: string;
  viewList: string;
  /** The leaves' five bare controls: they have nothing but an accessible name. */
  hide: string;
  display: string;
  resize: string;
  loading: string;
  errorBoundary: { title: string; body: string; reload: string; retry: string };
  code: { csvTable: string; rowsCols: (rows: number, cols: number) => string; lines: (count: number) => string };
  document: { saveFailed: string; shortcuts: string; seeAll: string; editorAria: string; seePrompt: string };
  openInPanel: (name: string) => string;
  loadingImage: (name: string) => string;
  openImage: (name: string) => string;
}
