import type { ReactNode } from "react";
import type { McpConnector } from "@openmasq/catalog/mcp";
import { BRAND } from "@openmasq/branding";
import type { Messages } from "@openmasq/i18n";

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

/** A connector's tutorial, in `t`'s language — the links and the values to paste
 *  stay here (FACTS), every sentence comes from the catalogue (`byo.*`). */
export function guideFor(c: McpConnector, t: Messages): Guide {
  // `directAuth`: "device" = GitHub (client id only), "microsoft" = Microsoft Entra
  // PUBLIC client (client id only, PKCE), "pkce" = Google (id + secret).
  if (c.directAuth === "microsoft") {
    // Microsoft identity platform: a PUBLIC "Mobile and desktop" client — loopback
    // 127.0.0.1 redirect + PKCE, so NO client secret (see main's oauthMicrosoft.ts).
    const g = t.byo.microsoft;
    return {
      needsSecret: false,
      intro: g.intro,
      idPlaceholder: "00000000-0000-0000-0000-000000000000",
      note: g.note,
      steps: [
        <>
          {g.s1.lead}
          <Lnk href={MS.register}>{g.s1.link}</Lnk>.
        </>,
        <>
          {g.s2.a}
          {BRAND.name}
          {g.s2.b}
          <strong>{g.s2.c}</strong>
          {g.s2.d}
        </>,
        <>
          {g.s3.a}
          <strong>{g.s3.b}</strong>
          {g.s3.c}
          <strong>{g.s3.d}</strong>
          {g.s3.e}
        </>,
        <>
          {g.s4.a}
          <strong>{g.s4.b}</strong>
          {g.s4.c}
          <strong>{g.s4.d}</strong>.
        </>,
      ],
    };
  }
  if (c.directAuth === "device") {
    const g = t.byo.github;
    return {
      needsSecret: false,
      intro: g.intro,
      idPlaceholder: "Iv1.a1b2c3d4e5f6…",
      steps: [
        <>
          {g.s1.lead}
          <Lnk href={GH.newApp}>{g.s1.link}</Lnk>
          {g.s1.tail(BRAND.name)}
        </>,
        <>
          {g.s2.a}
          <strong>{g.s2.b}</strong>
          {g.s2.c}
        </>,
        <>
          {g.s3.a}
          <strong>{g.s3.b}</strong>
          {g.s3.c}
          <strong>{g.s3.d}</strong>.
        </>,
      ],
    };
  }
  const g = t.byo.google;
  const apis = googleApis(c.id);
  const multi = apis.length > 1;
  return {
    needsSecret: true,
    intro: g.intro,
    idPlaceholder: "1234-abcd….apps.googleusercontent.com",
    note: g.note,
    steps: [
      <>
        {g.s1.lead}
        <Lnk href={G.newProject}>{g.s1.link}</Lnk>.
      </>,
      <>
        {multi ? g.s2.enableMany : g.s2.enableOne}
        {apis.map((a, i) => (
          <span key={a.href}>
            {i > 0 ? (i === apis.length - 1 ? g.s2.and : ", ") : ""}
            <Lnk href={a.href}>{a.label}</Lnk>
          </span>
        ))}
        {multi ? g.s2.tailMany : g.s2.tailOne}
      </>,
      <>
        {g.s3.a}
        <Lnk href={G.consent}>{g.s3.link}</Lnk>
        {g.s3.b}
        <strong>{g.s3.c}</strong>
        {g.s3.d}
        {g.s3.e}
      </>,
      <>
        {g.s4.a}
        <Lnk href={G.credentials}>{g.s4.link}</Lnk>
        {g.s4.b}
        <strong>{g.s4.c}</strong>
      </>,
      <>
        {g.s5.a}
        <strong>{g.s5.b}</strong>
        {g.s5.c}
        <strong>{g.s5.d}</strong>
        {g.s5.e}
      </>,
    ],
  };
}
