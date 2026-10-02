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
    tip: "Conversations — chat with the models",
    guide: (brand) =>
      `This is where you write. ${brand} masks sensitive data before sending and restores your real values in the reply. The model name is under the message box. Click it to switch models.`,
    keywords: "chat conversation discussion message write new thread",
  },
  library: {
    label: "Library",
    tip: "Library — files from your conversations",
    subtitle: "Every file and image from your conversations, ready to reuse.",
    guide:
      "Every image and document shared in a conversation appears here. Browse them by type and reuse them in one click.",
    keywords: "files documents images attachments pdf downloads bibliothèque",
  },
  skills: {
    label: "Skills",
    tip: "Skills — your reusable instructions",
    subtitle:
      "Your reusable instructions, filed by category. Use one in a click, or type / in the message box.",
    guide:
      "Save an instruction you write often, such as a standard reply, a translation or a summary, and reuse it anywhere. Skills that also use your connected services (“gather my important emails from this week and draft a summary”) are called Routines. Type / in the message box to use one.",
    keywords:
      "prompts instructions message templates shortcuts compétences routines workflows automation connectors tools",
  },
  memory: {
    label: "Memory",
    tip: (brand) => `Memory — what ${brand} remembers between conversations`,
    subtitle: (brand) =>
      `What ${brand} carries from one conversation to the next, so you don't have to repeat yourself.`,
    guide:
      "Save context so you don't have to re-explain a client or a project. Say “remember that…” in a conversation, select a passage and choose “Remember”, or create an entry here. Memory is stored on your computer and is masked before it reaches a model.",
    keywords: "memories entries profile remember recall context mémoire",
  },
  vault: {
    label: "Vault",
    tip: "Vault — terms to mask in every message",
    subtitle:
      "Terms that are always masked, such as code names, accounts and IDs. They are replaced before every send, whatever the model.",
    guide: (brand) =>
      `Add terms that must always be masked, such as a code name, an account number or an ID. ${brand} masks them in everything you send.`,
    keywords: "mask always terms words secrets code names vault coffre",
  },
  helpEntry: {
    title: (brand) => `Help: getting started with ${brand}`,
    sub: (brand) => `How ${brand} masks data, its key terms, and what each section does.`,
    keywords: "help guide how does it work get started tutorial manual documentation aide",
  },
} satisfies Messages["sections"];
