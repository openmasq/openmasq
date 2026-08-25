import type { McpConnector } from "../types";

/**
 * Desktop-direct connectors — OAuth on-device + tools run in-process from
 * `@openmasq/connectors`, NO broker/server. Tool definitions live there; the
 * OAuth flow + token store live in `apps/desktop/src/main/mcp/connectors`.
 */
export const DIRECT: McpConnector[] = [
  {
    id: "github",
    name: "GitHub",
    desc: "Repositories & issues",
    category: "dev",
    tone: "violet",
    transport: "direct",
    hosts: ["github.com"],
    directAuth: "device",
    scopes: { managed: ["repo", "read:user"], byo: ["repo", "read:user"] },
  },
  // ⚠️ Décision produit 30/07/2026 : les scopes Google RESTRICTED (gmail.readonly,
  // drive.readonly) sont désormais demandés sur le client de l'app AUSSI — capacités
  // 1-clic = 100 % des capacités BYO (`managed` ≡ `byo` sur tous les connecteurs
  // Google). CASA n'est PAS une porte dans le code : c'est le prérequis d'OPS pour
  // publier le client en prod (audit sécurité annuel + vérification Google). D'ici
  // là, le client tourne sous le régime « app en test » de Google (écran
  // d'avertissement, testeurs plafonnés, refresh tokens à durée limitée).
  {
    // Loopback + PKCE ("Desktop app" Google client, incremental consent).
    id: "google-calendar",
    name: "Google Agenda",
    desc: "Événements & rendez-vous",
    category: "productivity",
    tone: "sky",
    transport: "direct",
    hosts: ["calendar.google.com"],
    directAuth: "pkce",
    scopes: {
      // `calendar.events` et PAS `auth/calendar` : les deux outils exposés (lister,
      // créer un événement) n'ont besoin que des événements — le scope complet ajoute
      // les ACL, les réglages et la suppression d'agendas, qu'aucun outil n'utilise.
      // Minimisation = ce que l'écran de consentement Google et l'audit CASA vérifient
      // en premier. Une connexion d'AVANT garde son ancien scope jusqu'à reconnexion.
      managed: ["https://www.googleapis.com/auth/calendar.events"],
      byo: ["https://www.googleapis.com/auth/calendar.events"],
    },
  },
  {
    // Merged Gmail (same Google "Desktop app" client). 1-clic (managed) = READ +
    // SEND, comme le byo — les outils restent exposés par scope ACCORDÉ (desktop
    // `run.ts`) : une connexion 1-clic d'AVANT le 30/07 n'a accordé que
    // `gmail.send` et n'offre donc que `send_email` tant qu'elle n'est pas
    // reconnectée (consentement incrémental).
    id: "gmail",
    name: "Gmail",
    desc: "Lire, rechercher et envoyer vos emails",
    category: "productivity",
    tone: "pink",
    transport: "direct",
    hosts: ["mail.google.com"],
    directAuth: "pkce",
    scopes: {
      managed: [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.send",
      ],
      byo: [
        "https://www.googleapis.com/auth/gmail.readonly",
        "https://www.googleapis.com/auth/gmail.send",
      ],
    },
  },
  {
    id: "google-drive",
    name: "Google Drive",
    desc: "Rechercher, lire et déposer des fichiers Drive",
    category: "data",
    tone: "sky",
    storage: true,
    transport: "direct",
    hosts: ["drive.google.com"],
    directAuth: "pkce",
    scopes: {
      // + `drive.file` (NON sensible) : l'écriture sans élargir la surface restreinte —
      // l'app ne crée/retouche que SES fichiers. Parité avec la maison OAuth
      // (`@openmasq/connectors` drive.ts) tenue par `scopesParity.test.ts`.
      managed: ["https://www.googleapis.com/auth/drive.readonly", "https://www.googleapis.com/auth/drive.file"],
      byo: ["https://www.googleapis.com/auth/drive.readonly", "https://www.googleapis.com/auth/drive.file"],
    },
  },
  {
    // Google Docs — loopback + PKCE on the shared Google "Desktop app" client.
    // `documents` is sensitive (brand verification) but NOT restricted → no CASA.
    id: "google-docs",
    name: "Google Docs",
    desc: "Créer, lire et compléter vos documents Google Docs",
    category: "productivity",
    tone: "sky",
    transport: "direct",
    hosts: ["docs.google.com"],
    directAuth: "pkce",
    scopes: {
      managed: ["https://www.googleapis.com/auth/documents"],
      byo: ["https://www.googleapis.com/auth/documents"],
    },
  },
  {
    // Google Sheets — same shared Google client. `spreadsheets` is sensitive but
    // NOT restricted → no CASA.
    id: "google-sheets",
    name: "Google Sheets",
    desc: "Lire des plages, ajouter des lignes et créer des classeurs",
    category: "productivity",
    tone: "mint",
    transport: "direct",
    hosts: ["docs.google.com"],
    directAuth: "pkce",
    scopes: {
      managed: ["https://www.googleapis.com/auth/spreadsheets"],
      byo: ["https://www.googleapis.com/auth/spreadsheets"],
    },
  },
  {
    // Google Tasks — same shared Google client. `tasks` is sensitive but NOT
    // restricted → no CASA.
    id: "google-tasks",
    name: "Google Tasks",
    desc: "Lister, créer et terminer vos tâches",
    category: "productivity",
    tone: "amber",
    transport: "direct",
    directAuth: "pkce",
    scopes: {
      managed: ["https://www.googleapis.com/auth/tasks"],
      byo: ["https://www.googleapis.com/auth/tasks"],
    },
  },
  {
    // Google Analytics (GA4) — read-only. `analytics.readonly` is sensitive but NOT
    // restricted → no CASA. Same shared Google client.
    id: "google-analytics",
    name: "Google Analytics",
    desc: "Propriétés GA4 & rapports de trafic (lecture)",
    category: "data",
    tone: "violet",
    transport: "direct",
    hosts: ["analytics.google.com"],
    directAuth: "pkce",
    scopes: {
      managed: ["https://www.googleapis.com/auth/analytics.readonly"],
      byo: ["https://www.googleapis.com/auth/analytics.readonly"],
    },
  },
  {
    // Microsoft identity platform — loopback + PKCE, PUBLIC client (no secret),
    // shared "microsoft" cred group. Outlook uses DELEGATED user scopes (no admin
    // consent) → 1-clic works.
    id: "microsoft-outlook",
    name: "Outlook",
    desc: "Rechercher, lire et envoyer des emails Outlook",
    category: "productivity",
    tone: "violet",
    transport: "direct",
    hosts: ["outlook.office.com", "outlook.office365.com", "outlook.live.com"],
    directAuth: "microsoft",
    scopes: { managed: ["Mail.Read", "Mail.Send"], byo: ["Mail.Read", "Mail.Send"] },
  },
  {
    // OneDrive (personal drive). `Files.Read` is delegated (no admin consent) →
    // 1-clic; byo widens to `Files.Read.All`.
    id: "microsoft-onedrive",
    name: "OneDrive",
    desc: "Rechercher et lire vos fichiers OneDrive",
    category: "data",
    tone: "sky",
    storage: true,
    transport: "direct",
    hosts: ["onedrive.live.com", "1drv.ms"],
    directAuth: "microsoft",
    scopes: { managed: ["Files.Read"], byo: ["Files.Read.All"] },
  },
  {
    // SharePoint — `Sites.Read.All`/`Files.Read.All` need ADMIN CONSENT. That is NOT the
    // same as needing the customer's own app registration: the platform's Microsoft app is
    // MULTI-TENANT (`/common`), so an administrator approves it ONCE for the whole
    // organisation and every member then connects in one click. The refusal a member hits
    // before that approval is turned into the link to forward
    // (`main/mcp/connectors/microsoftConsent.ts`). BYO stays available for an org that
    // would rather hold its own registration.
    id: "microsoft-sharepoint",
    name: "SharePoint",
    desc: "Rechercher et lire vos sites et bibliothèques SharePoint",
    category: "data",
    tone: "sky",
    transport: "direct",
    hosts: ["sharepoint.com"],
    directAuth: "microsoft",
    adminConsent: true,
    scopes: {
      managed: ["Sites.Read.All", "Files.Read.All"],
      byo: ["Sites.Read.All", "Files.Read.All"],
    },
  },
  {
    // Microsoft Teams — of the four scopes, only `ChannelMessage.Read.All` (reading a
    // channel's history) is admin-only; listing teams/channels and POSTING are ordinary
    // delegated scopes. They are requested TOGETHER, so the connector as a whole needs the
    // tenant admin's one-off approval of the platform's multi-tenant app — not the customer's own
    // keys. ⚠️ Channel-oriented on purpose (`/teams/…/channels/…`): the user's own CHATS
    // would need `Chat.*` instead, which needs no admin — a separate connector if we ever
    // want a Teams that connects with no approval at all.
    id: "microsoft-teams",
    name: "Microsoft Teams",
    desc: "Équipes, canaux et messages Teams",
    category: "productivity",
    tone: "violet",
    transport: "direct",
    hosts: ["teams.microsoft.com"],
    directAuth: "microsoft",
    adminConsent: true,
    scopes: {
      managed: ["Team.ReadBasic.All", "Channel.ReadBasic.All", "ChannelMessage.Read.All", "ChannelMessage.Send"],
      byo: ["Team.ReadBasic.All", "Channel.ReadBasic.All", "ChannelMessage.Read.All", "ChannelMessage.Send"],
    },
  },
  {
    // Slack (no PKCE, HTTPS-only redirect) → the gateway auth-only fn holds the
    // secret. 1-clic only for now (BYO would need the user's secret at the
    // exchange, which the gateway doesn't hold) — no CASA either way.
    id: "slack",
    name: "Slack",
    desc: "Lister les canaux et lire les messages récents",
    category: "productivity",
    tone: "violet",
    transport: "direct",
    hosts: ["slack.com"],
    directAuth: "slack",
    scopes: {
      managed: ["channels:read", "channels:history", "groups:read", "groups:history", "users:read"],
      byo: ["channels:read", "channels:history", "groups:read", "groups:history", "users:read"],
    },
  },
];
