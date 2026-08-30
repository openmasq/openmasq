/**
 * Tranche « settings » du catalogue EN — traduit de la source (`../fr/`).
 *
 * `satisfies` par entrée : le compilateur exige EXACTEMENT les clés du contrat
 * (`../messages/settings.ts`), ni plus ni moins, tranche par tranche — donc une clé
 * oubliée nomme SA tranche plutôt que le catalogue entier.
 */
import type { Messages } from "../messages";

export const settings = {
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
} satisfies Messages["settings"];
