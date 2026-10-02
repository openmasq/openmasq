/**
 * The EN catalogue's « cards » slice — translated from the source (`../fr/cards.ts`).
 *
 * `satisfies` per entry: the compiler demands EXACTLY the contract's keys
 * (`../messages/cards.ts`), ni plus ni moins.
 */
import type { Messages } from "../messages";

export const cards = {
  welcome: {
    subtitle:
      "Write freely: names, emails and numbers are masked before they reach the model.",
    seeExamples: "See examples",
    seeOthers: "See the others",
  },

  transparency: {
    ariaLabel: "What the model saw",
    eyebrow: "Transparency",
    note: "Masking was applied automatically.",
    later: "Later",
    open: "See what the model saw",
    title: (n) => `${n} item${n === 1 ? "" : "s"} masked in this exchange`,
    theModel: "The model",
    desc: (modelName) =>
      `${modelName} never received these values. They were replaced with substitutes before sending, then restored in the reply you are reading. Open the comparison to see your message and what was actually sent, side by side.`,
  },

  memoryProposal: {
    eyebrow: "Memory",
    note: "On your device · encrypted · always masked before it reaches a model",
    decline: "No thanks",
    activate: "Turn on",
    title: (brand) => `${brand} can remember what matters`,
    desc: (brand) =>
      `This conversation includes facts worth keeping. With automatic memory, ${brand} saves your clients, projects and preferences from text that is already masked, then recalls them in later conversations when relevant. Nothing new is sent. You can also say “remember that…” at any time.`,
  },

  redactionIntro: {
    ariaLabel: "How masking works",
    title: "How masking works",
    sub: "What is masked, what is not, and why the count can be zero",
    closeTip: "Don't show again. This section stays in Help.",
    close: "Don't show again",
  },

  integration: {
    manySuggested: (n) => `${n} suggested connectors`,
    secureNote: "Secure connection · encrypted access · revoke any time",
    connectTools: "Connect your tools to continue",
    tileConnected: (name) => `${name} · connected`,
    tileConnect: (name) => `Connect ${name}`,
    activate: "Turn on",
    connect: (name) => `Connect ${name}`,
    suggested: "Suggested connector",
    connectedEyebrow: (name) => `${name} · connected`,
    connectedResume: (brand) => `Connected. ${brand} can continue.`,
    resume: "Continue",
    builtinNote: (brand) => `Built into ${brand}. No third-party account needed.`,
    activateTitle: (name) => `Turn on ${name} to continue`,
    connectTitle: (name) => `Connect ${name} to continue`,
  },

  banners: {
    attachmentIgnored: "Attachment ignored",
  },

  writeConfirm: {
    ariaLabel: "Action confirmation",
    cancel: "Cancel",
    target: "Target",
    note: "These are your real values. This is exactly what will be sent.",
    attachmentsWarning: (n) =>
      n === 1
        ? "1 file will be attached and sent unmasked:"
        : `${n} files will be attached and sent unmasked:`,
    details: (tool) => `Technical details (${tool})`,
    scopeNote: (tool) => `Once allowed, “${tool}” will not ask again in this conversation.`,
    navExfil: {
      eyebrow: "Web browsing",
      title: (host) => `Open ${host}?`,
      titleNoHost: "Open this page?",
      desc: "This link includes data from your conversation. Open it only if you expect that data to be sent.",
      confirm: "Open",
    },
    attachments: {
      eyebrow: "Confirmation required",
      title: "Send these files?",
      desc: (server) => `${server} will receive your original files, unmasked.`,
      confirm: "Send",
    },
    action: {
      eyebrow: "Confirmation required",
      title: "Allow this action?",
      desc: (server) =>
        `The assistant is asking ${server} to run the action below. It can create, change or delete data. Check it before you allow it.`,
      confirm: "Allow",
    },
  },
} satisfies Messages["cards"];
