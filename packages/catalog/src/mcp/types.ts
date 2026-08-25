/** Transport an MCP connector uses — how the desktop actually connects to it.
 *  - "direct" — desktop-direct OAuth (loopback+PKCE / device flow), tools run
 *    IN-PROCESS in the desktop from `@openmasq/connectors` — NO broker/server.
 *  - "builtin" — shipped WITH the app, no account and no endpoint to configure: the
 *    user just turns it on (today: the controllable browser). It is catalogued so the
 *    Settings grid, the chat suggestion cards and the org policy all name it by the
 *    same id; the actual enable path stays host-side (`host.mcp.enableBrowser`), so a
 *    platform without that capability must filter it out. */
export type McpTransport = "remote" | "stdio" | "broker" | "direct" | "builtin";

/**
 * How a REMOTE connector authenticates:
 *  - "oauth"  — one-click DCR OAuth (the default; login opens in the browser).
 *  - "apikey" — the hosted MCP endpoint takes an API key (usually as a URL query
 *    param, e.g. `?exaApiKey=…`); the user pastes it into the endpoint URL. There is
 *    no one-click login, so the UI labels it "Clé API".
 */
export type McpAuth = "oauth" | "apikey";

/**
 * The CANONICAL, ordered MCP connector categories — the single source shared by the
 * desktop Settings and the org admin console, so both group connectors identically.
 * A connector's `category` is one of these ids; anything unset falls under "Autres".
 */
export interface McpCategory {
  id: string;
  label: string;
}

/** One connector in the unified catalog (display metadata only, never secrets). */
export interface McpConnector {
  id: string;
  name: string;
  desc: string;
  /** Grouping category — one of `MCP_CATEGORIES` (shared admin ⇄ desktop). */
  category?: string;
  /** Highlight tone (design-system hue name), when the source list carried one. */
  tone?: string;
  /** This connector holds FILES in folders — a storage the user browses, not a service
   *  that exposes records. The right rail's « Dossiers » view lists these beside the
   *  granted local folders; Slack or Linear are connectors too, and are not storages.
   *  Single-sourced here (rule 9) so the rail and the admin console can never disagree
   *  on what counts as one. */
  storage?: boolean;
  transport: McpTransport;
  /** Auth mode for a remote connector (default "oauth"). */
  auth?: McpAuth;
  /** Remote Streamable-HTTP endpoint (remote transport only; may be empty). */
  url?: string;
  /**
   * The domains this service addresses its OWN resources on (`notion.com`/`notion.so`,
   * `atlassian.net`, `vercel.app`…) — NOT the MCP endpoint above, which is where we talk
   * to it, not where its links point.
   *
   * ⚠️ This is an ALLOW-list read by the redaction engine (`RedactOptions.
   * structuralUrlHosts`, fed by `send/redactKeep.ts` from what is ACTUALLY connected):
   * inside a link on one of these hosts, the sub-parts stay in clear, because a page id
   * or a `?pvs=1` is that service's addressing and a faked one hands the model a dead
   * link it cannot feed back to the connector. So declare a host ONLY when the service
   * owns it: matching is on the registrable SUFFIX, and a host listed here is exempted
   * for as long as the user keeps that integration connected.
   *
   * Left unset on purpose for the SEARCH/crawl connectors (Exa, Tavily, Firecrawl,
   * Apify, Bright Data): what they return are THIRD-PARTY pages, and exempting an
   * arbitrary browsed URL is exactly what this must not do.
   */
  hosts?: string[];
  /** For `direct` connectors: how the desktop reaches the provider OAuth.
   *  "slack" = via the gateway auth-only fn (no PKCE / HTTPS-only redirect);
   *  "microsoft" = Microsoft identity platform, loopback + PKCE, PUBLIC client. */
  directAuth?: "device" | "pkce" | "slack" | "microsoft";
  /** OAuth scopes requested per credential mode (`direct` connectors). `managed` =
   *  the app's own public client; `byo` = the user's own client. Depuis le
   *  30/07/2026, `managed` ≡ `byo` sur les connecteurs Google (les scopes RESTRICTED
   *  sont demandés sur le client de l'app aussi — la vérification CASA du client est
   *  un prérequis d'ops pour la prod, jamais une raison de brider les capacités). */
  scopes?: { managed: string[]; byo: string[] };
  /** `direct` + `byoOnly`: the connector is offered ONLY in "mes clés" mode — the UI
   *  hides the quick "Connecter" (managed) action. Aucun connecteur ne le porte depuis
   *  le 30/07/2026 ; the machinery stays for a future connector genuinely in that case. */
  byoOnly?: boolean;
  /** WHY the app's own client can't cover this connector — fully (`byoOnly`) or in part.
   *  Set it whenever `byoAdds` is set: the auth chip states this REASON instead of
   *  promising a plain "1-clic, aucun secret". The two reasons are NOT interchangeable:
   *  `casa` = a Google RESTRICTED scope pending the app's CASA assessment; `admin-consent`
   *  = a scope a tenant ADMIN must grant. ⚠️ The second is not a reason to be `byoOnly`
   *  — see `adminConsent` below: an admin can approve the app's multi-tenant client itself.
   *  Reserve this for a connector whose BYO mode genuinely adds something. */
  byoReason?: "casa" | "admin-consent";
  /**
   * The connector's scopes need the TENANT ADMINISTRATOR's approval — but NOT the
   * customer's own app registration. The app's Microsoft client is multi-tenant, so one
   * admin approval covers every member of that organisation and each of them then
   * connects in one click. This is why such a connector is NOT `byoOnly`: telling an
   * organisation to register its own application, when a single admin click would do,
   * turns a five-minute approval into an integration project.
   *
   * The UI states the approval up front (a member who cannot grant it must not discover
   * it as a failure), and the refusal a member hits before it is turned into the link to
   * forward — `apps/desktop/src/main/mcp/connectors/microsoftConsent.ts`.
   */
  adminConsent?: boolean;
  /** What "Mes clés" unlocks that 1-clic cannot, user-facing FR, completing
   *  "Pour …, connectez vos propres clés" (e.g. "lire vos emails"). */
  byoAdds?: string;
  /** The server exposes its many tools behind ONE CLI-style `exec {command}`
   *  meta-tool (PostHog). The app expands the high-value sub-tools DIRECTLY (the
   *  desktop wraps the connection with `wrapExecMeta`), because small models fail
   *  the `exec` CLI and loop. `include` is a name-prefix allow-list of the sub-tools
   *  worth expanding (the long tail stays behind raw `exec`). */
  execMeta?: { include: string[] };
}

/** A short auth badge for a connector — how it actually authenticates. */
export interface McpAuthTag {
  /** `oneclick` | `apikey` | `broker` | `local` | `direct` | `builtin` — for styling/tests. */
  kind: "oneclick" | "apikey" | "broker" | "local" | "direct" | "builtin";
  /** Short FR label shown as a chip. */
  label: string;
  /** Tooltip explaining what the user must provide. */
  title: string;
}
