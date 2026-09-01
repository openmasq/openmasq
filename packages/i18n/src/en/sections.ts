/**
 * The EN catalogue's « sections » slice — translated from the source (`../fr/`).
 *
 * `satisfies` per entry: the compiler demands EXACTLY the contract's keys
 * (`../messages/sections.ts`), no more and no less, slice by slice — so a forgotten
 * key names ITS slice rather than the whole catalogue.
 */
import type { Messages } from "../messages";

export const sections = {
  chats: {
    label: "Conversations",
    tip: "Conversations — your exchanges with the models",
    guide: (brand) =>
      `This is where you write. Type the way you speak: ${brand} masks sensitive data before sending, and restores your real values in the reply. The model's name sits under the message box — click it to switch at any time.`,
    keywords: "chat conversation discussion message write new thread",
  },
  library: {
    label: "Library",
    tip: "Library — the files from your conversations, already masked",
    subtitle: "Every file and image from your conversations, protected and ready to reuse.",
    guide:
      "Every image and document shared in a conversation lands here automatically, already masked. Find them by type, and reuse them elsewhere in one click.",
    keywords: "files documents images attachments pdf downloads bibliothèque",
  },
  skills: {
    label: "Skills",
    tip: "Skills — your reusable instructions",
    subtitle:
      "Your reusable instructions, filed by category. Use one in a click, or type / in the message box.",
    guide:
      "A good instruction you keep rewriting — a standard reply, a translation, a summary — is saved once and reused everywhere. Some also put your connected services to work (“gather my important emails from this week and draft a summary”): those are Routines, a category like any other. Type / in the message box to use one.",
    keywords:
      "prompts instructions message templates shortcuts compétences routines workflows automation connectors tools",
  },
  memory: {
    label: "Memory",
    tip: (brand) => `Memory — what ${brand} remembers from one time to the next`,
    subtitle: (brand) =>
      `What ${brand} carries from one conversation to the next, so you don't have to repeat yourself.`,
    guide:
      "So you don't re-explain who this client is or where that project stands every time. Say “remember that…” in a conversation, select a passage and choose “Remember”, or create an entry here. Everything stays on your machine, and leaves masked like the rest.",
    keywords: "memories entries profile remember recall context mémoire",
  },
  vault: {
    label: "Vault",
    tip: "Vault — the words to mask in every exchange",
    subtitle:
      "Your always-masked terms — code names, accounts, identifiers — replaced before every send, whichever model you use.",
    guide: (brand) =>
      `Your own words: a code name, an account number, an identifier. Add them once, and ${brand} masks them in everything you send, without exception.`,
    keywords: "mask always terms words secrets code names vault coffre",
  },
  helpEntry: {
    title: (brand) => `Help — getting started with ${brand}`,
    sub: (brand) => `Masking, the words ${brand} uses, and what each section is for.`,
    keywords: "help guide how does it work get started tutorial manual documentation aide",
  },
} satisfies Messages["sections"];
