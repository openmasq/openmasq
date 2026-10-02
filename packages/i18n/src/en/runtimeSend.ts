/**
 * The EN « runtime » slice, second half — translated from the source (`../fr/runtimeSend.ts`):
 * send blockers, attachment, import and drop messages, and the small run-time labels.
 *
 * ⚠️ "Nothing was sent" is said where the send is blocked BEFORE any call, and nowhere else.
 */
import type { Messages } from "../messages";

const NOT_MASKED = "Names were not masked. Nothing was sent.";

export const runtimeSend = {
  maskingBlocked: (cause) => `Send blocked: ${cause}. Nothing was sent. Try again.`,
  maskingCause: {
    network: "masking is not responding",
    auth: "masking failed on our side",
    unknown: "masking could not run",
  },
  modelBlockedByOrg: (model) => `Your organization turned off the model "${model}". Choose another one.`,
  creditsSold: "You are out of credits. Upgrade your plan, use your own API key, or wait for the renewal.",
  creditsUnsold: "This model is not available on your account right now. Use your own API key, or choose another model.",
  creditsOrg: "Out of credits: your organization's budget is used up. Use your own API key, or wait for the renewal.",
  suspended: "Your organization suspended your access. Sending is blocked.",
  paidUnavailable: "This model is unavailable right now. Try again later.",
  genericError: "Something went wrong.",
  fileStillMasking: "The file is still being masked. Wait for it to finish before sending.",
  maskFail: {
    remoteAuth: `Online masking is unavailable: an error on our side. ${NOT_MASKED} Try again later, or contact support.`,
    remoteNetwork: `Online masking is unreachable. ${NOT_MASKED} Check your connection, then try again.`,
    remoteUnknown: `Online masking is unavailable. ${NOT_MASKED} Try again later.`,
    local: `Offline masking is unavailable: the detection model could not load. ${NOT_MASKED} Try again, then reinstall the app if it keeps happening.`,
    modelAuth: `Masking is unavailable: the API key is missing or invalid. ${NOT_MASKED} Add the key in Settings → Privacy.`,
    modelNetwork: `Masking is unavailable: the model is unreachable. Check that Ollama is running and the address is correct. ${NOT_MASKED}`,
    modelUnknown: `Masking is unavailable. ${NOT_MASKED}`,
  },
  token: {
    outage: (brand) =>
      `The ${brand} sign-in server is not responding. Nothing was sent. Check your connection, then try again.`,
    freeModel: (brand) => `Sign in again to continue. This free model only needs your ${brand} account.`,
    unknownTier: (brand) => `This model runs through your ${brand} account. You are signed out. Sign in again.`,
    paidTier: (brand) => `Your ${brand} plan covers this model. You are signed out. Sign in again.`,
    freeTier: (brand) => `This model is included in the ${brand} plan. Subscribe to use it, or add your own API key.`,
  },
} satisfies Messages["runtime"]["send"];

export const runtimeFiles = {
  notMaskedHere: (categories) => `Turned-off categories, not masked here: ${categories}`,
  notMaskedMore: (more) => ` and ${more} more`,
  docMaskFailed:
    "Masking failed for this document. Nothing is masked in these views, and sending stays blocked until it succeeds.",
  retryMasking: "Retry masking",
  cutHere: (rest, max) =>
    `Cut here. The remaining ${rest} characters are not sent: each document is cut at ${max} characters.`,
  maskSelection: (value) => `Mask "${value}"`,
  imageOnlyZone:
    "Image area (logo, scan), not part of the sent text. Masking it only matters if the document is sent as images.",
  sheetHasMasked: (name) => `${name}: contains masked data`,
  sheetCutRows: (row) =>
    `Send cut short: only rows 1 to ${row} are sent to the model. Grayed-out rows are not sent, so they do not need masking.`,
  sheetCutAll: "Send cut short: this file is over the send limit, so no rows are sent to the model.",
  sheetPreviewCut: (rows, cols) => `Preview cut short (${rows} rows × ${cols} columns max).`,
  skillsNothing: (brand) =>
    `Nothing recognizable here. ${brand} looks for folders that contain a "SKILL.md", or .md files dropped directly.`,
  skillsDropUnreadable: "Could not read what you dropped.",
  skillsDropSub: [
    "The ", { code: ".claude/skills" }, " folder, a single skill, a ", { code: ".md" },
    " file, or the ", { code: ".zip" }, " uploaded to claude.ai.",
  ],
  skillsNeedsFiles: (n) =>
    `Uses ${n} file${n === 1 ? "" : "s"} from its folder. Only the instructions will be imported.`,
  skillsAsWorkflowTip: "Filed under routines. Click to make it a skill.",
  skillsAsSkillTip: "Filed under skills. Click to make it a routine.",
  skillsWorkflow: "Workflow",
  skillsSkill: "Skill",
  skillsNote:
    'An existing name is never overwritten: the import adds "(2)". You can run the import again safely, or drop another folder here to change the source.',
  folderFallbackName: "folder",
  folderOfferOne: (brand, name) => `Give ${brand} access to the "${name}" folder?`,
  folderOfferMany: (brand, n) => `Give ${brand} access to these ${n} folders?`,
  folderOfferNote: (brand) =>
    `A system window will open on this folder for you to confirm. ${brand} cannot grant itself a folder.`,
  folderGranted: (path) => `Folder allowed: ${path}`,
  folderAlready: (path) => `This folder is already allowed: ${path}`,
  folderUnavailable: "Local folders are not available on this platform.",
  folderRefused: (message) => `Access not granted: ${message}`,
  importWrongProvider: (p) => `This file looks like a ${p} export. Select "${p}", then try again.`,
  importNothing: (p) =>
    `No conversations found. Check that this is the ${p} export (the .zip you received by email, or its conversations.json file).`,
  importNotJson: "This file does not contain a readable conversation export (JSON expected).",
  importZipUnreadable: "Could not read the archive. Try again with the original export zip.",
  importNoJsonInZip: 'No "conversations.json" file in this archive.',
} satisfies Messages["runtime"]["files"];

export const runtimeMisc = {
  egressSources: {
    browser: "Agent browser",
    "browser-favicon": "Agent browser",
    connector: "Connector",
    "mcp-connect": "Connecting a connector",
    "tool-result-fetch": "Download from a tool",
    "fetch-url": "Download from a tool",
    "link-preview": "Link preview",
    "web-fetch-many": "Reading web pages",
    "model-catalogue": "Model catalog",
    embeddings: "Semantic index",
    "safe-fetch": "Download",
    unknown: "Unattributed",
  },
  dropRegions: {
    center: "Move here",
    left: "Split left",
    right: "Split right",
    top: "Split top",
    bottom: "Split bottom",
  },
  login: {
    generic: "Not possible right now. Check your connection and try again.",
    rateLimit: "Too many attempts. Wait a moment, then try again.",
    network: "Network unavailable. Check your connection and try again.",
    signupsClosed:
      "No account uses this address, and sign-ups are closed for now. Check the spelling. If it is correct, we have not opened access for it yet.",
  },
  megabytes: (n) => `${n} MB`,
  gigabytes: (n) => `${n} GB`,
  billingNetwork: "Could not reach the payment service. Check your network.",
  feedback: {
    signedOut: "Sign in to send feedback.",
    unavailable: "Sending failed on our side. Try again in a moment. Your message is still here.",
    network: "Could not send. Check your connection. Your message is still here.",
  },
  mail: {
    truncated: "\n[… log cut to fit in an email]",
    field: (label, value) => `${label}: ${value}`,
    mood: "Mood",
    context: "— Technical context —",
    version: "Version",
    channel: "Channel",
    screen: "Screen",
    model: "Model",
    level: "Level",
    install: "Installation",
    journal: "— Log (already masked) —",
    subject: (category, product) => `[${category}] ${product} feedback`,
  },
} satisfies Messages["runtime"]["misc"];
