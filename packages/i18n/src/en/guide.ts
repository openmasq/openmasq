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
      `You write normally. Before your message leaves, ${brand} spots the sensitive data — names, emails, phone numbers, addresses, account numbers — and replaces it with fake values. The model only ever works on those fake values; you keep seeing the real ones, in your message as in the reply. That replacement is what we call masking, like the blacked-out passages of an official document.`,
    points: [
      () => "The detection runs on your machine, before anything is sent — nothing leaves to be analysed.",
      () => "Under every sent message, a small line says how many items were protected.",
      () =>
        "You stay in control: click a highlighted word to leave it in clear, or select another one to mask it.",
      () =>
        "Public figures and major brands stay in clear: they do not identify your case. The Strict level masks them too; countries are never masked.",
      () =>
        "A conversation with no personal data is normal: nothing is replaced, the counter stays at zero — the protection was there, it simply had nothing to do.",
      () =>
        "A code name or a nickname no detector could guess goes into the Vault: it will be masked everywhere, in every conversation.",
    ],
  },
  firstMessage: {
    title: () => "Your first message",
    lead: (brand) =>
      `There is nothing to set up. A free model is already selected and works with your ${brand} account: write, send. The examples on the home screen go out in one click if you just want to see what it looks like.`,
    points: [
      () => "The model's name sits under the message box — click it to switch.",
      (brand) =>
        `Some models need your own key: ${brand} tells you at send time, and offers to set it up.`,
      () =>
        "Type / in the message box to find your skills, your routines and “remember that…”.",
    ],
  },
  models: {
    title: () => "Included models, or your key",
    lead: (brand) =>
      `There are two ways to reach a model, and you can mix them. The included models are used with your ${brand} account, with nothing to pay and nothing to set up — a free model is the starting point. The others go through your own key at the provider.`,
    terms: [
      {
        term: () => "Free",
        def: (brand) =>
          `Included with your ${brand} account, with no key. Usage is limited: throughput and availability depend on the provider.`,
      },
      {
        term: (brand) => `Included with your ${brand} account`,
        def: (brand) =>
          `The models ${brand} provides — most of them hosted in France — with no key to manage.`,
      },
      {
        term: () => "With your own key",
        def: () =>
          `You plug in your OpenAI, Anthropic, Mistral… key: your provider bills you. The protection is exactly the same.`,
      },
    ],
    points: [
      () =>
        "In the picker, a model you cannot use yet carries a badge — click it, and it explains what to do.",
      (brand) =>
        `Nothing is ever sent first: if a model is out of reach, ${brand} refuses the send and offers you both ways out under the message.`,
      () => "Your keys stay encrypted on this machine, and are never passed to the model.",
    ],
  },
  sections: {
    title: () => "Finding your things",
    lead: () =>
      "The left bar leads to the six places in the app. Hover an icon for its name; click the logo, at the top, to unfold the bar.",
  },
  words: {
    title: (brand) => `The words ${brand} uses`,
    lead: () => "A few terms come up often in the app. Here they are, once and for all.",
    terms: [
      {
        term: () => "To mask",
        def: () =>
          "Replace a piece of sensitive data with a fake value before sending — and restore the real one on arrival.",
      },
      {
        term: () => "The vault",
        def: () =>
          "Your words to mask systematically, whichever model and whichever conversation.",
      },
      {
        term: () => "The memory",
        def: (brand) =>
          `What ${brand} carries from one conversation to the next so you don't have to repeat yourself.`,
      },
      {
        term: () => "A skill",
        def: () => "An instruction you reuse as-is in your conversations.",
      },
      {
        term: () => "A routine",
        def: () => "A skill that puts your connected services to work.",
      },
      {
        term: () => "A connector",
        def: () =>
          "A service you plug in — calendar, email, files — so the model can use it, with your approval on every action that writes.",
      },
    ],
  },
  data: {
    title: () => "Where your data goes",
    lead: () =>
      "Your conversations, your files, your vault and your memory stay on your machine, encrypted. What goes to a model is your messages once masked — and nothing else.",
    points: [
      () =>
        "The memory goes through no server to “remember”: it is local, and leaves masked on every send.",
      () =>
        "The shield, at the bottom of the left bar, opens the privacy report: everything that was protected, category by category.",
      () =>
        "Usage statistics are anonymous, never contain your messages, and can be turned off in Settings.",
    ],
  },
  releases: {
    title: () => "What's new",
    lead: (brand) =>
      `What changed in ${brand}, version by version, most recent first. It is the same list sent by email on each release — it is here so you don't have to go looking for it.`,
    points: [
      (brand) => `Reading this page sends nothing: ${brand} asks for the list of changes, never the other way round.`,
      () =>
        "To see which version runs on this machine, or install another: Settings → Advanced → Versions.",
    ],
  },
} satisfies Messages["guide"];
