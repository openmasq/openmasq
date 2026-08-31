import type { Messages } from "@openmasq/i18n";
import { MCP_CONNECTORS, type McpConnector } from "@openmasq/catalog/mcp";

/**
 * The pure half of the "Mes clés" (BYO) form: which services share one client, and
 * whether what the user pasted can possibly be the right value.
 *
 * Everything keys on the connector's own `directAuth`, never on a second id list —
 * the desktop already groups shared BYO credentials (`credGroupOf`), and a copy of
 * that regex here would be exactly the drift-prone duplicate root rule 9 forbids. `guides.tsx`
 * switches on the same field, so the guide, the sharing note and the validation can
 * never describe three different things.
 */

export type DirectAuth = NonNullable<McpConnector["directAuth"]>;

/** A problem with a pasted value. `error` blocks the submit; `warn` only explains —
 *  a shape we merely EXPECT (an older Google secret format) must never lock the user
 *  out of their own credentials. */
export interface FieldIssue {
  level: "error" | "warn";
  message: string;
}

/**
 * The other connectors that will reuse this same client once it is set — the fact
 * that turns "3 minutes per service" into "3 minutes once, for all of them", and the
 * single cheapest thing this modal can say. Read from the catalog, so a new Google
 * connector joins the sentence by existing.
 *
 * Empty for the auth styles whose credentials are per-connector (GitHub) or that have
 * no BYO form at all.
 */
export function sharedServices(connector: McpConnector): string[] {
  const auth = connector.directAuth;
  if (auth !== "pkce" && auth !== "microsoft") return [];
  return MCP_CONNECTORS.filter((c) => c.directAuth === auth && c.id !== connector.id).map(
    (c) => c.name,
  );
}

/** The family name to use in that sentence. */
export function familyLabel(auth: DirectAuth | undefined): string {
  return auth === "pkce" ? "Google" : auth === "microsoft" ? "Microsoft" : "";
}

const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * What is wrong with the pasted CLIENT ID, if anything.
 *
 * The errors are the ones a shape can PROVE: a Google client id always ends in
 * `.apps.googleusercontent.com` (so a pasted project id, or an `AIza…` API key —
 * the two classic mix-ups — are caught the moment they land), and a Microsoft
 * application id is always a GUID. Everything else warns at most: refusing a value
 * we merely don't recognise would be worse than the 403 it might avoid.
 */
export function clientIdIssue(
  auth: DirectAuth | undefined,
  raw: string,
  t: Messages,
): FieldIssue | undefined {
  const v = raw.trim();
  if (!v) return undefined;
  if (/\s/.test(v)) return { level: "error", message: t.byo.noSpaces };
  if (auth === "pkce") {
    if (v.startsWith("AIza"))
      return {
        level: "error",
        message: t.byo.isApiKeyNotClientId,
      };
    if (!v.endsWith(".apps.googleusercontent.com"))
      return {
        level: "error",
        message: t.byo.googleSuffix,
      };
  }
  if (auth === "microsoft" && !GUID.test(v))
    return {
      level: "error",
      message: t.byo.microsoftGuid,
    };
  return undefined;
}

/** What is wrong with the pasted CLIENT SECRET, if anything. Google's current secrets
 *  start with `GOCSPX-`, but clients created years ago do not — so this can only ever
 *  WARN, never block. */
export function clientSecretIssue(
  auth: DirectAuth | undefined,
  raw: string,
  t: Messages,
): FieldIssue | undefined {
  const v = raw.trim();
  if (!v) return undefined;
  if (/\s/.test(v)) return { level: "error", message: t.byo.secretNoSpaces };
  if (v.endsWith(".apps.googleusercontent.com"))
    return { level: "error", message: t.byo.secretIsClientId };
  if (auth === "pkce" && !v.startsWith("GOCSPX-"))
    return {
      level: "warn",
      message: t.byo.secretPrefixWarn,
    };
  return undefined;
}

/** Does an issue block the submit? */
export function blocks(issue: FieldIssue | undefined): boolean {
  return issue?.level === "error";
}
