/**
 * The ENGLISH catalogue — a translation of the French source (`fr.ts`).
 *
 * `satisfies Messages`: the compiler demands EXACTLY the contract's keys. A key added to
 * `fr.ts` that is not mirrored here fails `tsc` — which is how "fully translated, French
 * AND English" stays true by construction rather than by vigilance.
 */
import type { Messages } from "./messages";

export const en = {
  common: {
    cancel: "Cancel",
    save: "Save",
    close: "Close",
    retry: "Retry",
    delete: "Delete",
    confirm: "Confirm",
    loading: "Loading…",
    genericError: "Something went wrong. Please try again.",
  },
  nav: {
    ariaLabel: "Navigation",
    chats: "Chats",
    competences: "Skills",
    memory: "Memory",
    vault: "Vault",
    library: "Library",
    settings: "Settings",
  },
  billing: {
    checkoutOpenFailed: "Couldn't open the payment page. Please try again.",
  },
  chrome: {
    expandSidebar: "Expand the sidebar",
    newChat: "New conversation",
    search: "Search",
    searchShortcut: "Search (⌘K)",
    memoryFresh: "Memory — new entries noted",
    privacyReportTip: (n) => `${n} item(s) protected — privacy report`,
    privacyReport: "Privacy report",
    account: "Account and settings",
    conversations: "Conversations",
    noConversations: "No conversations yet.",
    you: "You",
    privateSpace: "Private space",
    private: "Private",
    launchPinned: (what) => `Run: ${what}`,
    deleteConversationAction: "Delete the conversation",
    deleteConversation: "Delete this conversation?",
    deleteConversationBody: (title) =>
      `“${title}” and all of its messages will be deleted from this device. This cannot be undone.`,
    untitledConversation: "New conversation",
  },
  sections: {
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
    competences: {
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
      keywords:
        "help guide how does it work get started tutorial manual documentation aide",
    },
  },
  chat: {
    backToConversations: "Back to conversations",
    toggleSidebar: "Toggle the sidebar",
    more: "More",
    rowActions: "Actions",
    rename: "Rename",
    renameConversation: "Rename the conversation",
    generating: "Generating",
    closeTab: "Close the tab",
    hiddenTabsTip: (n) => `${n} tab${n > 1 ? "s" : ""} out of view — scroll`,
    hiddenTabs: (n) => `${n} tab${n > 1 ? "s" : ""} out of view`,
    splitScreen: "Split the screen",
    splitLeft: "To the left",
    splitRight: "To the right",
    redactionSummary: (n) => `Masking · ${n} protected`,
    seeWhatTheModelSaw: "See what the model saw",
    debugLog: "Debug log",
  },
  settings: {
    appearance: {
      title: "Appearance",
      darkModeLabel: "Dark mode",
      darkModeHint: "Switches the app to dark colours.",
    },
    tabs: {
      account: {
        label: "Account",
        title: "Account",
        sub: () => "Your identity on this device, the look of the app, and your data.",
        kw: "profile name email address theme dark mode api key redaction rules categories default model preferences sign out language langue compte",
      },
      privacy: {
        label: "Privacy",
        title: "Privacy",
        sub: (brand) => `What ${brand} protects before a model ever receives it.`,
        kw: "redaction masking privacy confidentialite protection categories rules level standard strict custom tokens pseudonyms report protected data",
      },
      models: {
        label: "Models",
        title: "Model list",
        sub: () => "The models your access opens — plus a local model on your own machine.",
        kw: "model default gpt claude gemini mistral deepseek llm provider api key local ollama lm studio address localhost modeles",
      },
      mcp: {
        label: "Connectors",
        title: "Connectors & tools",
        sub: () => "The connectors available inside your conversations.",
        kw: "connectors integrations gmail notion stripe github slack tools server oauth connecteurs",
      },
      browser: {
        label: "Browser",
        title: "Browser",
        sub: () => "The built-in browser the model can drive, under your control.",
        kw: "web search engine duckduckgo google agent navigation security navigateur",
      },
      audit: {
        label: "Log",
        title: "Audit log",
        sub: () => "The redaction history, filterable and searchable.",
        kw: "log history security traceability redaction masking export journal",
      },
      usage: {
        label: "Usage",
        title: "Usage",
        sub: () => "What you have spent, in total and per model.",
        kw: "consumption credits cost spend tokens quota statistics",
      },
      sync: {
        label: "Your devices",
        title: "Sync",
        sub: () => "Your devices and the sync between them.",
        kw: "devices appareils cloud encryption backup sync",
      },
      org: {
        label: "Organisation",
        title: "Organisation",
        sub: () => "The organisation this account belongs to.",
        kw: "team members domain sso company administration organization equipe",
      },
      billing: {
        label: "Billing",
        title: "Billing",
        sub: () => "Your subscription, the credits it includes, and invoicing.",
        kw: "invoice stripe card subscription plan price receipt portal paiement facture",
      },
      versions: {
        label: "Versions",
        title: "Versions",
        sub: () => "Release channels and the update notes.",
        kw: "changelog update beta stable release notes channel news",
      },
    },
    entries: {
      darkMode: { label: "Dark mode", kw: "dark theme appearance night colour sombre" },
      importConversations: {
        label: "Import conversations",
        kw: "import chatgpt claude export history",
      },
      messageBilling: {
        label: "How messages are billed",
        kw: "subscription credits key byo own account pay",
      },
      notifyOnReply: {
        label: "Notify me when a reply arrives",
        kw: "notification system banner alert reply ready background",
      },
      anonymousStats: {
        label: "Anonymous usage statistics",
        kw: "analytics telemetry consent anonymous",
      },
      transparencyLog: {
        label: "Transparency · technical log",
        kw: "transparency debugging debug log wire exact message what the model saw comparison",
      },
      linkPreviews: { label: "Link previews", kw: "link preview thumbnail url ip" },
      protectionLevel: {
        label: "Protection level",
        kw: "level standard strict custom categories rules redaction",
      },
      showTokens: {
        label: "Show tokens rather than pseudonyms",
        kw: "tokens pseudonyms person1 iban display",
      },
      modelSeesTokens: {
        label: "The model only ever sees tokens",
        kw: "tokens markers pseudonyms model anonymisation person1 sending",
      },
      localModel: {
        label: "A model on your own computer",
        kw: "local ollama lm studio localhost address openai compatible",
      },
      favouriteModels: {
        label: "Favourite models",
        kw: "favourites favorite star short list picker customise pin shortcut",
      },
      claudeSubscription: {
        label: "Your Claude subscription",
        kw: "claude code cli subscription anthropic no key",
      },
      chatgptSubscription: {
        label: "Your ChatGPT subscription",
        kw: "codex cli openai chatgpt subscription no key",
      },
      writeConfirm: {
        label: "Confirming actions",
        kw: "confirmation write gate stricter tools",
      },
      connectedDevices: {
        label: "Connected devices",
        kw: "devices sync revoke passphrase",
      },
      environment: {
        label: "Environment",
        kw: "environment staging production switch beta test access",
      },
    },
    groups: {
      account: "Account",
      privacy: "Privacy",
      aiTools: "AI & tools",
      devices: "Your devices",
      org: "Organisation",
      app: "App",
      other: "Other",
    },
    inTab: (tabTitle) => `In “${tabTitle}”`,
  },
  language: {
    label: "Language",
    hint: "The app's own language. Your conversations keep the one you write in.",
    // Endonyms — each language named in its OWN tongue, identical across catalogues.
    names: { fr: "Français", en: "English" },
  },
} satisfies Messages;
