/**
 * The EN catalogue's « guide » slice — translated from the source (`../fr/guide.ts`).
 *
 * ⚠️ Every assertion is a PROMISE about where the data goes (rule 8):
 * it translates word for word, neither softened nor hardened. `ui/src/help/guide.test.ts`
 * re-checks it against the real defaults, in this language as in the other.
 *
 * `satisfies` per entry: the compiler demands EXACTLY the contract's keys
 * (`../messages/guide.ts`), ni plus ni moins.
 */
import type { Messages } from "../messages";

export const guide = {
  protection: {
    title: (brand) => `What ${brand} does for you`,
    lead: (brand) =>
      `You write normally. Before your message is sent, ${brand} finds sensitive data (names, emails, phone numbers, addresses, account numbers) and replaces it with substitutes. The model sees only the substitutes. You see the real values, in your message and in the reply. This is masking: unlike a blacked-out passage, the model gets complete, coherent text.`,
    points: [
      () => "Detection runs on your device, before anything is sent. Nothing is sent out for analysis.",
      () => "Under each sent message, a short note shows how many items were masked.",
      () =>
        "Click a highlighted word to unmask it, or select other text to mask it.",
      () =>
        "Public figures and major brands are not masked: they do not identify your client or matter. The Strict level masks them too. Countries are never masked.",
      () =>
        "If a conversation has no sensitive data, nothing is replaced and the counter shows zero.",
      () =>
        "Add code names or nicknames that detection cannot recognize to the Vault. They are masked in every conversation.",
    ],
  },
  firstMessage: {
    title: () => "Your first message",
    lead: (brand) =>
      `A free model is already selected and works with your ${brand} account. Type a message and send it, or click an example on the home screen.`,
    points: [
      () => "The model name is under the message box. Click it to switch models.",
      (brand) =>
        `Some models need your own API key. ${brand} tells you when you send, and offers to add one.`,
      () =>
        "Type / in the message box for your skills, your routines and “remember that…”.",
    ],
  },
  models: {
    title: () => "Included models, or your key",
    lead: (brand) =>
      `You can reach a model in two ways, and you can mix them. Included models work with your ${brand} account, with nothing to set up. A free model is selected to start. Other models use your own provider API key.`,
    terms: [
      {
        term: () => "Free",
        def: (brand) =>
          `Included with your ${brand} account, no key needed. Usage is limited: speed and availability depend on the provider.`,
      },
      {
        term: (brand) => `Included with your ${brand} account`,
        def: (brand) =>
          `Models provided by ${brand}, most of them hosted in France. No key to manage.`,
      },
      {
        term: () => "With your own key",
        def: () =>
          `You add your OpenAI, Anthropic, Mistral… API key, and your provider bills you. Masking works the same way.`,
      },
    ],
    points: [
      () =>
        "In the model picker, a badge marks models you cannot use yet. Click the badge to see what to do.",
      (brand) =>
        `If you cannot use a model yet, nothing is sent: ${brand} blocks the message and shows your two options below it.`,
      () => "Your API keys stay encrypted on this device and are never sent to the model.",
    ],
  },
  sections: {
    title: () => "Finding your way around",
    lead: () =>
      "The left sidebar leads to each section of the app. Hover over an icon to see its name. Click the logo at the top to expand the sidebar.",
  },
  words: {
    title: (brand) => `${brand} glossary`,
    lead: () => "The terms used throughout the app, and what each one means exactly.",
    terms: [
      {
        term: () => "To mask",
        def: () =>
          "Replace sensitive data with a substitute before sending, then restore the real value in the reply.",
      },
      {
        term: () => "Vault",
        def: () =>
          "Terms that are always masked, in every conversation and with every model.",
      },
      {
        term: () => "Memory",
        def: (brand) =>
          `What ${brand} keeps from one conversation to the next, so you don't have to repeat yourself.`,
      },
      {
        term: () => "Skill",
        def: () => "An instruction you reuse as-is in your conversations.",
      },
      {
        term: () => "Routine",
        def: () => "A skill that runs actions in your connected services.",
      },
      {
        term: () => "Connector",
        def: () =>
          "A service you connect (calendar, email, files) so the model can use it. Any action that writes data asks for your approval.",
      },
    ],
  },
  data: {
    title: () => "Where your data goes",
    lead: () =>
      "Your conversations, files, Vault and memory stay on your device, encrypted. Only your masked messages are sent to a model.",
    points: [
      () =>
        "Memory is stored on your device, not on a server. It is masked whenever it is sent to a model.",
      () =>
        "The shield icon at the bottom of the left sidebar opens the privacy report: everything that was masked, by category.",
      () =>
        "Usage statistics are anonymous, never contain your messages, and can be turned off in Settings.",
    ],
  },
  releases: {
    title: () => "What's new",
    lead: (brand) =>
      `What changed in ${brand}, version by version, most recent first. It is the same list sent by email with each release.`,
    points: [
      (brand) => `Opening this page only downloads the list of changes. ${brand} sends nothing from your conversations.`,
      () =>
        "To see which version is installed, or to install another: Settings → Advanced → Versions.",
    ],
  },
} satisfies Messages["guide"];
