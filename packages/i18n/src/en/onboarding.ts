/**
 * The EN catalogue's « onboarding » slice — translated from the source (`../fr/onboarding.ts`).
 *
 * `satisfies` per entry: the compiler demands EXACTLY the contract's keys
 * (`../messages/onboarding.ts`), ni plus ni moins.
 */
import type { Messages } from "../messages";

export const onboarding = {
  skip: "Skip",
  back: "Back",
  next: "Next",
  start: "Start",

  redaction: {
    eyebrow: "MASKING",
    titleLead: "Write",
    titleHighlight: "freely",
    sub: (brand) =>
      `Before a message is sent, ${brand} finds sensitive data and replaces it with substitutes. The model sees only the substitutes. You keep seeing the real values.`,
    notoriety: {
      lead: "Public figures, major brands and countries are ",
      strong: "not masked",
      tail: " by default: they don't identify your client.",
    },
    webReveal: {
      lead: (brand) => `Before a web search, ${brand} `,
      strong: "offers to unmask",
      tail: " what is masked. Otherwise the search would run on substitutes that do not exist.",
    },
  },

  access: {
    eyebrow: "MODEL ACCESS",
    titleServed: "A subscription, or your key",
    titleIncluded: "Your account, or your key",
    titleUnserved: "Your key, or a local model",
    subServed:
      "You can change this later. Either way, masking runs before every message is sent.",
    subUnserved:
      "An API key, a model running on your machine, or your Claude Code / Codex subscription. Either way, masking runs before every message is sent.",
    titleAgents: "Your subscription, or a key",
    subAgents:
      "With Claude Code or Codex on this machine, your messages go through your subscription. No API key needed. Otherwise, use an API key or a local model. Either way, masking runs before every message is sent.",
  },

  ready: {
    title: "Masking is on",
    eyebrow: "YOU'RE SET",
    subServed: (brand) =>
      `Masking needs no key and applies from your first message. A free model is already selected and works with your ${brand} account.`,
    subUnserved:
      "Masking needs no account and applies from your first message. You only need access to a model: an API key, a local server, or your CLI.",
    modelHint:
      "The model name is under the message box. Click it to switch models, or to add access if you skipped that step.",
    slashHint: {
      lead: "Type ",
      strong: "/",
      tail: " in the message box for your skills, your routines and “remember that…”.",
    },
    helpHint: {
      lead: "Not sure? ",
      strong: "Help",
      tail: ", at the bottom of the right sidebar, covers all of this, including the demo.",
    },
    tuneRedaction: "Fine-tune masking",
  },

  tune: {
    eyebrow: "MASKING",
    title: "Fine-tune",
    sub: "The defaults are recommended. You can change them any time in Settings → Privacy.",
  },

  keyChoice: {
    subscription: {
      title: (brand) => `My ${brand} account`,
      sub: "No key to manage: models use your subscription credits.",
    },
    included: {
      sub: "No key to manage: included models run under your account, most of them hosted in France.",
    },
    ownKey: {
      title: "My own API key",
      sub: "An OpenRouter key gives access to every model, including free ones, billed to your account. Get one in a click. It stays encrypted on this machine.",
    },
    agent: {
      title: "My Claude Code / Codex subscription",
      sub: "Uses the subscription you already pay for. If the CLI is not installed or signed in, set it up here in two clicks. Each message counts against your personal subscription. No API key needed.",
      hint: "Each CLI's subscription and quota are shown in Settings → Models.",
    },
    recommended: "recommended",
    otherProvider: "Another provider",
    savedKey: (provider) => `${provider} key saved. You're ready.`,
    connect: "Get a key for free",
    connecting: "Waiting for approval in your browser…",
    retry: "Retry",
    connectTip: (brand) => `${brand} connects to your OpenRouter account. Usage is billed to your OpenRouter credits.`,
    connectHint: "Approve access on OpenRouter. The key is saved here, encrypted.",
    manualCreate: "Create the key manually",
    manualHave: "I already have an OpenRouter key",
    errorIncomplete: "The connection did not finish. Nothing was saved. Try again.",
    errorUnreachable: "Could not connect. Try again in a moment.",
    errorSaveFailed: "The key could not be saved. Try again.",
  },

  keySteps: {
    markDone: "Mark this step as done",
    openHost: (host) => `Open ${host} ↗`,
    placeholder: (provider, hint) => `${provider} key — ${hint}`,
    placeholderPlain: (provider) => `${provider} key`,
    save: "Save",
    saving: "Saving…",
    stepDone: (step) => `Mark step ${step} as done`,
    stepUndo: (step) => `Mark step ${step} as not done`,
  },
} satisfies Messages["onboarding"];
