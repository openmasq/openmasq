import { connectorIdFromInstance, findConnector, type McpConnector } from "@openmasq/catalog/mcp";
import { MAX_SUGGESTIONS } from "./suggestIntegrations";
import { matchStrength, normalise, servedBy } from "./integrationRelevance";

/**
 * **Which not-connected integration would unblock THIS request** — computed by us, not
 * asked of the model.
 *
 * `suggest_integrations` already renders connect cards, but only if the model chooses to
 * call it, and a weak model does not: asked to review a Gmail inbox with no Gmail
 * connected, it reached for the web page reader, failed, and told the user in prose to
 * connect Gmail — three turns to arrive at a card we could have shown before the first
 * one (journal du 02/08/2026). Everything here is deterministic, so the proposal no
 * longer depends on the model being good.
 *
 * Local by construction: it reads the user's own text in the renderer and emits catalog
 * IDS. Nothing here reaches the wire.
 */

/**
 * The candidates the request asks for STRONGLY — the judgement is `integrationRelevance.ts`
 * (brand in a service position, a tight alias, or an imperative only that tool honours).
 * Ordered as the catalog orders them and capped like any other suggestion set
 * (`MAX_SUGGESTIONS`): two cards is already the point at which a proposal reads as noise.
 *
 * ⚠️ **A NEED already served by a connected connector proposes nothing** (`connected`).
 * The aliases are per-SERVICE but the need is not: « mes e-mails » claims both `gmail`
 * and `microsoft-outlook`, so a user with Gmail connected, asking to review their inbox,
 * was offered Outlook — a card for a second mailbox they never asked for, under an
 * answer that had just read the first (journal du 03/08/2026). Suppression is scoped to
 * the GENERIC match: naming the brand (« sur Outlook ») is an explicit ask and still
 * proposes, whatever else is connected.
 */
export function connectorsForRequest(
  text: string,
  candidates: McpConnector[],
  connected: readonly McpConnector[] = [],
): McpConnector[] {
  if (!text.trim()) return [];
  const hay = normalise(text);
  const served = servedBy(connected);
  const out: McpConnector[] = [];
  for (const c of candidates) {
    if (matchStrength(hay, c, served)) out.push(c);
    if (out.length >= MAX_SUGGESTIONS) break;
  }
  return out;
}

/**
 * What a WORKFLOW's declared connectors are missing, and whether that leaves it unable to
 * do anything at all.
 *
 * This one needs no matching — the routine STATES what it needs (`Workflow.servers`), so
 * the answer exists before the first model call. It is the difference between telling the
 * user « connectez Gmail » straight away and spending a turn discovering it. `unusable` =
 * every declared connector is missing: nothing the model does can succeed, so the loop
 * says so rather than letting it improvise.
 */
export function scopePreflight(
  declared: readonly string[] | undefined,
  connected: ReadonlySet<string>,
): { missing: string[]; unusable: boolean } {
  const ids: string[] = [];
  for (const raw of declared ?? []) {
    const id = connectorIdFromInstance(String(raw ?? "").trim());
    if (id && !ids.includes(id)) ids.push(id);
  }
  const missing = ids.filter((id) => !connected.has(id));
  return { missing, unusable: missing.length > 0 && missing.length === ids.length };
}

/**
 * What to say when a workflow's connectors are ALL missing — a real failure, told plainly
 * (« Surface real failures »): what is needed, why nothing ran, and that the cards under
 * the message are the way out. Never an apology, never an attempt to answer anyway.
 *
 * Wire-safe: connector NAMES only, no request content.
 */
export function missingConnectorMessage(ids: readonly string[]): string {
  const names = ids.map((id) => findConnector(id)?.name ?? id);
  const list = names.length === 1 ? `« ${names[0]} »` : names.map((n) => `« ${n} »`).join(", ");
  const need = names.length === 1 ? "Cette intégration n'est pas connectée" : "Ces intégrations ne sont pas connectées";
  return (
    `${need} : ${list}. Je n'ai donc lancé aucune action — sans elle${names.length > 1 ? "s" : ""}, ` +
    `je n'ai aucun accès à ces données.\n\nConnectez-la${names.length > 1 ? "s" : ""} avec le bouton ci-dessous, ` +
    `puis relancez : je reprendrai la demande telle quelle.`
  );
}
