/**
 * The « runtime » slice — renderer copy that `.ts` logic builds at run time: tool-step
 * labels and loop notices, send blockers and errors, attachment/import/drop messages, the
 * network log's source labels.
 *
 * ⚠️ The TOOL tables are keyed on ids the CODE owns (`agent/humanToolLabel.ts` tokenises a
 * tool name and looks each word up here). A key added on one side only is a `tsc` error.
 * Model-facing prose (tool results, guidance) is NOT here: it follows the conversation.
 */

/** The app's own intercepted tools: their names are ours, nothing to guess. */
type InterceptedToolId = "run_python" | "web_fetch_many" | "load_tools" | "suggest_integrations" | "memory_search";
/** The action families a tool-name word maps to (`search`, `list`, `get`… → `search`/`read`). */
type ToolVerbId =
  | "search" | "read" | "create" | "update" | "send" | "delete"
  | "cancel" | "run" | "export" | "import" | "duplicate";
/** What a verb-less tool name looks at. */
type ToolNounActionId = "details" | "status" | "account" | "connect";
/** The object words a tool name may carry, by their English spelling. */
type ToolNoun =
  | "issue" | "issues" | "email" | "emails" | "thread" | "threads" | "channel" | "channels"
  | "file" | "files" | "folder" | "folders" | "event" | "events" | "calendar" | "calendars"
  | "task" | "tasks" | "customer" | "customers" | "invoice" | "invoices" | "payment" | "payments"
  | "charge" | "charges" | "refund" | "refunds" | "subscription" | "subscriptions"
  | "balance" | "balances" | "repository" | "repositories" | "repo" | "repos"
  | "comment" | "comments" | "user" | "users" | "member" | "members" | "resource" | "resources"
  | "row" | "rows" | "sheet" | "sheets" | "attachment" | "attachments";
/** Connectors with a live READ sentence of their own. */
type ConnectorReadId =
  | "gmail" | "microsoft-outlook" | "google-calendar" | "google-drive" | "microsoft-onedrive"
  | "google-docs" | "google-sheets" | "google-tasks" | "google-analytics" | "notion" | "slack"
  | "github" | "linear" | "stripe" | "fireflies" | "canva" | "webflow" | "exa" | "tavily" | "firecrawl";
/** The agent browser's gestures, by family. */
type BrowserGesture = "search" | "open" | "act" | "read" | "tabs" | "close" | "browse";
/** The `source` values main writes into the network log. */
type EgressSourceId =
  | "browser" | "browser-favicon" | "connector" | "mcp-connect" | "tool-result-fetch" | "fetch-url"
  | "link-preview" | "web-fetch-many" | "model-catalogue" | "embeddings" | "safe-fetch" | "unknown";
type DropRegionId = "center" | "left" | "right" | "top" | "bottom";

export interface RuntimeMessages {
  tools: {
    intercepted: Record<InterceptedToolId, string>;
    verbs: Record<ToolVerbId, string>;
    nounActions: Record<ToolNounActionId, string>;
    nouns: Record<ToolNoun, string>;
    /** Short row NOUNS for the trace. */
    browserRow: Record<BrowserGesture, string>;
    /** The live line while the browser works. */
    browserLive: Record<Exclude<BrowserGesture, "close">, string>;
    openingHost: (host: string) => string;
    /** Only ever a READ: a write keeps the verb-accurate row vocabulary. */
    connectorRead: Record<ConnectorReadId, string>;
    /** The model is writing a reply or tool arguments, no tool named yet. */
    writing: string;
    chars: (n: number) => string;
  };
  /** Notices the agent loop shows AS the assistant reply when a turn ends badly. */
  loop: {
    browserFault: string;
    webStopped: (pages: number) => string;
    webNoAnswer: string;
    webTips: string;
    hammered: (calls: number, tool: string) => string;
    stuck: (calls: number) => string;
    cap: (turns: number, calls: number) => string;
    failedVaried: (tool: string, times: number) => string;
    failedVariedTips: string;
    failedSame: (tool: string, times: number) => string;
    sameResult: (tool: string, times: number) => string;
    invalidCall: (tools: string) => string;
    noConverge: string;
    tips: string;
    interrupted: string;
    /** Trace-row notes for a call the app refused, and the confirm card's missing file. */
    refusedFakeAddress: (brand: string) => string;
    refusedDomain: (brand: string) => string;
    refusedDraftOnly: (brand: string) => string;
    refusedConsultOnly: (brand: string) => string;
    alreadyDone: string;
    attachmentMissing: (name: string) => string;
  };
  send: {
    /** The masking step could not run: the send is blocked, nothing was sent. */
    maskingBlocked: (cause: string) => string;
    maskingCause: { network: string; auth: string; unknown: string };
    /** The masking pass ran past its time budget (a long text, a busy machine): the send
     *  is blocked like any masking failure, and the advice is to retry or split the text. */
    maskingTimeout: string;
    modelBlockedByOrg: (model: string) => string;
    creditsSold: string;
    creditsUnsold: string;
    creditsOrg: string;
    suspended: string;
    paidUnavailable: string;
    genericError: string;
    fileStillMasking: string;
    /** A staged file is still being READ (or queued): the send waits, nothing is cleared. */
    fileStillReading: string;
    /** A staged file read only in part (a record from the former OCR cap): never sent so. */
    fileReadInPart: (name: string, read: number, total: number) => string;
    /** The message alone overflows the model's context window (estimated, before masking):
     *  refused, draft and files kept. Figures come preformatted (« 310K », « 128K »). */
    contextTooLarge: (model: string, tokens: string, limit: string, hasFiles: boolean) => string;
    /** Files with no readable content: the confirmation NAMES them before a send without them. */
    unreadTitle: (n: number) => string;
    unreadBody: (n: number, names: string) => string;
    unreadSendWithout: (n: number) => string;
    /** Nothing but unreadable files: the send is refused rather than sent empty. */
    unreadNothingLeft: (n: number, names: string) => string;
    /** A retry whose documents could not all be reloaded: the turn is kept, nothing is sent. */
    retryMissingFiles: (n: number, names: string) => string;
    /** A masking-model failure, phrased by engine and cause. */
    maskFail: {
      remoteAuth: string;
      remoteNetwork: string;
      remoteUnknown: string;
      local: string;
      modelAuth: string;
      modelNetwork: string;
      modelUnknown: string;
      /** The masking pass ran out of time (any engine). */
      timeout: string;
    };
    /** The platform send could not get its session token. */
    token: {
      outage: (brand: string) => string;
      freeModel: (brand: string) => string;
      unknownTier: (brand: string) => string;
      paidTier: (brand: string) => string;
      freeTier: (brand: string) => string;
    };
  };
  files: {
    /** The turned-off categories a masked view does NOT cover (first five, then a count). */
    notMaskedHere: (categories: string) => string;
    notMaskedMore: (more: number) => string;
    docMaskFailed: string;
    retryMasking: string;
    maskSelection: (value: string) => string;
    imageOnlyZone: string;
    sheetHasMasked: (name: string) => string;
    sheetCutRows: (row: number) => string;
    sheetCutAll: string;
    sheetPreviewCut: (rows: number, cols: number) => string;
    skillsNothing: (brand: string) => string;
    skillsDropUnreadable: string;
    /** A sentence with code spans (`{ code }` pieces), rendered piece by piece by the caller. */
    skillsDropSub: (string | { code: string })[];
    skillsNeedsFiles: (n: number) => string;
    skillsAsWorkflowTip: string;
    skillsAsSkillTip: string;
    skillsWorkflow: string;
    skillsSkill: string;
    skillsNote: string;
    folderFallbackName: string;
    folderOfferOne: (brand: string, name: string) => string;
    folderOfferMany: (brand: string, n: number) => string;
    folderOfferNote: (brand: string) => string;
    folderGranted: (path: string) => string;
    folderAlready: (path: string) => string;
    folderUnavailable: string;
    folderRefused: (message: string) => string;
    importWrongProvider: (provider: string) => string;
    importNothing: (provider: string) => string;
    importNotJson: string;
    importZipUnreadable: string;
    importNoJsonInZip: string;
  };
  misc: {
    egressSources: Record<EgressSourceId, string>;
    dropRegions: Record<DropRegionId, string>;
    login: { generic: string; rateLimit: string; network: string; signupsClosed: string };
    megabytes: (n: string) => string;
    gigabytes: (n: string) => string;
    billingNetwork: string;
    feedback: { signedOut: string; unavailable: string; network: string };
    mail: {
      truncated: string;
      field: (label: string, value: string) => string;
      mood: string;
      context: string;
      version: string;
      channel: string;
      screen: string;
      model: string;
      level: string;
      install: string;
      journal: string;
      subject: (category: string, product: string) => string;
    };
  };
}
