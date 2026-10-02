/**
 * The EN catalogue's « byo » slice: « Mes clés » — the BYO form and its three tutorials.
 */
import type { Messages } from "../messages";

export const byo = {
  eyebrow: "MY KEYS",
  connect: "Connect",
  encryptedNote: "Your credentials are stored encrypted on this computer.",
  existing:
    "Credentials are already saved on this computer. Leave the fields empty to reuse them, or enter new ones to replace them.",
  onceLead: "Do this once.",
  onceTail: (family, others) =>
    ` The credentials created here will also serve your other ${family} services (${others}).`,
  stepDone: (n) => `Mark step ${n} as not done`,
  stepTodo: (n) => `Mark step ${n} as done`,
  markDone: "Mark this step as done",
  clientId: "Client ID",
  clientSecret: "Client secret",
  keepPlaceholder: "•••• saved. Leave empty to keep it",
  cancel: "Cancel",
  connecting: "Connecting…",
  keepAndConnect: "Keep and connect",
  noSpaces: "A client ID contains no spaces. Check what you pasted.",
  isApiKeyNotClientId:
    "This is an API key, not a client ID. The client ID comes from “Create OAuth client ID”.",
  googleSuffix: "A Google client ID ends with “.apps.googleusercontent.com”.",
  microsoftGuid: "A Microsoft application ID looks like 00000000-0000-0000-0000-000000000000.",
  secretNoSpaces: "A client secret contains no spaces. Check what you pasted.",
  secretIsClientId: "This is the client ID. The client secret is the second value.",
  secretPrefixWarn:
    "Google client secrets usually start with “GOCSPX-”. Check that this really is the client secret.",
  microsoft: {
    intro:
      "≈ 3 min. A Microsoft Entra app registration. Permissions are granted at sign-in.",
    note: "The address “http://127.0.0.1/callback” points to your own computer. The port does not matter.",
    s1: { lead: "Open the Microsoft Entra portal: ", link: "Register an application" },
    s2: {
      a: "Name it “",
      b: "”, then under ",
      c: "“Supported account types”",
      d: " choose “Accounts in any organizational directory and personal Microsoft accounts” (for work accounts as well as Outlook.com).",
    },
    s3: {
      a: "Under ",
      b: "“Redirect URI”",
      c: ", select the “Mobile and desktop applications” platform and enter ",
      d: "http://127.0.0.1/callback",
      e: ", then click “Register”. (You can also add it later in the “Authentication” tab.)",
    },
    s4: {
      a: "On the ",
      b: "“Overview”",
      c: " page, copy the “Application (client) ID” and paste it below. ",
      d: "No secret needed",
    },
  },
  github: {
    intro: "≈ 1 min. No app verification needed.",
    s1: {
      lead: "Create a GitHub OAuth app: ",
      link: "New OAuth App",
      tail: (brand) =>
        `. Name: “${brand}”. The Homepage and Callback URL fields accept any value (device flow does not use them).`,
    },
    s2: { a: "On the app's page, check ", b: "“Enable Device Flow”", c: ", then save." },
    s3: {
      a: "Copy the ",
      b: "Client ID",
      c: " (top of the page) and paste it below. ",
      d: "No secret needed",
    },
  },
  google: {
    intro:
      "≈ 3 min. Keeping the app in test mode gives you every feature without Google's verification review.",
    note: "The address “127.0.0.1” (your computer) is allowed automatically for a desktop app.",
    s1: { lead: "Create or pick a project: ", link: "New Google Cloud project" },
    s2: {
      enableOne: "Enable the API: ",
      enableMany: "Enable the APIs: ",
      and: " and ",
      tailOne: " → “Enable” button.",
      tailMany: " → “Enable” button for each.",
    },
    s3: {
      a: "Open the ",
      link: "OAuth consent screen",
      b: " → type ",
      c: "“External”",
      d: ", then under “Test users” add your Google address",
      e: " (this skips Google's verification).",
    },
    s4: {
      a: "Create the credentials: ",
      link: "Create OAuth client ID",
      b: " → application type ",
      c: "“Desktop app”.",
    },
    s5: {
      a: "Copy the ",
      b: "Client ID",
      c: " and the ",
      d: "Client secret",
      e: " and paste them below.",
    },
  },
} satisfies Messages["byo"];
