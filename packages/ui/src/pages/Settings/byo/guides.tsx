import type { ReactNode } from "react";
import type { McpConnector } from "@openmasq/catalog/mcp";
import { BRAND } from "@openmasq/branding";

/**
 * The per-provider walkthrough shown in the "Mes clés" modal: a DIRECT link at each
 * step (deep-linked to the exact provider page), the literal label to click in bold,
 * and the shape of what to paste.
 *
 * ⚠️ **No screenshots, on purpose.** These consoles are redesigned several times a
 * year and render in the language of the PROVIDER's account, not the app's — a stale
 * screenshot sends the user hunting for a button that moved, which is worse than no
 * picture at all. A deep link plus the exact label ages far better, and is repairable
 * in one line when it does drift.
 */

/** An inline "open in a new tab" link — one per step, deep-linked. */
function Lnk({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a className="byo-link" href={href} target="_blank" rel="noreferrer">
      {children} ↗
    </a>
  );
}

const GH = { newApp: "https://github.com/settings/applications/new" };
const LIB = "https://console.cloud.google.com/apis/library";
const G = {
  newProject: "https://console.cloud.google.com/projectcreate",
  consent: "https://console.cloud.google.com/apis/credentials/consent",
  credentials: "https://console.cloud.google.com/apis/credentials",
  calendarApi: `${LIB}/calendar-json.googleapis.com`,
  gmailApi: `${LIB}/gmail.googleapis.com`,
  driveApi: `${LIB}/drive.googleapis.com`,
  docsApi: `${LIB}/docs.googleapis.com`,
  sheetsApi: `${LIB}/sheets.googleapis.com`,
  tasksApi: `${LIB}/tasks.googleapis.com`,
  analyticsAdminApi: `${LIB}/analyticsadmin.googleapis.com`,
  analyticsDataApi: `${LIB}/analyticsdata.googleapis.com`,
};
const MS = {
  // Deep-link straight to the Entra "Register an application" blade.
  register:
    "https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/CreateApplicationBlade/quickStartType~/null/isMSAApp~/false",
};

/** The Google API(s) to enable for a connector: each = library link + display name.
 *  (An id may be a multi-account instance like `google-analytics--a1b2`, so match on
 *  the PREFIX.) Analytics needs BOTH the Admin API (list GA4 properties) and the Data
 *  API (run reports) — see `@openmasq/connectors` `google/analytics.ts`. */
function googleApis(id: string): { href: string; label: string }[] {
  if (id.startsWith("gmail")) return [{ href: G.gmailApi, label: "Gmail API" }];
  if (id.startsWith("google-drive")) return [{ href: G.driveApi, label: "Google Drive API" }];
  if (id.startsWith("google-docs")) return [{ href: G.docsApi, label: "Google Docs API" }];
  if (id.startsWith("google-sheets")) return [{ href: G.sheetsApi, label: "Google Sheets API" }];
  if (id.startsWith("google-tasks")) return [{ href: G.tasksApi, label: "Google Tasks API" }];
  if (id.startsWith("google-analytics"))
    return [
      { href: G.analyticsAdminApi, label: "Google Analytics Admin API" },
      { href: G.analyticsDataApi, label: "Google Analytics Data API" },
    ];
  return [{ href: G.calendarApi, label: "Google Calendar API" }]; // google-calendar
}

export interface Guide {
  needsSecret: boolean;
  intro: string;
  steps: ReactNode[];
  note?: string;
  idPlaceholder: string;
}

export function guideFor(c: McpConnector): Guide {
  // `directAuth`: "device" = GitHub (client id only), "microsoft" = Microsoft Entra
  // PUBLIC client (client id only, PKCE), "pkce" = Google (id + secret).
  if (c.directAuth === "microsoft") {
    // Microsoft identity platform: a PUBLIC "Mobile and desktop" client — loopback
    // 127.0.0.1 redirect + PKCE, so NO client secret (see main's oauthMicrosoft.ts).
    return {
      needsSecret: false,
      intro:
        "≈ 3 min. Une simple inscription d'application Microsoft Entra, sans code secret. Les autorisations sont accordées au moment de la connexion.",
      idPlaceholder: "00000000-0000-0000-0000-000000000000",
      note: "L'adresse « http://127.0.0.1/callback » reste sur votre ordinateur — le port n'a pas d'importance, et aucun code secret n'est à créer.",
      steps: [
        <>
          Ouvrez le portail Microsoft Entra : <Lnk href={MS.register}>Inscrire une application</Lnk>.
        </>,
        <>
          Nommez-la « {BRAND.name} », puis sous <strong>« Types de comptes pris en charge »</strong>{" "}
          choisissez <strong>« Comptes dans un annuaire organisationnel quelconque et comptes
          Microsoft personnels »</strong> (pour les comptes pro comme Outlook.com).
        </>,
        <>
          Sous <strong>« URI de redirection »</strong>, sélectionnez la plateforme{" "}
          <strong>« Applications de bureau et mobiles »</strong> et saisissez{" "}
          <strong>http://127.0.0.1/callback</strong> — puis cliquez sur « S'inscrire ». (Vous
          pouvez aussi l'ajouter ensuite dans l'onglet « Authentification ».)
        </>,
        <>
          Sur la page <strong>« Vue d'ensemble »</strong>, copiez l'
          <strong>« ID d'application (client) »</strong> et collez-le ci-dessous —{" "}
          <strong>aucun secret nécessaire</strong>.
        </>,
      ],
    };
  }
  if (c.directAuth === "device") {
    return {
      needsSecret: false,
      intro: "≈ 1 min. Aucune application à faire vérifier, aucun code secret.",
      idPlaceholder: "Iv1.a1b2c3d4e5f6…",
      steps: [
        <>
          Créez une app OAuth GitHub : <Lnk href={GH.newApp}>Nouvelle OAuth App</Lnk>. Nom :
          « {BRAND.name} » ; les champs Homepage / Callback URL peuvent être n'importe quoi (inutilisés
          en device flow).
        </>,
        <>
          Sur la page de l'app, cochez <strong>« Enable Device Flow »</strong>, puis
          enregistrez.
        </>,
        <>
          Copiez le <strong>Client ID</strong> (en haut de la page) et collez-le ci-dessous —{" "}
          <strong>aucun secret nécessaire</strong>.
        </>,
      ],
    };
  }
  const apis = googleApis(c.id);
  const multi = apis.length > 1;
  return {
    needsSecret: true,
    intro:
      "≈ 3 min. Votre application en mode test débloque toutes les fonctionnalités, sans vérification ni contrôle de Google.",
    idPlaceholder: "1234-abcd….apps.googleusercontent.com",
    note: "L'adresse « 127.0.0.1 » (votre ordinateur) est autorisée automatiquement pour une application de bureau — rien à déclarer.",
    steps: [
      <>
        Créez ou choisissez un projet : <Lnk href={G.newProject}>Nouveau projet Google Cloud</Lnk>.
      </>,
      <>
        {multi ? "Activez les API : " : "Activez l'API : "}
        {apis.map((a, i) => (
          <span key={a.href}>
            {i > 0 ? (i === apis.length - 1 ? " et " : ", ") : ""}
            <Lnk href={a.href}>{a.label}</Lnk>
          </span>
        ))}
        {multi ? " → bouton « Activer » pour chacune." : " → bouton « Activer »."}
      </>,
      <>
        Ouvrez l'<Lnk href={G.consent}>écran de consentement OAuth</Lnk> → type{" "}
        <strong>« Externe »</strong>, puis dans <strong>« Utilisateurs test »</strong> ajoutez
        votre adresse Google (c'est ce qui évite toute vérification/audit).
      </>,
      <>
        Créez les identifiants : <Lnk href={G.credentials}>Créer un ID client OAuth</Lnk> → type
        d'application <strong>« Application de bureau »</strong>.
      </>,
      <>
        Copiez l'<strong>ID client</strong> et le <strong>Code secret du client</strong> et
        collez-les ci-dessous.
      </>,
    ],
  };
}
