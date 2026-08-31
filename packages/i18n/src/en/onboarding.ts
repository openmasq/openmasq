/**
 * Tranche « onboarding » du catalogue EN — traduit de la source (`../fr/onboarding.ts`).
 *
 * `satisfies` par entrée : le compilateur exige EXACTEMENT les clés du contrat
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
      `Before a message leaves, ${brand} spots the sensitive data and replaces it with fake values. The model only ever works on those — you keep seeing the real ones. That replacement is what we call masking.`,
    notoriety: {
      lead: "Public figures, major brands and countries are ",
      strong: "never masked",
      tail: ": a general-knowledge question stays a general-knowledge question.",
    },
    webReveal: {
      lead: (brand) => `Before a web search, ${brand} `,
      strong: "offers to reveal",
      tail: " what is masked — otherwise the search would be about a company or a city that does not exist.",
    },
  },

  places: {
    eyebrow: "YOUR SPACE",
    title: "Six places, six uses",
    sub: "The left bar leads everywhere. There is nothing to set up: each place fills as you work.",
  },

  access: {
    eyebrow: "MODEL ACCESS",
    titleServed: "A subscription, or your key",
    titleIncluded: "Your account, or your key",
    titleUnserved: "Your key, or a local model",
    subServed:
      "You can change your mind whenever you like. Either way, masking applies before every send.",
    subUnserved:
      "A key, a model running on your own machine, or your Claude Code / Codex subscription — masking applies before every send, whichever road you take.",
  },

  ready: {
    title: "The protection is already on",
    eyebrow: "YOU'RE SET",
    subServed: (brand) =>
      `It depends on no key: from your very first message, masking applies. A free model is already selected and works with your ${brand} account.`,
    subUnserved:
      "It depends on no account: from your very first message, masking applies. All that is missing is access to a model — a key, a local server, or your CLI.",
    modelHint:
      "The model's name sits under the message box — click it to switch, or to plug in access if you skipped that step.",
    slashHint: {
      lead: "Type ",
      strong: "/",
      tail: " in the message box for your skills, your workflows and “remember that…”.",
    },
    helpHint: {
      lead: "Not sure? ",
      strong: "Help",
      tail: ", at the bottom of the right bar, covers all of this — the demo included.",
    },
    tuneRedaction: "Fine-tune the masking",
  },

  tune: {
    eyebrow: "MASKING",
    title: "Fine-tune",
    sub: "These settings are already good by default. You will find them any time in Settings → Account.",
  },

  keyChoice: {
    subscription: {
      title: (brand) => `My ${brand} account`,
      sub: "No key to manage: the models draw on your subscription's credits.",
    },
    included: {
      sub: "No key to manage: the included models are served on your account, most of them hosted in France.",
    },
    ownKey: {
      title: "My own API key",
      sub: "An OpenRouter key opens every model, the free ones included, on your account. One click to get it; it stays encrypted on this machine.",
    },
    recommended: "recommended",
    savedKey: (provider) => `${provider} key saved — you're ready.`,
    connect: "Get a key for free",
    connecting: "Authorising in your browser…",
    retry: "Retry",
    connectTip: (brand) => `${brand} connects to your OpenRouter account: your credits, your quota.`,
    connectHint: "OpenRouter opens, you accept, the key comes back encrypted here — nothing to copy.",
    manualCreate: "Create the key by hand",
    manualHave: "I already have an OpenRouter key",
    errorIncomplete: "The connection did not finish. Try again — nothing was saved.",
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
  },
} satisfies Messages["onboarding"];
