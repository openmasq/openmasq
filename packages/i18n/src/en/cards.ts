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
    note: "Nothing to switch on: this already happened.",
    later: "Later",
    open: "See what the model saw",
    title: (n) => `${n} piece${n === 1 ? "" : "s"} of information protected during this exchange`,
    theModel: "The model",
    desc: (modelName) =>
      `${modelName} never received these values: they were replaced by pseudonyms before sending, then restored in the reply you are reading. Open the comparison to see your message and what actually left, side by side.`,
  },

  memoryProposal: {
    eyebrow: "Memory",
    note: "Local · encrypted · always masked before it reaches a model",
    decline: "No thanks",
    activate: "Turn on",
    title: (brand) => `${brand} can remember what matters`,
    desc: (brand) =>
      `This conversation holds durable facts. With automatic memory, ${brand} notes your clients, projects and preferences on its own — from text that is already masked, so nothing new leaves your machine — and brings them back in every conversation where they help. You can also say “remember that…” at any time.`,
  },

  redactionIntro: {
    ariaLabel: "Understanding my masking",
    title: "Understanding my masking",
    sub: "What is masked, what stays in clear, and why the counter can sit at zero",
    closeTip: "Close for good — the chapter stays in Help",
    close: "Close for good",
  },

  integration: {
    manySuggested: (n) => `${n} suggested integrations`,
    secureNote: "Secure connection · encrypted access, revocable at any time",
    connectTools: "Connect your tools to continue",
    tileConnected: (name) => `${name} · connected`,
    tileConnect: (name) => `Connect ${name}`,
    activate: "Turn on",
    connect: (name) => `Connect ${name}`,
    suggested: "Suggested integration",
    connectedEyebrow: (name) => `${name} · connected`,
    connectedResume: (brand) => `Connected — ${brand} can carry on`,
    resume: "Continue",
    builtinNote: (brand) => `Built into ${brand} — nothing to connect, no third-party account.`,
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
    note: "The values shown are your real data — this is exactly what will leave.",
    attachmentsWarning: (n) =>
      n === 1
        ? "1 file of your data will be attached (sent in clear):"
        : `${n} files of your data will be attached (sent in clear):`,
    details: (tool) => `Technical details (${tool})`,
    scopeNote: (tool) => `Once allowed, “${tool}” will not ask again in this conversation.`,
    navExfil: {
      eyebrow: "Web browsing",
      title: (host) => `Open ${host}?`,
      titleNoHost: "Allow this navigation?",
      desc: "The address carries data from the conversation — check that it is expected.",
      confirm: "Open",
    },
    attachments: {
      eyebrow: "Confirmation required",
      title: "Send these files?",
      desc: (server) => `This send through ${server} carries your real files, un-masked.`,
      confirm: "Send",
    },
    action: {
      eyebrow: "Confirmation required",
      title: "Allow this action?",
      desc: (server) =>
        `The assistant is asking ${server} to run the action below. It can create, change or delete data — check its contents before allowing it.`,
      confirm: "Allow",
    },
  },
} satisfies Messages["cards"];
