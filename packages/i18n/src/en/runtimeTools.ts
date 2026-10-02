/**
 * The EN « runtime » slice, first half — translated from the source (`../fr/runtimeTools.ts`):
 * tool-step labels and the agent loop's stop notices. Assembled by `./runtime.ts`.
 */
import type { Messages } from "../messages";

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

export const runtimeTools = {
  intercepted: {
    run_python: "Analysis and file generation",
    web_fetch_many: "Reading web pages",
    load_tools: "Choosing tools",
    suggest_integrations: "Finding a connector",
    memory_search: "Searching memory",
  },
  verbs: {
    search: "Search",
    read: "Read",
    create: "Create",
    update: "Update",
    send: "Send",
    delete: "Delete",
    cancel: "Cancel",
    run: "Run",
    export: "Export",
    import: "Import",
    duplicate: "Duplicate",
  },
  nounActions: { details: "Details", status: "Status", account: "Account", connect: "Sign-in" },
  nouns: {
    issue: "issue", issues: "issues",
    email: "email", emails: "emails",
    thread: "thread", threads: "threads",
    channel: "channel", channels: "channels",
    file: "file", files: "files",
    folder: "folder", folders: "folders",
    event: "event", events: "events",
    calendar: "calendar", calendars: "calendars",
    task: "task", tasks: "tasks",
    customer: "customer", customers: "customers",
    invoice: "invoice", invoices: "invoices",
    payment: "payment", payments: "payments", charge: "payment", charges: "payments",
    refund: "refund", refunds: "refunds",
    subscription: "subscription", subscriptions: "subscriptions",
    balance: "balance", balances: "balances",
    repository: "repository", repositories: "repositories", repo: "repository", repos: "repositories",
    comment: "comment", comments: "comments",
    user: "user", users: "users",
    member: "member", members: "members",
    resource: "resource", resources: "resources",
    row: "row", rows: "rows",
    sheet: "sheet", sheets: "sheets",
    attachment: "attachment", attachments: "attachments",
  },
  browserRow: {
    search: "Web search",
    open: "Open page",
    act: "Page action",
    read: "Read page",
    tabs: "Manage tabs",
    close: "Close",
    browse: "Browse",
  },
  browserLive: {
    search: "Searching the web",
    open: "Browsing the web",
    act: "Using the page",
    read: "Reading the page",
    tabs: "Managing tabs",
    browse: "Browsing the web",
  },
  openingHost: (host) => `Opening ${host}`,
  connectorRead: {
    gmail: "Searching email",
    "microsoft-outlook": "Searching Outlook",
    "google-calendar": "Checking calendar",
    "google-drive": "Searching Google Drive",
    "microsoft-onedrive": "Searching OneDrive",
    "google-docs": "Reading documents",
    "google-sheets": "Reading spreadsheet",
    "google-tasks": "Reading tasks",
    "google-analytics": "Reading analytics",
    notion: "Reading Notion",
    slack: "Reading Slack",
    github: "Reading GitHub",
    linear: "Reading Linear issues",
    stripe: "Reading Stripe",
    fireflies: "Reading meetings",
    canva: "Reading Canva",
    webflow: "Reading Webflow",
    exa: "Searching the web",
    tavily: "Searching the web",
    firecrawl: "Reading web pages",
  },
  writing: "Writing",
  chars: (n) => `${n} ${plural(n, "character", "characters")}`,
} satisfies Messages["runtime"]["tools"];

export const runtimeLoop = {
  browserFault:
    "⚠️ The built-in browser could not open a page. The browser failed, not the model.\n\n" +
    "Switching models will not fix it. Close and reopen the browser, or restart the app.",
  webStopped: (n) => `⚠️ Search stopped after ${n} ${plural(n, "page", "pages")}.`,
  webNoAnswer: "The model kept searching without finding an answer. None of the pages it opened had it.",
  webTips:
    "Try this: name the target precisely (exact name, official site, city…), ask a narrower question, or give the address to read.",
  hammered: (n, tool) => `⚠️ Limit reached: ${n} calls to ${tool} in one turn.`,
  stuck: (n) => `⚠️ Tool loop stopped after ${n} ${plural(n, "call", "calls")}.`,
  cap: (turns, n) => `⚠️ Tool call limit reached (${turns} turns, ${n} ${plural(n, "call", "calls")}) with no final answer.`,
  failedVaried: (tool, times) =>
    `${tool} failed ${times} times in a row, with different inputs. The model did vary its calls. The tool is not responding:`,
  failedVariedTips:
    "Try this: the action exists (other calls succeeded), so switching models will not help. Check that the items still exist and that the connector is allowed to read them, then try again.",
  failedSame: (tool, times) => `${tool} failed ${times} times on the same call:`,
  sameResult: (tool, times) =>
    `${tool} returned the same result ${times} times. The model kept repeating the same call instead of changing approach.`,
  invalidCall: (tools) => `The model could not build a valid call for: ${tools}.`,
  noConverge: "The model kept calling tools without reaching an answer.",
  tips: "Try this: make the request more specific, try a more capable model (Claude, GPT-5.x…), or check that the connector offers this action.",
  interrupted: "_(Stopped.)_",
  refusedFakeAddress: (brand) => `Refused by ${brand}: address built from a substitute value`,
  refusedDomain: (brand) => `Refused by ${brand}: domain not allowed`,
  refusedDraftOnly: (brand) => `Refused by ${brand}: a draft was requested, not a send`,
  refusedConsultOnly: (brand) => `Refused by ${brand}: the request only asks to look`,
  alreadyDone: "already done",
  attachmentMissing: (name) => `⚠️ Not found, will not be sent: ${name}`,
} satisfies Messages["runtime"]["loop"];
