/**
 * The EN catalogue's « settings » slice — translated from the source (`../fr/`).
 *
 * `satisfies` per entry: the compiler demands EXACTLY the contract's keys
 * (`../messages/settings.ts`), no more and no less, slice by slice — so a forgotten
 * key names ITS slice rather than the whole catalogue.
 */
import type { Messages } from "../messages";

export const settings = {
  appearance: {
    title: "Appearance",
    darkModeLabel: "Dark mode",
    darkModeHint: "Use a dark theme.",
  },
  tabs: {
    account: {
      label: "Account",
      title: "Account",
      sub: () => "Your identity on this device, the look of the app, and your data.",
      kw: "profile name email address theme dark mode preferences sign out language langue compte organisation organization team members sso company administration",
    },
    privacy: {
      label: "Privacy",
      title: "Privacy",
      sub: (brand) => `What ${brand} masks before anything reaches a model.`,
      kw: "redaction masking privacy confidentialite protection categories rules level light enhanced strict reinforced allege renforce custom placeholders substitutes pseudonyms report protected data",
    },
    models: {
      label: "Models",
      title: "Model list",
      sub: () => "Models available with your API keys or plan, plus a model running on your computer.",
      kw: "model default gpt claude gemini mistral deepseek llm provider api key local ollama lm studio address localhost modeles",
    },
    mcp: {
      label: "Connectors",
      title: "Connectors",
      sub: () => "The connectors available inside your conversations.",
      kw: "connectors integrations gmail notion stripe github slack tools server oauth connecteurs agent security browser confirmation read-only domains",
    },
    browser: {
      label: "Browser",
      title: "Browser",
      sub: () => "The built-in browser's search engine.",
      kw: "web search engine duckduckgo google qwant ecosia brave startpage navigateur",
    },
    audit: {
      label: "Log",
      title: "Audit log",
      sub: () => "A searchable history of what was masked.",
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
    billing: {
      label: "Billing",
      title: "Billing",
      sub: () => "Your subscription, the credits it includes, and invoicing.",
      kw: "invoice stripe card subscription plan price receipt portal paiement facture",
    },
    versions: {
      label: "Versions",
      title: "Versions",
      sub: () => "Release channels and release notes.",
      kw: "changelog update beta stable release notes channel news",
    },
  },
  entries: {
    darkMode: { label: "Dark mode", kw: "dark theme appearance night color colour sombre" },
    importConversations: {
      label: "Import conversations",
      kw: "import chatgpt claude export history",
    },
    messageBilling: {
      label: "How messages are billed",
      kw: "subscription credits key byo own account pay included",
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
      label: "Detailed technical log",
      kw: "transparency debugging debug log wire exact message what the model saw comparison advanced options",
    },
    linkPreviews: { label: "Link previews", kw: "link preview thumbnail url ip" },
    protectionLevel: {
      label: "Protection level",
      kw: "level light enhanced strict reinforced standard custom categories rules masking redaction",
    },
    showTokens: {
      label: "Show placeholders ([PERSON1]) instead of substitutes",
      kw: "placeholders substitutes tokens pseudonyms person1 iban display",
    },
    modelSeesTokens: {
      label: "The model sees placeholders only",
      kw: "placeholders markers substitutes tokens pseudonyms model anonymization anonymisation person1 sending",
    },
    memoryAuto: {
      label: "Automatic memory extraction",
      kw: "memory cards extraction automatic silent remember to review notes",
    },
    localModel: {
      label: "Local model",
      kw: "local ollama lm studio localhost address openai compatible model id list network lan",
    },
    favouriteModels: {
      label: "Favorite models",
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
    antigravitySubscription: {
      label: "Your Google Antigravity subscription",
      kw: "antigravity agy cli google gemini subscription no key",
    },
    writeConfirm: {
      label: "Action confirmations",
      kw: "confirmation confirm every action write gate stricter reinforced tools agent",
    },
    browserSecurity: {
      label: "Agent browser security",
      kw: "agent browser read-only allowed domains injection security navigateur",
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
    app: "App",
    other: "Other",
  },
  inTab: (tabTitle) => `In “${tabTitle}”`,
} satisfies Messages["settings"];
