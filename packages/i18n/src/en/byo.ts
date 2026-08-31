/**
 * The EN catalogue's « byo » slice: « Mes clés » — the BYO form and its three tutorials.
 */
import type { Messages } from "../messages";

export const byo = {
  eyebrow: "MY KEYS",
  connect: "Connect",
  encryptedNote: "Your credentials stay encrypted on this machine.",
  existing:
    "Credentials are already saved on this machine. Leave the fields empty to reuse them, or enter new ones to replace them.",
  onceLead: "Do this once.",
  onceTail: (family, others) =>
    ` The credentials created here will also serve your other ${family} services (${others}) — you won't have to start over.`,
  stepDone: (n) => `Step ${n}: to redo`,
  stepTodo: (n) => `Step ${n}: done`,
  markDone: "Mark this step as done",
  clientId: "Client ID",
  clientSecret: "Client secret",
  keepPlaceholder: "•••• saved — leave empty to keep",
  cancel: "Cancel",
  connecting: "Connecting…",
  keepAndConnect: "Keep and connect",
  noSpaces: "An identifier has no spaces — check the copy-paste.",
  isApiKeyNotClientId:
    "This is an API key, not a client ID. The client ID comes from “Create OAuth client ID”.",
  googleSuffix: "A Google client ID ends with “.apps.googleusercontent.com”.",
  microsoftGuid: "A Microsoft application ID looks like 00000000-0000-0000-0000-000000000000.",
  secretNoSpaces: "A client secret has no spaces — check the copy-paste.",
  secretIsClientId: "This is the client ID — the client secret is the second value.",
  secretPrefixWarn:
    "Google client secrets usually start with “GOCSPX-”. Check that this really is the client secret.",
  microsoft: {
    intro:
      "≈ 3 min. A simple Microsoft Entra app registration, with no secret. Permissions are granted at sign-in.",
    note: "The address “http://127.0.0.1/callback” stays on your computer — the port does not matter, and no secret needs creating.",
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
      e: " — then click “Register”. (You can also add it afterwards in the “Authentication” tab.)",
    },
    s4: {
      a: "On the ",
      b: "“Overview”",
      c: " page, copy the “Application (client) ID” and paste it below — ",
      d: "no secret needed",
    },
  },
  github: {
    intro: "≈ 1 min. No app to get verified, no secret.",
    s1: {
      lead: "Create a GitHub OAuth app: ",
      link: "New OAuth App",
      tail: (brand) =>
        `. Name: “${brand}”; the Homepage / Callback URL fields can be anything (unused in device flow).`,
    },
    s2: { a: "On the app's page, tick ", b: "“Enable Device Flow”", c: ", then save." },
    s3: {
      a: "Copy the ",
      b: "Client ID",
      c: " (top of the page) and paste it below — ",
      d: "no secret needed",
    },
  },
  google: {
    intro:
      "≈ 3 min. Your app in test mode unlocks every feature, with no Google verification or review.",
    note: "The address “127.0.0.1” (your computer) is allowed automatically for a desktop app — nothing to declare.",
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
      e: " (this is what avoids any verification/review).",
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
